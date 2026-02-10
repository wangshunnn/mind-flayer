import { Chat as AiChat, useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type FileUIPart,
  getToolName,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ReasoningUIPart,
  type StepStartUIPart,
  type TextUIPart,
  type ToolUIPart,
  type UIMessage
} from "ai"
import { AtomIcon, CircleIcon, GlobeIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
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
  ReasoningPart,
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
import { useLatest } from "@/hooks/use-latest"
import { useSetting } from "@/hooks/use-settings-store"
import {
  useMessageConstants,
  useToastConstants,
  useToolButtonConstants,
  useTooltipConstants
} from "@/lib/constants"
import { getSidecarUrl } from "@/lib/sidecar-client"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import type { ChatId, MessageId, Chat as StoredChat } from "@/types/chat"

interface AppChatProps {
  activeChatId?: ChatId | null
  chats: StoredChat[]
  newChatToken: string | null
  createChat: (title?: string, options?: { activate?: boolean }) => Promise<ChatId>
  loadMessages: (chatId: ChatId) => Promise<UIMessage[]>
  saveChatAllMessages: (chatId: ChatId, messages: UIMessage[], isNewChat?: boolean) => Promise<void>
  onRequestActivateChat?: (chatId: ChatId, tokenAtSend: string) => void
  onChatUnread?: (chatId: ChatId) => void
}

interface AppChatInnerProps extends AppChatProps {
  sidecarApi: string
}

type ThinkingStep = (StepStartUIPart | ReasoningUIPart | ToolUIPart | DynamicToolUIPart) & {
  partIndex: number
}

type SaveMessageOptions = {
  isAbort?: boolean
  isDisconnect?: boolean
  isError?: boolean
  isNewChat?: boolean
}

interface SessionRuntime {
  chatId: ChatId
  chat: AiChat<UIMessage>
  hydrated: boolean
  isHydrating: boolean
  thinkingDurations: Map<MessageId, number>
  toolDurations: Map<MessageId, Record<string, number>>
}

const getDraftKey = (chatId: ChatId | null | undefined) => (chatId ? `chat:${chatId}` : "new")

const AppChatInner = ({
  activeChatId,
  chats,
  newChatToken,
  createChat,
  loadMessages,
  saveChatAllMessages,
  onRequestActivateChat,
  onChatUnread,
  sidecarApi
}: AppChatInnerProps) => {
  const { t } = useTranslation(["common", "chat"])
  const messageConstants = useMessageConstants()
  const toastConstants = useToastConstants()
  const toolButtonConstants = useToolButtonConstants()
  const tooltipConstants = useTooltipConstants()

  const { availableModels } = useAvailableModels()

  const [selectedModelApiId, setSelectedModelApiId] = useSetting("selectedModelApiId")
  const [useWebSearch, setUseWebSearch] = useSetting("webSearchEnabled")
  const [webSearchMode, setWebSearchMode] = useSetting("webSearchMode")
  const [useDeepThink, setUseDeepThink] = useSetting("deepThinkEnabled")

  const selectedModel =
    availableModels.find(m => m.api_id === selectedModelApiId) ?? availableModels[0] ?? null

  const [isCondensed, setIsCondensed] = useState(false)
  const [input, setInput] = useState("")
  const selectedModelRef = useLatest(selectedModel)
  const useWebSearchRef = useLatest(useWebSearch)
  const webSearchModeRef = useLatest(webSearchMode)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<PromptInputTextareaHandle>(null)
  const activeChatIdRef = useRef<ChatId | null>(activeChatId ?? null)
  const newChatTokenRef = useRef<string | null>(newChatToken)

  const sessionRuntimesRef = useRef<Map<ChatId, SessionRuntime>>(new Map())
  const pendingChatByTokenRef = useRef<Map<string, Promise<ChatId>>>(new Map())
  const draftByKeyRef = useRef<Map<string, string>>(new Map())
  const hydrationRequestSeqRef = useRef<Map<ChatId, number>>(new Map())
  const draftChatRef = useRef(new AiChat<UIMessage>({ id: "draft-chat-view", messages: [] }))

  const { isCompact, open } = useSidebar()

  const currentDraftKey = getDraftKey(activeChatId)

  const showChatErrorToast = useCallback(
    (error: Error) => {
      if (error.message.includes("API_KEY_NOT_CONFIGURED") || error.message.includes("401")) {
        toast.error(toastConstants.error, {
          description: toastConstants.apiKeyNotConfigured,
          action: {
            label: t("chat:model.configureModels"),
            onClick: () => openSettingsWindow(SettingsSection.PROVIDERS)
          },
          duration: 3000
        })
      } else {
        toast.error(toastConstants.error, {
          description: error.message
        })
      }
    },
    [t, toastConstants]
  )

  const saveAllMessagesAsync = useCallback(
    async (chatId: ChatId, allMessages: UIMessage[], options?: SaveMessageOptions) => {
      if (!allMessages || allMessages.length === 0) {
        return
      }

      const runtime = sessionRuntimesRef.current.get(chatId)
      if (!runtime) {
        return
      }

      const allMessagesWithMetadata = allMessages.map(msg => {
        const cachedDuration = runtime.thinkingDurations.get(msg.id)
        const cachedToolDurations = runtime.toolDurations.get(msg.id)

        if (cachedDuration !== undefined && msg.role === "assistant") {
          return {
            ...msg,
            metadata: {
              ...(msg.metadata || {}),
              thinkingDuration: cachedDuration,
              ...(cachedToolDurations ? { toolDurations: cachedToolDurations } : {})
            }
          }
        }

        if (cachedToolDurations && msg.role === "assistant") {
          return {
            ...msg,
            metadata: {
              ...(msg.metadata || {}),
              toolDurations: cachedToolDurations
            }
          }
        }

        return msg
      })

      const lastMessage = allMessagesWithMetadata[allMessagesWithMetadata.length - 1]
      if (
        lastMessage?.role === "assistant" &&
        (options?.isAbort || options?.isDisconnect || options?.isError)
      ) {
        lastMessage.metadata = {
          ...(lastMessage.metadata || {}),
          ...(options || {})
        }

        if (options?.isAbort) {
          if (lastMessage.parts.filter(isTextUIPart).length === 0) {
            lastMessage.parts.push({
              type: "text",
              text: messageConstants.abortedMessage
            } as TextUIPart)
          }

          if (activeChatIdRef.current === chatId) {
            runtime.chat.messages = allMessagesWithMetadata
          }
        }
      }

      await saveChatAllMessages(chatId, allMessagesWithMetadata, options?.isNewChat ?? false)
    },
    [messageConstants.abortedMessage, saveChatAllMessages]
  )

  const createSessionRuntime = useCallback(
    (
      chatId: ChatId,
      options?: { hydrated?: boolean; initialMessages?: UIMessage[] }
    ): SessionRuntime => {
      const runtime: SessionRuntime = {
        chatId,
        hydrated: options?.hydrated ?? false,
        isHydrating: false,
        thinkingDurations: new Map<MessageId, number>(),
        toolDurations: new Map<MessageId, Record<string, number>>(),
        chat: new AiChat<UIMessage>({
          id: chatId,
          messages: options?.initialMessages ?? [],
          transport: new DefaultChatTransport({
            api: sidecarApi,
            headers: () => ({
              "X-Model-Provider": selectedModelRef.current?.provider ?? "",
              "X-Model-Id": selectedModelRef.current?.api_id ?? "",
              "X-Use-Web-Search": useWebSearchRef.current.toString(),
              "X-Web-Search-Mode": webSearchModeRef.current,
              "X-Chat-Id": chatId
            })
          }),
          sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
          onFinish: ({ messages, isAbort, isDisconnect, isError }) => {
            if (isError) {
              return
            }

            void (async () => {
              try {
                await saveAllMessagesAsync(chatId, messages, { isAbort, isDisconnect, isError })

                const lastMessage = messages.at(-1)
                const shouldMarkUnread =
                  !isAbort &&
                  !isDisconnect &&
                  !isError &&
                  lastMessage?.role === "assistant" &&
                  activeChatIdRef.current !== chatId

                if (shouldMarkUnread) {
                  onChatUnread?.(chatId)
                }
              } catch (error) {
                console.error("[AppChat] Failed to persist finished messages:", error)
              }
            })()
          },
          onError: showChatErrorToast
        })
      }

      return runtime
    },
    [
      saveAllMessagesAsync,
      selectedModelRef,
      showChatErrorToast,
      onChatUnread,
      sidecarApi,
      useWebSearchRef,
      webSearchModeRef
    ]
  )

  const ensureSessionRuntime = useCallback(
    (
      chatId: ChatId,
      options?: { hydrated?: boolean; initialMessages?: UIMessage[] }
    ): SessionRuntime => {
      const existing = sessionRuntimesRef.current.get(chatId)
      if (existing) {
        if (options?.hydrated) {
          existing.hydrated = true
        }
        if (options?.initialMessages && existing.chat.messages.length === 0) {
          existing.chat.messages = options.initialMessages
        }
        return existing
      }

      const runtime = createSessionRuntime(chatId, options)
      sessionRuntimesRef.current.set(chatId, runtime)
      return runtime
    },
    [createSessionRuntime]
  )

  const hydrateSessionRuntime = useCallback(
    async (chatId: ChatId, runtime: SessionRuntime) => {
      if (runtime.hydrated || runtime.isHydrating) {
        return
      }

      runtime.isHydrating = true
      const nextSeq = (hydrationRequestSeqRef.current.get(chatId) ?? 0) + 1
      hydrationRequestSeqRef.current.set(chatId, nextSeq)

      try {
        const loadedMessages = await loadMessages(chatId)
        const latestSeq = hydrationRequestSeqRef.current.get(chatId)
        const latestRuntime = sessionRuntimesRef.current.get(chatId)

        if (!latestRuntime || latestSeq !== nextSeq) {
          return
        }

        if (
          latestRuntime.chat.messages.length === 0 ||
          loadedMessages.length > latestRuntime.chat.messages.length
        ) {
          latestRuntime.chat.messages = loadedMessages
        }

        latestRuntime.hydrated = true
      } catch (error) {
        console.error("[AppChat] Failed to load chat messages:", error)
      } finally {
        const latestSeq = hydrationRequestSeqRef.current.get(chatId)
        const latestRuntime = sessionRuntimesRef.current.get(chatId)
        if (latestRuntime && latestSeq === nextSeq) {
          latestRuntime.isHydrating = false
        }
      }
    },
    [loadMessages]
  )

  const getOrCreateChatForToken = useCallback(
    async (token: string, firstMessageText?: string): Promise<ChatId> => {
      const pending = pendingChatByTokenRef.current.get(token)
      if (pending) {
        return pending
      }

      const createPromise = (async () => {
        const newChatId = await createChat(firstMessageText, { activate: false })
        ensureSessionRuntime(newChatId, { hydrated: true, initialMessages: [] })
        return newChatId
      })()

      pendingChatByTokenRef.current.set(token, createPromise)

      try {
        return await createPromise
      } finally {
        const currentPending = pendingChatByTokenRef.current.get(token)
        if (currentPending === createPromise) {
          pendingChatByTokenRef.current.delete(token)
        }
      }
    },
    [createChat, ensureSessionRuntime]
  )

  const appendUserMessageAndSend = useCallback(
    async (runtime: SessionRuntime, messageText: string, files: FileUIPart[]) => {
      const parts: UIMessage["parts"] = [
        ...files,
        ...(messageText ? [{ type: "text", text: messageText } as TextUIPart] : [])
      ]
      const isNewChat = runtime.chat.messages.length === 0

      runtime.chat.messages = runtime.chat.messages.concat([
        {
          id: nanoid(),
          role: "user",
          parts
        }
      ])

      await saveAllMessagesAsync(runtime.chatId, runtime.chat.messages, { isNewChat })
      await runtime.chat.sendMessage()
    },
    [saveAllMessagesAsync]
  )

  useEffect(() => {
    activeChatIdRef.current = activeChatId ?? null
  }, [activeChatId])

  useEffect(() => {
    newChatTokenRef.current = newChatToken
  }, [newChatToken])

  useEffect(() => {
    const draft = draftByKeyRef.current.get(currentDraftKey) ?? ""
    setInput(draft)
  }, [currentDraftKey])

  useEffect(() => {
    const knownChatIds = new Set(chats.map(chat => chat.id))

    for (const chatId of sessionRuntimesRef.current.keys()) {
      if (!knownChatIds.has(chatId)) {
        sessionRuntimesRef.current.delete(chatId)
        hydrationRequestSeqRef.current.delete(chatId)
      }
    }

    for (const draftKey of draftByKeyRef.current.keys()) {
      if (!draftKey.startsWith("chat:")) {
        continue
      }
      const chatId = draftKey.slice(5)
      if (!knownChatIds.has(chatId)) {
        draftByKeyRef.current.delete(draftKey)
      }
    }
  }, [chats])

  const runtimeForActiveChat = activeChatId ? ensureSessionRuntime(activeChatId) : undefined

  useEffect(() => {
    if (!activeChatId || !runtimeForActiveChat) {
      return
    }
    void hydrateSessionRuntime(activeChatId, runtimeForActiveChat)
  }, [activeChatId, hydrateSessionRuntime, runtimeForActiveChat])

  const {
    status,
    messages,
    error,
    clearError,
    setMessages,
    addToolApprovalResponse,
    regenerate,
    stop
  } = useChat({ chat: runtimeForActiveChat?.chat ?? draftChatRef.current })

  useEffect(() => {
    const runtime = activeChatId ? sessionRuntimesRef.current.get(activeChatId) : null
    const lastMessage = messages[messages.length - 1]

    if (!runtime || !error || lastMessage?.parts.length !== 0) {
      return
    }

    const messagesWithError = messages.slice(0, -1).concat([
      {
        ...lastMessage,
        parts: [
          {
            type: "text",
            text: error.message
          } as TextUIPart
        ]
      }
    ])

    setMessages(messagesWithError)
    void saveAllMessagesAsync(runtime.chatId, messagesWithError)
    clearError()
  }, [activeChatId, clearError, error, messages, saveAllMessagesAsync, setMessages])

  useEffect(() => {
    const el = inputContainerRef.current
    if (!el) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      setIsCondensed(entry.contentRect.width < 448)
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value)
      draftByKeyRef.current.set(currentDraftKey, value)
    },
    [currentDraftKey]
  )

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const messageText = message.text?.trim() ?? ""
      const hasText = Boolean(messageText)
      const hasAttachments = Boolean(message.files?.length)

      if (!(hasText || hasAttachments)) {
        return
      }

      if (!availableModels || availableModels.length === 0) {
        toast.error(t("chat:model.noModelsConfigured"), {
          description: t("chat:model.pleaseConfigureApiKey"),
          action: {
            label: t("chat:model.configureModels"),
            onClick: () => openSettingsWindow(SettingsSection.PROVIDERS)
          },
          duration: 3000
        })
        return
      }

      if (message.files?.length) {
        toast.success(toastConstants.filesAttached, {
          description: toastConstants.filesAttachedDescription(message.files.length)
        })
      }

      const draftKeyAtSubmit = currentDraftKey
      const submittedInputText = message.text ?? ""

      // Optimistically clear draft immediately for responsive UX.
      draftByKeyRef.current.set(draftKeyAtSubmit, "")

      const currentKeyAtSubmit = getDraftKey(activeChatIdRef.current)
      if (currentKeyAtSubmit === draftKeyAtSubmit) {
        setInput("")
        textareaRef.current?.resetHeight()
      }

      try {
        let runtime: SessionRuntime

        if (activeChatIdRef.current) {
          runtime = ensureSessionRuntime(activeChatIdRef.current)
        } else {
          const tokenAtSend = newChatTokenRef.current ?? globalThis.crypto.randomUUID()
          const chatId = await getOrCreateChatForToken(tokenAtSend, messageText)
          runtime = ensureSessionRuntime(chatId, { hydrated: true })
          onRequestActivateChat?.(chatId, tokenAtSend)
        }

        await appendUserMessageAndSend(runtime, messageText, message.files)
      } catch (sendError) {
        const draftForKey = draftByKeyRef.current.get(draftKeyAtSubmit) ?? ""
        if (!draftForKey) {
          draftByKeyRef.current.set(draftKeyAtSubmit, submittedInputText)
        }

        const currentKey = getDraftKey(activeChatIdRef.current)
        if (currentKey === draftKeyAtSubmit) {
          setInput(prev => (prev ? prev : submittedInputText))
          textareaRef.current?.resetHeight()
        }

        console.error("[AppChat] Failed to submit message:", sendError)
      }
    },
    [
      appendUserMessageAndSend,
      availableModels,
      currentDraftKey,
      ensureSessionRuntime,
      getOrCreateChatForToken,
      onRequestActivateChat,
      t,
      toastConstants
    ]
  )

  const handleStop = () => {
    if (status === "streaming") {
      void stop()
    }
  }

  const activeRuntime = runtimeForActiveChat
  const thinkingDurations = activeRuntime?.thinkingDurations
  const toolDurations = activeRuntime?.toolDurations

  const isStreaming = status === "streaming"
  const isSubmitDisabled = isStreaming ? false : !input.trim() || status !== "ready"
  const submitTooltip = isStreaming ? tooltipConstants.stop : tooltipConstants.submit

  const lastMessage = messages[messages.length - 1]
  const isAwaitingAssistantReply =
    (status === "submitted" && lastMessage?.role === "user") ||
    ((status === "streaming" || status === "error") && lastMessage?.parts.length === 0)

  return (
    <div className="flex h-full flex-col">
      {/* Top */}
      <div className="bg-background flex h-11 items-center border-b-[0.5px] pt-0">
        <div
          className={cn(
            "fixed left-10 flex z-50 items-center justify-center pointer-events-auto gap-1.25",
            !isCompact && open ? "left-66.75" : "left-43",
            "transition-left duration-300 ease"
          )}
        >
          <SelectModel
            value={selectedModel ?? undefined}
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
                .filter(isTextUIPart)
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
                    toolDurations?: Record<string, number>
                  }
                | undefined
              const isLastMessage = index === messages.length - 1
              const isCurrentlyStreaming = status === "streaming" && isLastMessage
              const lastPart = message.parts[message.parts.length - 1]
              const isThinkingStreaming =
                (isCurrentlyStreaming &&
                  lastPart?.type &&
                  (lastPart.type === "step-start" ||
                    isReasoningUIPart(lastPart) ||
                    isToolUIPart(lastPart))) ||
                (!isCurrentlyStreaming && lastPart?.type && isToolUIPart(lastPart))
              const steps: ThinkingStep[][] = []
              let currentStep: ThinkingStep[] = []

              message.parts.forEach((part, partIndex) => {
                if (part.type === "step-start") {
                  if (currentStep.length > 0) {
                    steps.push(currentStep)
                    currentStep = [{ ...part, partIndex }]
                  }
                } else if (isReasoningUIPart(part) || isToolUIPart(part)) {
                  currentStep.push({ ...part, partIndex })
                }
              })

              if (currentStep.length > 0) {
                steps.push(currentStep)
              }

              const hasThinkingProcess =
                steps.length > 0 &&
                steps.some(step => step.some(part => isReasoningUIPart(part) || isToolUIPart(part)))
              const lastStep = currentStep.at(-1)
              const isThinkingComplete =
                lastStep && isReasoningUIPart(lastStep) && lastStep.state !== "streaming"
              const toolParts = message.parts.filter(isToolUIPart)
              const toolNames = toolParts.map(getToolName)

              const hasTools = toolParts.length > 0
              const isUserMessage = message.role === "user"
              const isAssistantMessage = message.role === "assistant"

              return (
                <MessageBranch defaultBranch={0} key={message.id}>
                  <MessageBranchContent>
                    <Message from={message.role} key={message.id}>
                      {isAssistantMessage && hasThinkingProcess && (
                        <ThinkingProcess
                          isStreaming={isThinkingStreaming}
                          defaultOpen={isThinkingStreaming}
                          totalDuration={
                            metadata?.thinkingDuration ?? thinkingDurations?.get(message.id)
                          }
                          onTotalDurationChange={duration => {
                            if (!thinkingDurations) {
                              return
                            }
                            thinkingDurations.set(message.id, duration)
                          }}
                        >
                          <ThinkingProcessTrigger />
                          <ThinkingProcessContent>
                            {steps.flatMap(step =>
                              step
                                .filter(part => isReasoningUIPart(part) || isToolUIPart(part))
                                .map(part => (
                                  <ReasoningPart
                                    key={`${message.id}-${part.partIndex}`}
                                    partSource={part}
                                    isChatStreaming={isCurrentlyStreaming}
                                  />
                                ))
                            )}

                            {isThinkingComplete && (
                              <ThinkingProcessCompletion stepCount={steps.length} />
                            )}
                          </ThinkingProcessContent>
                        </ThinkingProcess>
                      )}

                      {isAssistantMessage && hasTools && (
                        <ToolCallsContainer toolCount={toolParts.length}>
                          <ToolCallsContainerTrigger toolNames={toolNames} />
                          <ToolCallsList
                            toolParts={toolParts}
                            toolDurations={
                              metadata?.toolDurations ?? toolDurations?.get(message.id)
                            }
                            onToolDurationChange={(toolCallId, duration) => {
                              if (!toolDurations) {
                                return
                              }
                              const prev = toolDurations.get(message.id) ?? {}
                              toolDurations.set(message.id, {
                                ...prev,
                                [toolCallId]: duration
                              })
                            }}
                            onToolApprovalResponse={addToolApprovalResponse}
                          />
                        </ToolCallsContainer>
                      )}

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
                          part => isToolUIPart(part) && part.state === "approval-requested"
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
                              void regenerate({ messageId: message.id })
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
        <div className="relative flex items-center justify-center px-3 w-(--chat-content-width)">
          {/* Gradient Region */}
          <div
            className={cn(
              "absolute bottom-full left-2.5 right-2.5 h-6",
              "bg-linear-to-b from-(--background-transparent) to-background"
            )}
          />

          {/* Chat Input */}
          <div
            className="relative w-full max-w-(--chat-content-max-width) pb-4"
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
                  onChange={event => handleInputChange(event.target.value)}
                  value={input}
                />
              </PromptInputBody>

              {/* Footer */}
              <PromptInputFooter>
                {/* Tools in Left */}
                <PromptInputTools className="-ml-1">
                  {/* Add attachments */}
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger />
                    <PromptInputActionMenuContent align="start">
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>

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
                <PromptInputTools className="gap-2.5">
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
          "absolute bottom-0.5 flex max-h-3 items-center justify-center",
          "max-w-(--chat-content-max-width) mx-auto left-0 right-0",
          "text-[9px] text-muted-foreground/50 shadow-none",
          "overflow-hidden whitespace-nowrap text-ellipsis"
        )}
      >
        {t("common:footer.copyrightWithLink")}
      </div>
    </div>
  )
}

const AppChat = ({
  activeChatId,
  chats,
  newChatToken,
  createChat,
  loadMessages,
  saveChatAllMessages,
  onRequestActivateChat,
  onChatUnread
}: AppChatProps) => {
  const [sidecarApi, setSidecarApi] = useState<string | null>(null)
  const [sidecarApiError, setSidecarApiError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const loadSidecarApi = async () => {
      try {
        const api = await getSidecarUrl("/api/chat")
        if (!mounted) {
          return
        }
        setSidecarApi(api)
      } catch (error) {
        if (!mounted) {
          return
        }
        const message =
          error instanceof Error ? error.message : "Failed to connect to local AI service"
        setSidecarApiError(message)
      }
    }

    loadSidecarApi()

    return () => {
      mounted = false
    }
  }, [])

  if (sidecarApiError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        Local AI service failed to start: {sidecarApiError}
      </div>
    )
  }

  if (!sidecarApi) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        Starting local AI service...
      </div>
    )
  }

  return (
    <AppChatInner
      activeChatId={activeChatId}
      chats={chats}
      newChatToken={newChatToken}
      createChat={createChat}
      loadMessages={loadMessages}
      saveChatAllMessages={saveChatAllMessages}
      onRequestActivateChat={onRequestActivateChat}
      onChatUnread={onChatUnread}
      sidecarApi={sidecarApi}
    />
  )
}

export { AppChat }
