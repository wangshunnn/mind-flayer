import { Chat as AiChat, useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type FileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type LanguageModelUsage,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ReasoningUIPart,
  type StepStartUIPart,
  type TextUIPart,
  type ToolUIPart,
  type UIMessage
} from "ai"
import { BrainIcon, CircleIcon, GlobeIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { StickToBottomContext } from "use-stick-to-bottom"
import { ContextWindowUsageIndicator } from "@/components/ai-elements/context-window-usage-indicator"
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
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
  ReasoningPart,
  ThinkingProcess,
  ThinkingProcessCompletion,
  ThinkingProcessContent,
  ThinkingProcessTrigger
} from "@/components/ai-elements/thinking-process"
import {
  ToolCallsSummary,
  ToolCallTimelineItem
} from "@/components/ai-elements/tool-calls-container"
import { NewChatEmptyState } from "@/components/new-chat-empty-state"
import { SelectModel } from "@/components/select-model"
import { ToolButton } from "@/components/tool-button"
import { TopFloatingHeader } from "@/components/top-floating-header"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAvailableModels } from "@/hooks/use-available-models"
import { useLatest } from "@/hooks/use-latest"
import { useSetting } from "@/hooks/use-settings-store"
import { generateChatTitle } from "@/lib/chat-utils"
import {
  useMessageConstants,
  useToastConstants,
  useToolButtonConstants,
  useTooltipConstants
} from "@/lib/constants"
import { findModelPricing } from "@/lib/provider-constants"
import { generateTitle, getSidecarUrl } from "@/lib/sidecar-client"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import type { ChatId, MessageId, Chat as StoredChat } from "@/types/chat"
import type { ReasoningEffort } from "@/types/settings"

interface AppChatProps {
  activeChatId?: ChatId | null
  chats: StoredChat[]
  newChatToken: string | null
  draftStore: Map<string, string>
  isDesktopChatPaneActive?: () => boolean
  createChat: (title?: string, options?: { activate?: boolean }) => Promise<ChatId>
  loadMessages: (chatId: ChatId) => Promise<UIMessage[]>
  saveChatAllMessages: (chatId: ChatId, messages: UIMessage[], isNewChat?: boolean) => Promise<void>
  updateChatTitle: (chatId: ChatId, title: string) => Promise<void>
  onRequestActivateChat?: (chatId: ChatId, tokenAtSend: string) => void
  onChatUnread?: (chatId: ChatId) => void
  onChatReplyingChange?: (chatId: ChatId, isReplying: boolean) => void
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

type AssistantMessageMetadata = {
  totalUsage?: LanguageModelUsage
  modelProvider?: string
  modelProviderLabel?: string
  modelId?: string
  modelLabel?: string
  thinkingDuration?: number
  toolDurations?: Record<string, number>
}

type PendingPin = {
  chatId: ChatId
  messageId: MessageId
  createdAt: number
  retries: number
  scrollBehavior: "instant" | "smooth"
}

type PinSessionMode = "pinning" | "released"

type PinSession = {
  chatId: ChatId
  messageId: MessageId
  anchorScrollTop: number
  mode: PinSessionMode
}

interface SessionRuntime {
  chatId: ChatId
  chat: AiChat<UIMessage>
  hydrated: boolean
  isHydrating: boolean
  thinkingDurations: Map<MessageId, number>
  toolDurations: Map<MessageId, Record<string, number>>
  cleanup?: () => void
}

const getDraftKey = (chatId: ChatId | null | undefined) => (chatId ? `chat:${chatId}` : "new")

const TOP_PIN_OFFSET = 0
const EPSILON = 1
const PENDING_TIMEOUT_MS = 500
const MAX_PENDING_FRAMES = 30
// Keep send-scroll behavior aligned with use-stick-to-bottom's default spring profile.
const SEND_SCROLL_ANIMATION = {
  damping: 0.7,
  stiffness: 0.05,
  mass: 1.25
} as const
// Extra hold time for scrollToBottom to keep following during late layout updates.
const RETAIN_ANIMATION_DURATION_MS = 350

const AppChatInner = ({
  activeChatId,
  chats,
  newChatToken,
  draftStore,
  isDesktopChatPaneActive,
  createChat,
  loadMessages,
  saveChatAllMessages,
  updateChatTitle,
  onRequestActivateChat,
  onChatUnread,
  onChatReplyingChange,
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
  const [reasoningEnabled, setReasoningEnabled] = useSetting("reasoningEnabled")
  const [preferredReasoningEffort, setPreferredReasoningEffort] = useSetting("reasoningEffort")

  const selectedModel =
    availableModels.find(m => m.api_id === selectedModelApiId) ?? availableModels[0] ?? null

  const [isCondensed, setIsCondensed] = useState(false)
  const [input, setInput] = useState("")
  const selectedModelRef = useLatest(selectedModel)
  const useWebSearchRef = useLatest(useWebSearch)
  const webSearchModeRef = useLatest(webSearchMode)
  const reasoningEnabledRef = useLatest(reasoningEnabled)
  const reasoningEffortRef = useLatest(preferredReasoningEffort)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<PromptInputTextareaHandle>(null)
  const spacerElementRef = useRef<HTMLDivElement>(null)
  const activeChatIdRef = useRef<ChatId | null>(activeChatId ?? null)
  const newChatTokenRef = useRef<string | null>(newChatToken)
  const conversationContextRef = useRef<StickToBottomContext | null>(null)

  const sessionRuntimesRef = useRef<Map<ChatId, SessionRuntime>>(new Map())
  const pendingChatByTokenRef = useRef<Map<string, Promise<ChatId>>>(new Map())
  const draftByKeyRef = useRef<Map<string, string>>(draftStore)
  const hydrationRequestSeqRef = useRef<Map<ChatId, number>>(new Map())
  const draftChatRef = useRef(new AiChat<UIMessage>({ id: "draft-chat-view", messages: [] }))
  const messageNodeByIdRef = useRef<Map<MessageId, HTMLDivElement>>(new Map())
  const messageNodeRefCallbacksRef = useRef<Map<MessageId, (node: HTMLDivElement | null) => void>>(
    new Map()
  )
  const pendingPinRef = useRef<PendingPin | null>(null)
  const pinSessionRef = useRef<PinSession | null>(null)
  const spacerHeightRef = useRef(0)
  const pendingPinFrameRef = useRef<number | null>(null)
  const pendingPinTimeoutRef = useRef<number | null>(null)
  const recalcFrameRef = useRef<number | null>(null)

  const sidecarOrigin = useMemo(() => {
    try {
      return new URL(sidecarApi).origin
    } catch {
      return undefined
    }
  }, [sidecarApi])

  const currentDraftKey = getDraftKey(activeChatId)
  const focusTargetKey = activeChatId ?? `new:${newChatToken ?? "default"}`

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

  const setSpacerHeight = useCallback((nextHeight: number) => {
    const safeHeight = Math.max(0, nextHeight)
    if (Math.abs(spacerHeightRef.current - safeHeight) <= EPSILON) {
      return
    }
    spacerHeightRef.current = safeHeight
    if (spacerElementRef.current) {
      spacerElementRef.current.style.height = `${safeHeight}px`
    }
  }, [])

  const clearPendingPin = useCallback(() => {
    pendingPinRef.current = null
    if (pendingPinFrameRef.current !== null) {
      cancelAnimationFrame(pendingPinFrameRef.current)
      pendingPinFrameRef.current = null
    }
    if (pendingPinTimeoutRef.current !== null) {
      clearTimeout(pendingPinTimeoutRef.current)
      pendingPinTimeoutRef.current = null
    }
  }, [])

  const clearPinSession = useCallback(() => {
    pinSessionRef.current = null
    const context = conversationContextRef.current
    if (context) {
      context.targetScrollTop = null
    }
    setSpacerHeight(0)
  }, [setSpacerHeight])

  const recalculateTopPinSpacer = useCallback(() => {
    const pinSession = pinSessionRef.current
    if (!pinSession || pinSession.mode !== "pinning") {
      return
    }
    if (activeChatIdRef.current !== pinSession.chatId) {
      return
    }

    const context = conversationContextRef.current
    const scrollElement = context?.scrollRef.current
    if (!context || !scrollElement) {
      return
    }

    const baseMaxScrollTop = Math.max(
      0,
      scrollElement.scrollHeight - scrollElement.clientHeight - spacerHeightRef.current
    )
    const nextSpacerHeight = Math.max(0, pinSession.anchorScrollTop - baseMaxScrollTop)

    if (nextSpacerHeight > EPSILON) {
      setSpacerHeight(nextSpacerHeight)
      return
    }

    pinSessionRef.current = {
      ...pinSession,
      mode: "released"
    }
    context.targetScrollTop = null
    setSpacerHeight(0)
  }, [setSpacerHeight])

  const scheduleRecalculateTopPinSpacer = useCallback(() => {
    if (recalcFrameRef.current !== null) {
      return
    }

    recalcFrameRef.current = requestAnimationFrame(() => {
      recalcFrameRef.current = null
      recalculateTopPinSpacer()
    })
  }, [recalculateTopPinSpacer])

  const attemptPendingPin = useCallback(() => {
    if (pendingPinFrameRef.current !== null) {
      return
    }

    const pendingPin = pendingPinRef.current
    if (!pendingPin) {
      return
    }

    if (
      Date.now() - pendingPin.createdAt > PENDING_TIMEOUT_MS ||
      pendingPin.retries >= MAX_PENDING_FRAMES
    ) {
      clearPendingPin()
      return
    }

    const context = conversationContextRef.current
    const scrollElement = context?.scrollRef.current
    const messageNode = messageNodeByIdRef.current.get(pendingPin.messageId)

    if (
      activeChatIdRef.current !== pendingPin.chatId ||
      !context ||
      !scrollElement ||
      !messageNode ||
      !messageNode.isConnected
    ) {
      pendingPin.retries += 1
      pendingPinFrameRef.current = requestAnimationFrame(() => {
        pendingPinFrameRef.current = null
        attemptPendingPin()
      })
      return
    }

    pendingPin.retries += 1
    pendingPinFrameRef.current = requestAnimationFrame(() => {
      pendingPinFrameRef.current = null
      pendingPinFrameRef.current = requestAnimationFrame(() => {
        pendingPinFrameRef.current = null

        const latestPendingPin = pendingPinRef.current
        if (
          !latestPendingPin ||
          latestPendingPin.chatId !== pendingPin.chatId ||
          latestPendingPin.messageId !== pendingPin.messageId
        ) {
          return
        }

        const latestContext = conversationContextRef.current
        const latestScrollElement = latestContext?.scrollRef.current
        const latestMessageNode = messageNodeByIdRef.current.get(latestPendingPin.messageId)

        if (
          activeChatIdRef.current !== latestPendingPin.chatId ||
          !latestContext ||
          !latestScrollElement ||
          !latestMessageNode ||
          !latestMessageNode.isConnected
        ) {
          latestPendingPin.retries += 1
          attemptPendingPin()
          return
        }

        const anchorScrollTop = Math.max(0, latestMessageNode.offsetTop - TOP_PIN_OFFSET)
        pinSessionRef.current = {
          chatId: latestPendingPin.chatId,
          messageId: latestPendingPin.messageId,
          anchorScrollTop,
          mode: "pinning"
        }
        latestContext.targetScrollTop = targetScrollTop => {
          const activePinSession = pinSessionRef.current
          if (!activePinSession || activePinSession.mode !== "pinning") {
            return targetScrollTop
          }
          if (activeChatIdRef.current !== activePinSession.chatId) {
            return targetScrollTop
          }
          return Math.max(0, Math.min(activePinSession.anchorScrollTop, targetScrollTop))
        }
        if (latestPendingPin.scrollBehavior === "smooth") {
          void latestContext.scrollToBottom({
            animation: SEND_SCROLL_ANIMATION,
            duration: RETAIN_ANIMATION_DURATION_MS,
            ignoreEscapes: true
          })
        } else {
          latestScrollElement.scrollTop = anchorScrollTop
        }
        clearPendingPin()
        scheduleRecalculateTopPinSpacer()
      })
    })
  }, [clearPendingPin, scheduleRecalculateTopPinSpacer])

  const startPendingPin = useCallback(
    (chatId: ChatId, messageId: MessageId, scrollBehavior: "instant" | "smooth") => {
      clearPendingPin()
      clearPinSession()

      pendingPinRef.current = {
        chatId,
        messageId,
        createdAt: Date.now(),
        retries: 0,
        scrollBehavior
      }
      pendingPinTimeoutRef.current = window.setTimeout(() => {
        const latestPendingPin = pendingPinRef.current
        if (
          latestPendingPin &&
          latestPendingPin.chatId === chatId &&
          latestPendingPin.messageId === messageId
        ) {
          clearPendingPin()
        }
      }, PENDING_TIMEOUT_MS)

      attemptPendingPin()
    },
    [attemptPendingPin, clearPendingPin, clearPinSession]
  )

  const setUserMessageNodeRef = useCallback(
    (messageId: MessageId, node: HTMLDivElement | null) => {
      if (node) {
        messageNodeByIdRef.current.set(messageId, node)
      } else {
        messageNodeByIdRef.current.delete(messageId)
      }

      if (node && pendingPinRef.current?.messageId === messageId) {
        attemptPendingPin()
      }
    },
    [attemptPendingPin]
  )

  const getMessageNodeRef = useCallback(
    (messageId: MessageId, role: UIMessage["role"]) => {
      if (role !== "user") {
        return undefined
      }

      const existing = messageNodeRefCallbacksRef.current.get(messageId)
      if (existing) {
        return existing
      }

      const callback = (node: HTMLDivElement | null) => {
        setUserMessageNodeRef(messageId, node)
      }
      messageNodeRefCallbacksRef.current.set(messageId, callback)
      return callback
    },
    [setUserMessageNodeRef]
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
              "X-Model-Provider-Label": selectedModelRef.current?.providerLabel ?? "",
              "X-Model-Id": selectedModelRef.current?.api_id ?? "",
              "X-Model-Label": selectedModelRef.current?.label ?? "",
              "X-Use-Web-Search": useWebSearchRef.current.toString(),
              "X-Web-Search-Mode": webSearchModeRef.current,
              "X-Reasoning-Enabled": reasoningEnabledRef.current.toString(),
              "X-Reasoning-Effort": reasoningEffortRef.current,
              "X-Chat-Id": chatId
            })
          }),
          sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
          onFinish: ({ messages, isAbort, isDisconnect, isError }) => {
            void (async () => {
              try {
                if (!isError) {
                  await saveAllMessagesAsync(chatId, messages, { isAbort, isDisconnect, isError })

                  const lastMessage = messages.at(-1)
                  const shouldMarkUnread =
                    !isAbort &&
                    !isDisconnect &&
                    !isError &&
                    lastMessage?.role === "assistant" &&
                    (!(isDesktopChatPaneActive?.() ?? true) || activeChatIdRef.current !== chatId)

                  if (shouldMarkUnread) {
                    onChatUnread?.(chatId)
                  }
                }
              } catch (error) {
                console.error("[AppChat] Failed to persist finished messages:", error)
              } finally {
                onChatReplyingChange?.(chatId, false)
              }
            })()
          },
          onError: error => {
            onChatReplyingChange?.(chatId, false)
            showChatErrorToast(error)
          }
        })
      }

      // Track thinking/tool durations at the runtime level so background chats
      // (not rendered) still get accurate duration measurements.
      const thinkingStartTimes = new Map<MessageId, number>()
      const toolStartTimes = new Map<string, number>()
      let prevIsThinking = false
      let prevLastMsgId: string | null = null
      const prevToolStates = new Map<string, string>()
      let prevIsReplying =
        runtime.chat.status === "submitted" || runtime.chat.status === "streaming"

      const unsubscribeStatus = runtime.chat["~registerStatusCallback"](() => {
        const nextIsReplying =
          runtime.chat.status === "submitted" || runtime.chat.status === "streaming"
        if (nextIsReplying === prevIsReplying) {
          return
        }
        prevIsReplying = nextIsReplying
        onChatReplyingChange?.(chatId, nextIsReplying)
      })

      const unsubscribeMessages = runtime.chat["~registerMessagesCallback"](() => {
        const msgs = runtime.chat.messages
        const chatStatus = runtime.chat.status
        const lastMsg = msgs[msgs.length - 1]

        if (!lastMsg || lastMsg.role !== "assistant") {
          // Reset tracking when there's no assistant message
          if (prevIsThinking) {
            prevIsThinking = false
          }
          return
        }

        // Reset tracking when the assistant message changes
        if (prevLastMsgId !== null && prevLastMsgId !== lastMsg.id) {
          prevIsThinking = false
          prevToolStates.clear()
        }
        prevLastMsgId = lastMsg.id

        // --- Thinking duration tracking ---
        const isStreaming = chatStatus === "streaming"
        const lastPart = lastMsg.parts[lastMsg.parts.length - 1]
        const isThinking =
          isStreaming &&
          lastPart != null &&
          (lastPart.type === "step-start" || isReasoningUIPart(lastPart) || isToolUIPart(lastPart))

        if (isThinking && !prevIsThinking) {
          if (!thinkingStartTimes.has(lastMsg.id)) {
            thinkingStartTimes.set(lastMsg.id, Date.now())
          }
        } else if (!isThinking && prevIsThinking && thinkingStartTimes.has(lastMsg.id)) {
          const startTime = thinkingStartTimes.get(lastMsg.id)
          if (startTime !== undefined) {
            const durationS = Math.round(((Date.now() - startTime) / 1000) * 10) / 10
            runtime.thinkingDurations.set(lastMsg.id, durationS)
          }
          thinkingStartTimes.delete(lastMsg.id)
        }
        prevIsThinking = !!isThinking

        // --- Tool duration tracking ---
        for (const part of lastMsg.parts) {
          if (!isToolUIPart(part)) {
            continue
          }
          const { toolCallId, state } = part
          const prevState = prevToolStates.get(toolCallId)

          const isActive =
            state === "input-streaming" ||
            state === "input-available" ||
            state === "approval-responded"

          if (isActive && !toolStartTimes.has(toolCallId)) {
            toolStartTimes.set(toolCallId, Date.now())
          }

          if (
            (state === "output-available" || state === "output-error") &&
            toolStartTimes.has(toolCallId)
          ) {
            const startTime = toolStartTimes.get(toolCallId)
            if (startTime !== undefined) {
              const durationS = Math.round(((Date.now() - startTime) / 1000) * 10) / 10
              const prev = runtime.toolDurations.get(lastMsg.id) ?? {}
              runtime.toolDurations.set(lastMsg.id, { ...prev, [toolCallId]: durationS })
            }
            toolStartTimes.delete(toolCallId)
          }

          if (state === "output-denied") {
            toolStartTimes.delete(toolCallId)
          }

          prevToolStates.set(toolCallId, prevState ?? state)
        }
      })

      runtime.cleanup = () => {
        unsubscribeMessages()
        unsubscribeStatus()
        prevIsReplying = false
        thinkingStartTimes.clear()
        toolStartTimes.clear()
        prevToolStates.clear()
      }

      return runtime
    },
    [
      saveAllMessagesAsync,
      selectedModelRef,
      showChatErrorToast,
      onChatUnread,
      onChatReplyingChange,
      isDesktopChatPaneActive,
      sidecarApi,
      reasoningEnabledRef,
      useWebSearchRef,
      reasoningEffortRef,
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
        const truncatedTitle = firstMessageText ? generateChatTitle(firstMessageText) : undefined
        const newChatId = await createChat(truncatedTitle, { activate: false })
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
      const userMessageId = nanoid()

      runtime.chat.messages = runtime.chat.messages.concat([
        {
          id: userMessageId,
          role: "user",
          parts
        }
      ])

      await saveAllMessagesAsync(runtime.chatId, runtime.chat.messages, { isNewChat })
      onChatReplyingChange?.(runtime.chatId, true)

      void runtime.chat.sendMessage().catch(sendError => {
        onChatReplyingChange?.(runtime.chatId, false)
        console.error("[AppChat] Failed to send message:", sendError)
      })

      // Fire-and-forget: LLM title generation for new chats
      if (isNewChat && messageText) {
        const model = selectedModelRef.current
        if (model) {
          void generateTitle(messageText, model.provider, model.api_id).then(title => {
            if (title) {
              void updateChatTitle(runtime.chatId, title)
            }
          })
        }
      }
      return userMessageId
    },
    [onChatReplyingChange, saveAllMessagesAsync, selectedModelRef, updateChatTitle]
  )

  useLayoutEffect(() => {
    activeChatIdRef.current = activeChatId ?? null
  }, [activeChatId])

  useEffect(() => {
    newChatTokenRef.current = newChatToken
  }, [newChatToken])

  useEffect(() => {
    const currentChatId = activeChatId ?? null
    messageNodeByIdRef.current.clear()
    messageNodeRefCallbacksRef.current.clear()

    const pendingPin = pendingPinRef.current
    if (pendingPin && pendingPin.chatId !== currentChatId) {
      clearPendingPin()
    }

    const pinSession = pinSessionRef.current
    if (pinSession && pinSession.chatId !== currentChatId) {
      clearPinSession()
    }
  }, [activeChatId, clearPendingPin, clearPinSession])

  useEffect(
    () => () => {
      clearPendingPin()
      clearPinSession()
      messageNodeByIdRef.current.clear()
      messageNodeRefCallbacksRef.current.clear()
      if (recalcFrameRef.current !== null) {
        cancelAnimationFrame(recalcFrameRef.current)
        recalcFrameRef.current = null
      }
      for (const runtime of sessionRuntimesRef.current.values()) {
        runtime.cleanup?.()
      }
    },
    [clearPendingPin, clearPinSession]
  )

  useEffect(() => {
    const draft = draftByKeyRef.current.get(currentDraftKey) ?? ""
    setInput(draft)
  }, [currentDraftKey])

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (!focusTargetKey) {
        return
      }
      textareaRef.current?.focus()
    })

    return () => cancelAnimationFrame(frameId)
  }, [focusTargetKey])

  useEffect(() => {
    if (!spacerElementRef.current) {
      return
    }
    spacerElementRef.current.style.height = `${spacerHeightRef.current}px`
  }, [])

  useEffect(() => {
    const knownChatIds = new Set(chats.map(chat => chat.id))

    for (const chatId of sessionRuntimesRef.current.keys()) {
      if (!knownChatIds.has(chatId)) {
        sessionRuntimesRef.current.get(chatId)?.cleanup?.()
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

  useLayoutEffect(() => {
    if (!pendingPinRef.current) {
      return
    }
    attemptPendingPin()
  }, [attemptPendingPin])

  useEffect(() => {
    scheduleRecalculateTopPinSpacer()
  }, [scheduleRecalculateTopPinSpacer])

  useEffect(() => {
    let isDisposed = false
    let setupFrameId: number | null = null
    let scrollObserver: ResizeObserver | null = null
    let contentObserver: ResizeObserver | null = null

    const setupObservers = () => {
      if (isDisposed) {
        return
      }

      const context = conversationContextRef.current
      const scrollElement = context?.scrollRef.current
      const contentElement = context?.contentRef.current

      if (!scrollElement || !contentElement) {
        setupFrameId = requestAnimationFrame(setupObservers)
        return
      }

      scrollObserver = new ResizeObserver(() => {
        scheduleRecalculateTopPinSpacer()
      })
      contentObserver = new ResizeObserver(() => {
        scheduleRecalculateTopPinSpacer()
      })
      scrollObserver.observe(scrollElement)
      contentObserver.observe(contentElement)
      window.addEventListener("resize", scheduleRecalculateTopPinSpacer)
    }

    setupObservers()

    return () => {
      isDisposed = true
      if (setupFrameId !== null) {
        cancelAnimationFrame(setupFrameId)
      }
      scrollObserver?.disconnect()
      contentObserver?.disconnect()
      window.removeEventListener("resize", scheduleRecalculateTopPinSpacer)
    }
  }, [scheduleRecalculateTopPinSpacer])

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
      if (status !== "ready") {
        throw new Error("CHAT_NOT_READY")
      }

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

        const userMessageId = await appendUserMessageAndSend(runtime, messageText, message.files)
        const shouldSmoothScroll = !(conversationContextRef.current?.isAtBottom ?? true)
        startPendingPin(runtime.chatId, userMessageId, shouldSmoothScroll ? "smooth" : "instant")
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
      status,
      startPendingPin,
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
  const showIntroEmptyState = !activeChatId && messages.length === 0 && status === "ready"

  const lastMessage = messages[messages.length - 1]
  const isAwaitingAssistantReply =
    (status === "submitted" && lastMessage?.role === "user") ||
    ((status === "streaming" || status === "error") && lastMessage?.parts.length === 0)
  const latestAssistantUsage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role !== "assistant") {
        continue
      }
      const metadata = message.metadata as AssistantMessageMetadata | undefined
      if (metadata?.totalUsage) {
        return metadata.totalUsage
      }
    }
    return undefined
  }, [messages])

  return (
    <div className="flex h-full flex-col">
      {/* Top */}
      <TopFloatingHeader contentClassName="justify-center">
        <SelectModel
          value={selectedModel ?? undefined}
          onChange={model => setSelectedModelApiId(model.api_id)}
        />
      </TopFloatingHeader>

      {/* Middle */}
      <div className="flex-1 min-h-0">
        <Conversation className="h-full" contextRef={conversationContextRef}>
          <ConversationContent className={cn(showIntroEmptyState && "min-h-full justify-center")}>
            {showIntroEmptyState ? (
              <NewChatEmptyState />
            ) : (
              messages.map((message, index) => {
                const messageText = message.parts
                  .filter(isTextUIPart)
                  .map(part => part.text)
                  .join("")
                const metadata = message.metadata as AssistantMessageMetadata | undefined
                const messageModelPricing = findModelPricing(
                  metadata?.modelProvider,
                  metadata?.modelId
                )
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
                  steps.some(step =>
                    step.some(part => isReasoningUIPart(part) || isToolUIPart(part))
                  )
                const lastStep = currentStep.at(-1)
                const isThinkingComplete =
                  !isThinkingStreaming ||
                  (lastStep && isReasoningUIPart(lastStep) && lastStep.state !== "streaming")
                const toolParts = message.parts.filter(isToolUIPart)
                const messageToolDurations =
                  metadata?.toolDurations ?? toolDurations?.get(message.id)
                const timelineParts = steps.flatMap(step =>
                  step.filter(part => isReasoningUIPart(part) || isToolUIPart(part))
                )

                const hasTools = toolParts.length > 0
                const isUserMessage = message.role === "user"
                const isAssistantMessage = message.role === "assistant"

                return (
                  <MessageBranch defaultBranch={0} key={message.id}>
                    <MessageBranchContent>
                      <Message
                        from={message.role}
                        key={message.id}
                        ref={getMessageNodeRef(message.id, message.role)}
                      >
                        {isAssistantMessage && hasThinkingProcess && (
                          <ThinkingProcess
                            isStreaming={isThinkingStreaming}
                            defaultOpen={isThinkingStreaming}
                            totalDuration={
                              metadata?.thinkingDuration ?? thinkingDurations?.get(message.id)
                            }
                          >
                            <ThinkingProcessTrigger />
                            <ThinkingProcessContent>
                              {timelineParts.map(part =>
                                isToolUIPart(part) ? (
                                  <div key={`${message.id}-${part.partIndex}`}>
                                    <ReasoningPart
                                      partSource={part}
                                      isChatStreaming={isCurrentlyStreaming}
                                    />
                                    <div className="mt-2.5">
                                      <ToolCallTimelineItem
                                        part={part}
                                        duration={messageToolDurations?.[part.toolCallId]}
                                        onToolApprovalResponse={addToolApprovalResponse}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <ReasoningPart
                                    key={`${message.id}-${part.partIndex}`}
                                    partSource={part}
                                    isChatStreaming={isCurrentlyStreaming}
                                  />
                                )
                              )}

                              {isThinkingComplete ? (
                                <ThinkingProcessCompletion stepCount={steps.length} />
                              ) : (
                                <div className="relative my-0">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground relative my-2">
                                    <CircleIcon className="ml-1 size-1.5 text-muted-foreground/80 fill-current" />
                                    <Shimmer duration={1}>
                                      {t("chat:message.thinkingInProgress")}
                                    </Shimmer>
                                  </div>
                                </div>
                              )}
                            </ThinkingProcessContent>
                          </ThinkingProcess>
                        )}

                        {isAssistantMessage && hasTools && isThinkingComplete && (
                          <ToolCallsSummary toolCount={toolParts.length} />
                        )}

                        <MessageContent>
                          {isUserMessage ? (
                            <div className="whitespace-pre-wrap wrap-break-word">{messageText}</div>
                          ) : (
                            <MessageResponse localImageProxyOrigin={sidecarOrigin}>
                              {messageText}
                            </MessageResponse>
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
                              modelProvider={metadata?.modelProvider}
                              modelProviderLabel={metadata?.modelProviderLabel}
                              modelId={metadata?.modelId}
                              modelLabel={metadata?.modelLabel}
                              modelPricing={messageModelPricing}
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
              })
            )}

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

            {!showIntroEmptyState && (
              <div
                aria-hidden="true"
                className="w-full pointer-events-none"
                ref={spacerElementRef}
                style={{ height: "0px" }}
              />
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
                      { ...toolButtonConstants.webSearch.modes.auto, icon: SparklesIcon },
                      { ...toolButtonConstants.webSearch.modes.always, icon: ZapIcon }
                    ]}
                    selectedMode={webSearchMode}
                    onModeChange={mode => setWebSearchMode(mode as "auto" | "always")}
                  />

                  <ToolButton
                    icon={BrainIcon}
                    label={toolButtonConstants.reasoning.label}
                    tooltip={toolButtonConstants.reasoning.tooltip}
                    panelDescription={toolButtonConstants.reasoning.description}
                    enabled={reasoningEnabled}
                    onEnabledChange={setReasoningEnabled}
                    collapsed={isCondensed}
                    modes={[
                      { ...toolButtonConstants.reasoning.modes.default, icon: BrainIcon },
                      { ...toolButtonConstants.reasoning.modes.low, icon: BrainIcon },
                      { ...toolButtonConstants.reasoning.modes.medium, icon: BrainIcon },
                      { ...toolButtonConstants.reasoning.modes.high, icon: BrainIcon },
                      { ...toolButtonConstants.reasoning.modes.xhigh, icon: BrainIcon }
                    ]}
                    selectedMode={preferredReasoningEffort}
                    onModeChange={mode => setPreferredReasoningEffort(mode as ReasoningEffort)}
                  />
                </PromptInputTools>

                {/* Tools in Right */}
                <PromptInputTools className="gap-2">
                  <ContextWindowUsageIndicator
                    contextWindow={selectedModel?.contextWindow}
                    usage={latestAssistantUsage}
                  />

                  {latestAssistantUsage && (
                    <Separator orientation="vertical" className="h-3! mr-1" />
                  )}

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
  draftStore,
  isDesktopChatPaneActive,
  createChat,
  loadMessages,
  saveChatAllMessages,
  updateChatTitle,
  onRequestActivateChat,
  onChatUnread,
  onChatReplyingChange
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
      draftStore={draftStore}
      isDesktopChatPaneActive={isDesktopChatPaneActive}
      createChat={createChat}
      loadMessages={loadMessages}
      saveChatAllMessages={saveChatAllMessages}
      updateChatTitle={updateChatTitle}
      onRequestActivateChat={onRequestActivateChat}
      onChatUnread={onChatUnread}
      onChatReplyingChange={onChatReplyingChange}
      sidecarApi={sidecarApi}
    />
  )
}

export { AppChat }
