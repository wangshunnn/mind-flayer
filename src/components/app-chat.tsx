import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ToolUIPart,
  type UIMessage
} from "ai"
import { AtomIcon, GlobeIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
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
  ToolCall,
  ToolCallApprovalRequested,
  ToolCallContent,
  ToolCallInputStreaming,
  ToolCallOutputDenied,
  ToolCallOutputError,
  ToolCallTrigger,
  ToolCallWebSearchResults
} from "@/components/ai-elements/tool-call"
import {
  ToolCallsContainer,
  ToolCallsContainerContent,
  ToolCallsContainerTrigger
} from "@/components/ai-elements/tool-calls-container"
import { MODEL_OPTIONS, type ModelOption, SelectModel } from "@/components/select-model"
import { ToolButton } from "@/components/tool-button"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useChatStorage } from "@/hooks/use-chat-storage"
import {
  FOOTER_CONSTANTS,
  TEXT_UTILS,
  TOAST_CONSTANTS,
  TOOL_BUTTON_CONSTANTS,
  TOOL_CONSTANTS,
  TOOLTIP_CONSTANTS
} from "@/lib/constants"
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
  const [selectedModel, setSelectedModel] = useState<ModelOption>(MODEL_OPTIONS[0])
  const [useWebSearch, setUseWebSearch] = useState<boolean>(true)
  const [webSearchMode, setWebSearchMode] = useState<"auto" | "always">("auto")
  const [useDeepThink, setUseDeepThink] = useState<boolean>(false)
  const [isCondensed, setIsCondensed] = useState(false)
  const [input, setInput] = useState("")
  const selectedModelRef = useRef(selectedModel)
  const useWebSearchRef = useRef(useWebSearch)
  const webSearchModeRef = useRef(webSearchMode)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<PromptInputTextareaHandle>(null)
  const thinkingDurationsRef = useRef<Map<MessageId, number>>(new Map())
  const messagesRef = useRef<UIMessage[]>([])
  const storedMessageIdsRef = useRef<Set<MessageId>>(new Set())
  const currentChatIdRef = useRef<ChatId | null>(activeChatId)

  const { isCompact, open } = useSidebar()
  const { createChat, loadMessages, saveChatAllMessages } = useChatStorage()

  // TODO add: stop, regenerate
  const { status, messages, setMessages, sendMessage, addToolApprovalResponse, regenerate } =
    useChat({
      transport: new DefaultChatTransport({
        api: `http://localhost:${__SIDECAR_PORT__}/api/chat`,
        headers: () => ({
          "X-API-Key": import.meta.env.VITE_MINIMAX_API_KEY || "",
          "X-Model-Provider": selectedModelRef.current.provider,
          "X-Model-Id": selectedModelRef.current.api_id,
          "X-Use-Web-Search": useWebSearchRef.current.toString(),
          "X-Web-Search-Mode": webSearchModeRef.current
        })
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onFinish: ({ messages, finishReason }) => {
        console.log("[AppChat] useChat-onFinish finishReason=", finishReason)
        saveAllMessagesAsync(messages)
      },
      onError: error => {
        toast.error("Error", {
          description: error.message
        })
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
    async (allMessages: UIMessage[]) => {
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
        console.log("[AppChat] createNewChatAsync id=", newChatId)
      }
      await saveChatAllMessages(chatId, allMessagesWithMetadata)
      for (const msg of allMessages) {
        storedMessageIdsRef.current.add(msg.id)
      }
      console.log("[AppChat] Saved new messages:", allMessages.length)
    },
    [createNewChatAsync, saveChatAllMessages]
  )

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
  useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])
  useEffect(() => {
    useWebSearchRef.current = useWebSearch
  }, [useWebSearch])
  useEffect(() => {
    webSearchModeRef.current = webSearchMode
  }, [webSearchMode])

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
            console.log("[AppChat] Active chat ID unchanged, skipping loadMessages")
            return
          }
          messagesRef.current = msgs
          // TODO Incremental update
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
    if (message.files?.length) {
      toast.success(TOAST_CONSTANTS.filesAttached, {
        description: TOAST_CONSTANTS.filesAttachedDescription(message.files.length)
      })
    }
    if (message.text) {
      sendMessage({ text: message.text })
      setInput("")
      textareaRef.current?.resetHeight()
    }
  }

  const isSubmitDisabled = !input.trim() || status !== "ready"

  return (
    <div className="flex h-full flex-col">
      {/* Top */}
      <div className="bg-background flex h-13 items-center border-b-[0.5px] pt-0">
        <div
          className={cn(
            "fixed left-10 flex z-50 items-center justify-center pointer-events-auto gap-1.25",
            !isCompact && open ? "left-66.75" : "left-42",
            "transition-left duration-300 ease"
          )}
        >
          <SelectModel value={selectedModel} onChange={setSelectedModel} />
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
              const toolParts = message.parts.filter(part => part.type.startsWith("tool-"))
              const toolNames = toolParts.map(part => {
                const toolType = part.type.replace("tool-", "")
                return TEXT_UTILS.getToolDisplayName(toolType)
              })

              const hasTools = toolParts.length > 0

              return (
                <MessageBranch defaultBranch={0} key={message.id}>
                  <MessageBranchContent>
                    <Message from={message.role} key={message.id}>
                      {/* Thinking Process - organized by steps */}
                      {message.role === "assistant" && hasThinkingProcess && (
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
                                      isStreaming={segment.reasoning?.isStreaming}
                                      segmentType="reasoning"
                                    >
                                      <ReasoningSegmentContent>
                                        {segment.reasoning?.text || ""}
                                      </ReasoningSegmentContent>
                                    </ReasoningSegment>
                                  )
                                }

                                if (segment.type === "tool" && segment.tool) {
                                  const tool = segment.tool as {
                                    type: string
                                    state?: ToolUIPart["state"]
                                    output?: { totalResults?: number; [key: string]: unknown }
                                    input?: {
                                      objective: string
                                      searchQueries: string[]
                                      maxResults?: number
                                    }
                                  }
                                  const toolType = tool.type.replace("tool-", "")
                                  const isWebSearch = toolType === "webSearch"
                                  const segmentType = isWebSearch ? "tool-webSearch" : "tool-other"
                                  const toolDisplayName = TEXT_UTILS.getToolDisplayName(toolType)
                                  let toolResult: string = TOOL_CONSTANTS.states.working

                                  switch (tool.state) {
                                    case "output-available": {
                                      if (tool.output) {
                                        if (isWebSearch && tool.output.totalResults !== undefined) {
                                          toolResult = TOOL_CONSTANTS.webSearch.searchedResults(
                                            tool.output.totalResults
                                          )
                                        } else {
                                          toolResult = TOOL_CONSTANTS.states.done
                                        }
                                      }
                                      break
                                    }
                                    case "output-error": {
                                      toolResult = TOOL_CONSTANTS.states.failed
                                      break
                                    }
                                    case "output-denied": {
                                      toolResult = TOOL_CONSTANTS.states.cancelled
                                      break
                                    }
                                    case "input-streaming":
                                    case "input-available": {
                                      toolResult = TOOL_CONSTANTS.states.working
                                      break
                                    }
                                    case "approval-requested": {
                                      toolResult = TOOL_CONSTANTS.states.awaitingApproval
                                      break
                                    }
                                    default: {
                                      toolResult = TOOL_CONSTANTS.states.working
                                    }
                                  }

                                  const toolDescription = isWebSearch ? tool.input?.objective : ""
                                  const toolIdentifier = `${tool.type}-${message.id}-${segment.partIndex}`
                                  return (
                                    <ReasoningSegment
                                      key={toolIdentifier}
                                      segmentType={segmentType}
                                      toolName={toolDisplayName}
                                      toolResult={toolResult}
                                      toolState={tool.state}
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
                      {message.role === "assistant" && hasTools && isThinkingComplete && (
                        <ToolCallsContainer toolCount={toolParts.length}>
                          <ToolCallsContainerTrigger toolNames={toolNames} />
                          <ToolCallsContainerContent>
                            {toolParts.map(part => {
                              // Handle webSearch tool with approval
                              if (part.type === "tool-webSearch") {
                                const callId = part.toolCallId
                                const input = part.input as {
                                  objective: string
                                  searchQueries: string[]
                                  maxResults?: number
                                }
                                const output =
                                  part.state === "output-available"
                                    ? (part.output as {
                                        query: string
                                        results: Array<{
                                          title: string
                                          url: string
                                          snippet: string
                                        }>
                                        totalResults: number
                                      })
                                    : null

                                return (
                                  <ToolCall
                                    key={callId}
                                    toolName="webSearch"
                                    state={part.state}
                                    resultCount={output?.totalResults}
                                  >
                                    <ToolCallTrigger />
                                    <ToolCallContent>
                                      {(part.state === "input-streaming" ||
                                        part.state === "input-available") && (
                                        <ToolCallInputStreaming
                                          message={TOOL_CONSTANTS.webSearch.searching(
                                            input?.objective || "..."
                                          )}
                                        />
                                      )}
                                      {part.state === "approval-requested" && (
                                        <ToolCallApprovalRequested
                                          description={
                                            <>
                                              The AI wants to search the web for:{" "}
                                              <strong>"{input?.objective ?? ""}"</strong>
                                            </>
                                          }
                                          onApprove={() =>
                                            addToolApprovalResponse({
                                              id: part.approval.id,
                                              approved: true
                                            })
                                          }
                                          onDeny={() =>
                                            addToolApprovalResponse({
                                              id: part.approval.id,
                                              approved: false
                                            })
                                          }
                                        />
                                      )}
                                      {part.state === "output-available" && output && (
                                        <ToolCallWebSearchResults results={output.results} />
                                      )}
                                      {part.state === "output-error" && (
                                        <ToolCallOutputError errorText={part.errorText} />
                                      )}
                                      {part.state === "output-denied" && (
                                        <ToolCallOutputDenied message={part.errorText} />
                                      )}
                                    </ToolCallContent>
                                  </ToolCall>
                                )
                              }
                              return null
                            })}
                          </ToolCallsContainerContent>
                        </ToolCallsContainer>
                      )}

                      {/* Message content */}
                      <MessageContent>
                        <MessageResponse>{messageText}</MessageResponse>
                      </MessageContent>
                      {message.role === "user" && (
                        <UserMessageActionsBar
                          messageText={messageText}
                          onEdit={() => {
                            // TODO: Implement edit functionality
                          }}
                        />
                      )}
                      {message.role === "assistant" &&
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
                              // TODO: Implement like functionality
                            }}
                            onDislike={() => {
                              // TODO: Implement dislike functionality
                            }}
                            onShare={() => {
                              // TODO: Implement share functionality
                            }}
                            onRefresh={() => {
                              regenerate({ messageId: message.id })
                              // TODO update stored messages
                            }}
                            showRefresh={isLastMessage}
                          />
                        )}
                    </Message>
                  </MessageBranchContent>
                </MessageBranch>
              )
            })}
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
                    label={TOOL_BUTTON_CONSTANTS.webSearch.label}
                    tooltip={TOOL_BUTTON_CONSTANTS.webSearch.tooltip}
                    enabled={useWebSearch}
                    onEnabledChange={setUseWebSearch}
                    collapsed={isCondensed}
                    modes={[
                      {
                        ...TOOL_BUTTON_CONSTANTS.webSearch.modes.auto,
                        icon: SparklesIcon
                      },
                      {
                        ...TOOL_BUTTON_CONSTANTS.webSearch.modes.always,
                        icon: ZapIcon
                      }
                    ]}
                    selectedMode={webSearchMode}
                    onModeChange={mode => setWebSearchMode(mode as "auto" | "always")}
                  />

                  <ToolButton
                    icon={AtomIcon}
                    label={TOOL_BUTTON_CONSTANTS.deepThink.label}
                    tooltip={TOOL_BUTTON_CONSTANTS.deepThink.tooltip}
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
                        <PromptInputSubmit disabled={isSubmitDisabled} status={status} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{TOOLTIP_CONSTANTS.submit}</TooltipContent>
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
        {FOOTER_CONSTANTS.disclaimer}{" "}
        <a
          href={FOOTER_CONSTANTS.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors underline"
        >
          {FOOTER_CONSTANTS.github}
        </a>
        {"."}
      </div>
    </div>
  )
}

export { AppChat }
