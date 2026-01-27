import { useChat } from "@ai-sdk/react"
import { useNavigate } from "@tanstack/react-router"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type TextUIPart,
  type ToolUIPart,
  type UIMessage
} from "ai"
import { AtomIcon, CircleIcon, GlobeIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageContent,
  MessageResponse
} from "@/components/ai-elements/message"
import {
  AssistantMessageActionsBar,
  UserMessageActionsBar
} from "@/components/ai-elements/message-actions-bar"
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputTextareaHandle,
  PromptInputTools
} from "@/components/ai-elements/prompt-input"
import {
  ReasoningSegment,
  ReasoningSegmentContent,
  ThinkingProcess,
  ThinkingProcessCompletion,
  ThinkingProcessContent,
  ThinkingProcessTrigger
} from "@/components/ai-elements/thinking-process"
import {
  ToolCallsContainer,
  ToolCallsContainerTrigger,
  ToolCallsList
} from "@/components/ai-elements/tool-calls-container"
import { SelectModel } from "@/components/select-model"
import { ToolButton } from "@/components/tool-button"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAvailableModels } from "@/hooks/use-available-models"
import { useChatStorage } from "@/hooks/use-chat-storage"
import { useLatest } from "@/hooks/use-latest"
import { useSetting } from "@/hooks/use-settings-store"
import {
  useMessageConstants,
  useToastConstants,
  useToolButtonConstants,
  useToolConstants,
  useTooltipConstants
} from "@/lib/constants"
import { getToolResultText } from "@/lib/tool-helpers"
import { cn } from "@/lib/utils"
import type { ChatId, MessageId } from "@/types/chat"

interface AppChatProps {
  activeChatId?: ChatId | null
  onChatCreated?: (chatId: ChatId) => void
}

interface StepSegment {
  type: "step-start" | "reasoning" | "tool"
  partIndex: number
  reasoning?: { text: string; isStreaming: boolean }
  tool?: { type: string; state?: string; [key: string]: unknown }
}

const AppChat = ({ activeChatId, onChatCreated }: AppChatProps) => {
  const { t } = useTranslation(["common", "chat"])
  const navigate = useNavigate({ from: "/" })
  const messageConstants = useMessageConstants()
  const toastConstants = useToastConstants()
  const toolConstants = useToolConstants()
  const toolButtonConstants = useToolButtonConstants()
  const tooltipConstants = useTooltipConstants()

  // Get available models dynamically
  const { availableModels } = useAvailableModels()

  // Settings from store
  const [selectedModelApiId, setSelectedModelApiId] = useSetting("selectedModelApiId")
  const [useWebSearch, setUseWebSearch] = useSetting("webSearchEnabled")
  const [webSearchMode, setWebSearchMode] = useSetting("webSearchMode")
  const [useDeepThink, setUseDeepThink] = useSetting("deepThinkEnabled")

  // Find the selected model from the api_id
  const selectedModel =
    availableModels.find(m => m.api_id === selectedModelApiId) || availableModels[0]

  // Local UI state (responsive, not persisted)
  const [isCondensed, setIsCondensed] = useState(false)
  const [input, setInput] = useState("")
  const selectedModelRef = useLatest(selectedModel)
  const useWebSearchRef = useLatest(useWebSearch)
  const webSearchModeRef = useLatest(webSearchMode)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<PromptInputTextareaHandle>(null)
  const thinkingDurationsRef = useRef<Map<MessageId, number>>(new Map())
  const messagesRef = useRef<UIMessage[]>([])
  const storedMessageIdsRef = useRef<Set<MessageId>>(new Set())
  const currentChatIdRef = useRef<ChatId | null>(activeChatId)

  const { isCompact, open } = useSidebar()
  const { createChat, loadMessages, saveChatAllMessages } = useChatStorage()

  const {
    status,
    messages,
    error,
    clearError,
    setMessages,
    sendMessage,
    addToolApprovalResponse,
    regenerate,
    stop
  } = useChat({
    transport: new DefaultChatTransport({
      api: `http://localhost:${__SIDECAR_PORT__}/api/chat`,
      headers: () => ({
        "X-Model-Provider": selectedModelRef.current.provider,
        "X-Model-Id": selectedModelRef.current.api_id,
        "X-Use-Web-Search": useWebSearchRef.current.toString(),
        "X-Web-Search-Mode": webSearchModeRef.current
      })
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ messages, isAbort, isDisconnect, isError }) => {
      if (isError) {
        return
      }
      saveAllMessagesAsync(messages, { isAbort, isDisconnect, isError })
    },
    onError: error => {
      // Check if this is a 401 error (API key not configured)
      if (error.message.includes("API key not configured") || error.message.includes("401")) {
        toast.error(toastConstants.error, {
          description: toastConstants.apiKeyNotConfigured
        })
      } else {
        toast.error(toastConstants.error, {
          description: error.message
        })
      }
    }
  })

  const cleanupChatState = useCallback(() => {
    currentChatIdRef.current = null
    messagesRef.current = []
    storedMessageIdsRef.current = new Set()
    setMessages?.([])
  }, [setMessages])

  const createNewChatAsync = useCallback(
    async (title?: string): Promise<ChatId> => {
      const newChatId = await createChat(title)
      onChatCreated?.(newChatId)
      return newChatId
    },
    [createChat, onChatCreated]
  )

  const saveAllMessagesAsync = useCallback(
    async (
      allMessages: UIMessage[],
      options?: { isAbort?: boolean; isDisconnect?: boolean; isError?: boolean }
    ) => {
      if (!allMessages || allMessages.length === 0) {
        return
      }
      const allMessagesWithMetadata = allMessages.map(msg => {
        const cachedDuration = thinkingDurationsRef.current.get(msg.id)
        if (cachedDuration !== undefined && msg.role === "assistant") {
          return {
            ...msg,
            metadata: {
              ...(msg.metadata || {}),
              thinkingDuration: cachedDuration
            }
          }
        }
        return msg
      })
      let chatId = currentChatIdRef.current
      if (!chatId) {
        const title = allMessages[0].parts.find(part => part.type === "text")?.text
        const newChatId = await createNewChatAsync(title)
        chatId = newChatId
        currentChatIdRef.current = newChatId
      }
      const lastMessage = allMessagesWithMetadata[allMessagesWithMetadata.length - 1]
      if (
        lastMessage.role === "assistant" &&
        (options?.isAbort || options?.isDisconnect || options?.isError)
      ) {
        lastMessage.metadata = {
          ...(lastMessage.metadata || {}),
          ...(options || {})
        }
        if (options?.isAbort) {
          // clean tool parts if aborted, otherwise it may crashed the next request
          lastMessage.parts = lastMessage.parts.filter(part => !part.type.startsWith("tool-"))
          if (lastMessage.parts.filter(part => part.type === "text").length === 0) {
            // update text if no parts text
            lastMessage.parts.push({
              type: "text",
              text: messageConstants.abortedMessage
            } as TextUIPart)
          }
          setMessages?.(allMessagesWithMetadata)
        }
      }
      await saveChatAllMessages(chatId, allMessagesWithMetadata)
      for (const msg of allMessages) {
        storedMessageIdsRef.current.add(msg.id)
      }
    },
    [createNewChatAsync, saveChatAllMessages, setMessages, messageConstants.abortedMessage]
  )

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (error && lastMessage?.parts.length === 0) {
      lastMessage.parts = [
        {
          type: "text",
          text: error?.message
        } as TextUIPart
      ]
      const messagesWithError = messages.slice(0, -1).concat([lastMessage])
      setMessages(messagesWithError)
      saveAllMessagesAsync(messagesWithError)
      clearError()
    }
  }, [error, messages, setMessages, saveAllMessagesAsync, clearError])

  useEffect(() => {
    const el = inputContainerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      // show only input menu icons without text label, like Web Search
      setIsCondensed(entry.contentRect.width < 448)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Load messages when activeChat changes
  useEffect(() => {
    const changeActiveChat = async () => {
      if (activeChatId) {
        try {
          const msgs = await loadMessages(activeChatId)
          if (
            activeChatId === currentChatIdRef.current &&
            messagesRef.current.length >= msgs.length
          ) {
            return
          }
          messagesRef.current = msgs
          storedMessageIdsRef.current = new Set(msgs.map(m => m.id))
          setMessages?.(msgs ?? [])
        } catch (error) {
          cleanupChatState()
          console.error("[AppChat] Failed to load chat messages:", error)
        } finally {
          currentChatIdRef.current = activeChatId
        }
      } else {
        // Start a new chat
        cleanupChatState()
      }
    }

    changeActiveChat()
  }, [activeChatId, loadMessages, setMessages, cleanupChatState])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text)
    const hasAttachments = Boolean(message.files?.length)
    if (!(hasText || hasAttachments)) {
      return
    }
    // Check if there are available models
    if (!availableModels || availableModels.length === 0) {
      toast.error(t("chat:model.noModelsConfigured"), {
        description: t("chat:model.pleaseConfigureApiKey"),
        action: {
          label: t("chat:model.configureModels"),
          onClick: () =>
            navigate({
              to: "/settings",
              search: {
                tab: "providers"
              }
            })
        }
      })
      return
    }
    if (message.files?.length) {
      toast.success(toastConstants.filesAttached, {
        description: toastConstants.filesAttachedDescription(message.files.length)
      })
    }
    if (message.text) {
      sendMessage({ text: message.text })
      setInput("")
      textareaRef.current?.resetHeight()
    }
  }

  const handleStop = () => {
    if (isStreaming) {
      stop()
    }
  }

  const isStreaming = status === "streaming"
  const isSubmitDisabled = isStreaming ? false : !input.trim() || status !== "ready"
  const submitTooltip = isStreaming ? tooltipConstants.stop : tooltipConstants.submit

  // Loading before reply from assistant
  const lastMessage = messages[messages.length - 1]
  const isAwaitingAssistantReply =
    (status === "submitted" && lastMessage?.role === "user") ||
    ((status === "streaming" || status === "error") && lastMessage?.parts.length === 0)

  return (
    <div className="flex h-full flex-col">
      {/* Top */}
      <div className="bg-background flex h-13 items-center border-b-[0.5px] pt-0">
        <div
          className={cn(
            "fixed left-10 flex z-50 items-center justify-center pointer-events-auto gap-1.25",
            !isCompact && open ? "left-66.75" : "left-43",
            "transition-left duration-300 ease"
          )}
        >
          <SelectModel
            value={selectedModel}
            onChange={model => setSelectedModelApiId(model.api_id)}
          />
        </div>
      </div>

      {/* Middle */}
      <div className="flex-1 min-h-0">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map((message, index) => {
              const messageText = message.parts
                .filter(part => part.type === "text")
                .map(part => part.text)
                .join("")
              const metadata = message.metadata as
                | {
                    totalUsage?: {
                      inputTokens: number
                      outputTokens: number
                      totalTokens: number
                    }
                    thinkingDuration?: number
                  }
                | undefined
              const isLastMessage = index === messages.length - 1
              const isCurrentlyStreaming = status === "streaming" && isLastMessage
              const lastPart = message.parts[message.parts.length - 1]
              const isThinkingStreaming =
                isCurrentlyStreaming &&
                (lastPart?.type === "reasoning" ||
                  lastPart?.type === "step-start" ||
                  lastPart?.type.startsWith("tool-"))
              const steps: StepSegment[][] = []
              let currentStep: StepSegment[] = []

              message.parts.forEach((part, partIndex) => {
                if (part.type === "step-start") {
                  // Start a new step
                  if (currentStep.length > 0) {
                    steps.push(currentStep)
                    currentStep = [
                      {
                        type: "step-start",
                        partIndex
                      }
                    ]
                  }
                } else if (part.type === "reasoning") {
                  const isReasoningStreaming =
                    isThinkingStreaming && partIndex === message.parts.length - 1
                  currentStep.push({
                    type: "reasoning",
                    partIndex,
                    reasoning: { text: part.text, isStreaming: isReasoningStreaming }
                  })
                } else if (part.type.startsWith("tool-")) {
                  currentStep.push({
                    type: "tool",
                    partIndex,
                    tool: part
                  })
                }
              })
              // Add the last step
              if (currentStep.length > 0) {
                steps.push(currentStep)
              }

              const hasThinkingProcess =
                steps.length > 0 &&
                steps.some(step =>
                  step.some(segment => segment.type === "reasoning" || segment.type === "tool")
                )
              const lastStepInStep = currentStep.at(-1)
              // Check if thinking process is complete (all reasoning and tools are done)
              const isThinkingComplete =
                lastStepInStep?.type === "reasoning" && !lastStepInStep.reasoning?.isStreaming
              // Collect tool information for detailed container (show as soon as there are tool calls)
              const toolParts = message.parts.filter((part): part is ToolUIPart =>
                part.type.startsWith("tool-")
              )
              const toolNames = toolParts.map(part => {
                const toolType = part.type.replace("tool-", "")
                return toolType // Direct display, tool names are not translated
              })
              const hasTools = toolParts.length > 0
              const isUserMessage = message.role === "user"
              const isAssistantMessage = message.role === "assistant"

              return (
                <MessageBranch defaultBranch={0} key={message.id}>
                  <MessageBranchContent>
                    <Message from={message.role} key={message.id}>
                      {/* Thinking Process - organized by steps */}
                      {isAssistantMessage && hasThinkingProcess && (
                        <ThinkingProcess
                          isStreaming={isThinkingStreaming}
                          defaultOpen={isThinkingStreaming}
                          totalDuration={
                            metadata?.thinkingDuration ??
                            thinkingDurationsRef.current.get(message.id)
                          }
                          onTotalDurationChange={duration => {
                            thinkingDurationsRef.current.set(message.id, duration)
                          }}
                        >
                          <ThinkingProcessTrigger />
                          <ThinkingProcessContent>
                            {steps.map(step => {
                              // Process all segments in this step
                              return step.map(segment => {
                                if (segment.type === "reasoning") {
                                  return (
                                    <ReasoningSegment
                                      key={`reasoning-${message.id}-${segment.partIndex}`}
                                      toolType="reasoning"
                                      isStreaming={segment.reasoning?.isStreaming}
                                    >
                                      <ReasoningSegmentContent>
                                        {segment.reasoning?.text || ""}
                                      </ReasoningSegmentContent>
                                    </ReasoningSegment>
                                  )
                                }

                                if (segment.type === "tool" && segment.tool) {
                                  const tool = segment.tool as {
                                    type: `tool-${string}`
                                    state?: ToolUIPart["state"]
                                    output?: { totalResults?: number; [key: string]: unknown }
                                    input?: {
                                      objective: string
                                      searchQueries: string[]
                                      maxResults?: number
                                    }
                                  }
                                  const toolType = tool.type
                                  const isWebSearch = toolType === "tool-webSearch"
                                  const toolResult = getToolResultText(tool, toolConstants)
                                  const toolDescription = isWebSearch ? tool.input?.objective : ""
                                  return (
                                    <ReasoningSegment
                                      key={`${toolType}-${message.id}-${segment.partIndex}`}
                                      toolType={toolType}
                                      toolState={tool.state}
                                      toolResult={toolResult}
                                      toolDescription={toolDescription}
                                    />
                                  )
                                }

                                return null
                              })
                            })}

                            {isThinkingComplete && (
                              <ThinkingProcessCompletion stepCount={steps.length} />
                            )}
                          </ThinkingProcessContent>
                        </ThinkingProcess>
                      )}

                      {/* Tool Calls Container - only show after thinking is done */}
                      {isAssistantMessage && hasTools && isThinkingComplete && (
                        <ToolCallsContainer toolCount={toolParts.length}>
                          <ToolCallsContainerTrigger toolNames={toolNames} />
                          <ToolCallsList
                            toolParts={toolParts}
                            onToolApprovalResponse={addToolApprovalResponse}
                          />
                        </ToolCallsContainer>
                      )}

                      {/* Message content */}
                      <MessageContent>
                        {isUserMessage ? (
                          <div className="whitespace-pre-wrap wrap-break-word">{messageText}</div>
                        ) : (
                          <MessageResponse>{messageText}</MessageResponse>
                        )}
                      </MessageContent>
                      {isUserMessage && (
                        <UserMessageActionsBar
                          messageText={messageText}
                          onEdit={() => {
                            /** noop */
                          }}
                        />
                      )}
                      {isAssistantMessage &&
                        !isCurrentlyStreaming &&
                        !message.parts.some(
                          part =>
                            part.type.startsWith("tool-") &&
                            (part as { state?: string }).state === "approval-requested"
                        ) && (
                          <AssistantMessageActionsBar
                            messageText={messageText}
                            tokenInfo={metadata?.totalUsage}
                            onLike={() => {
                              /** noop */
                            }}
                            onDislike={() => {
                              /** noop */
                            }}
                            onShare={() => {
                              /** noop */
                            }}
                            onRefresh={() => {
                              regenerate({ messageId: message.id })
                            }}
                            showRefresh={isLastMessage}
                          />
                        )}
                    </Message>
                  </MessageBranchContent>
                </MessageBranch>
              )
            })}

            {isAwaitingAssistantReply && (
              <MessageBranch defaultBranch={0}>
                <MessageBranchContent>
                  <Message from="assistant">
                    <MessageContent>
                      <div className="px-0.5 py-2 text-muted-foreground">
                        <CircleIcon className="size-3 fill-current animate-pulse-scale" />
                      </div>
                    </MessageContent>
                  </Message>
                </MessageBranchContent>
              </MessageBranch>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      {/* Bottom */}
      <div className="relative bg-background flex-none">
        <div className="relative flex items-center justify-center px-5 w-(--chat-content-width)">
          {/* Gradient Region */}
          <div
            className={cn(
              "absolute bottom-full left-2.5 right-2.5 h-6",
              "bg-linear-to-b from-(--background-transparent) to-background"
            )}
          />

          {/* Chat Input */}
          <div
            className="relative w-full max-w-(--chat-content-max-width) pb-6"
            ref={inputContainerRef}
          >
            <PromptInput globalDrop multiple onSubmit={handleSubmit}>
              {/* Attachments header */}
              <PromptInputHeader>
                <PromptInputAttachments>
                  {attachment => <PromptInputAttachment data={attachment} />}
                </PromptInputAttachments>
              </PromptInputHeader>

              {/* Input box */}
              <PromptInputBody>
                <PromptInputTextarea
                  ref={textareaRef}
                  onChange={event => setInput(event.target.value)}
                  value={input}
                />
              </PromptInputBody>

              {/* Footer */}
              <PromptInputFooter>
                {/* Tools in Left */}
                <PromptInputTools className="-ml-1.5">
                  <ToolButton
                    icon={GlobeIcon}
                    label={toolButtonConstants.webSearch.label}
                    tooltip={toolButtonConstants.webSearch.tooltip}
                    enabled={useWebSearch}
                    onEnabledChange={setUseWebSearch}
                    collapsed={isCondensed}
                    modes={[
                      {
                        ...toolButtonConstants.webSearch.modes.auto,
                        icon: SparklesIcon
                      },
                      {
                        ...toolButtonConstants.webSearch.modes.always,
                        icon: ZapIcon
                      }
                    ]}
                    selectedMode={webSearchMode}
                    onModeChange={mode => setWebSearchMode(mode as "auto" | "always")}
                  />

                  <ToolButton
                    icon={AtomIcon}
                    label={toolButtonConstants.deepThink.label}
                    tooltip={toolButtonConstants.deepThink.tooltip}
                    enabled={useDeepThink}
                    onEnabledChange={setUseDeepThink}
                    collapsed={isCondensed}
                  />
                </PromptInputTools>

                {/* Tools in Right */}
                <PromptInputTools className="gap-3">
                  {/* Add attachments */}
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>

                  {/* Submit button */}
                  <Tooltip disableHoverableContent={true} open={undefined}>
                    <TooltipTrigger asChild>
                      <div className={cn(isSubmitDisabled && "cursor-not-allowed")}>
                        <PromptInputSubmit
                          disabled={isSubmitDisabled}
                          status={status}
                          type={isStreaming ? "button" : "submit"}
                          onClick={isStreaming ? handleStop : undefined}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{submitTooltip}</TooltipContent>
                  </Tooltip>
                </PromptInputTools>
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div
        className={cn(
          "absolute bottom-1 flex max-h-6 items-center justify-center",
          "max-w-(--chat-content-max-width) mx-auto left-0 right-0",
          "text-[9px] text-muted-foreground/50 shadow-none",
          "overflow-hidden whitespace-nowrap text-ellipsis"
        )}
      >
        <Trans
          i18nKey="footer.copyrightWithLink"
          ns="common"
          components={{
            link: (
              <a
                href="https://github.com/wangshunnn/mind-flayer"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors underline"
              >
                Github
              </a>
            )
          }}
        />
      </div>
    </div>
  )
}

export { AppChat }
