import { Chat as AiChat } from "@ai-sdk/react"
import {
  type ChatAddToolApproveResponseFunction,
  DefaultChatTransport,
  type FileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type TextUIPart,
  type UIMessage
} from "ai"
import { BrainIcon, GlobeIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { nanoid } from "nanoid"
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ContextWindowUsageIndicator } from "@/components/ai-elements/context-window-usage-indicator"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton
} from "@/components/ai-elements/conversation"
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
import { SessionTokenUsage } from "@/components/ai-elements/session-token-usage"
import {
  ChatMessageTimeline,
  type ChatMessageTimelineAnchor
} from "@/components/ChatMessageTimeline"
import { ChatTranscript } from "@/components/chat-transcript"
import { NewChatEmptyState } from "@/components/new-chat-empty-state"
import { SelectModel } from "@/components/select-model"
import { ToolButton } from "@/components/tool-button"
import { TopFloatingHeader } from "@/components/top-floating-header"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAvailableModels } from "@/hooks/use-available-models"
import type { ConversationScrollController } from "@/hooks/use-conversation-scroll"
import { useLatest } from "@/hooks/use-latest"
import { useObservableValue } from "@/hooks/use-observable-value"
import { useSetting } from "@/hooks/use-settings-store"
import {
  commitChatContext,
  estimateMissingChatUsage,
  getContextErrorKey,
  loadChatContext,
  loadChatUsage,
  waitForChatCommit
} from "@/lib/chat-context"
import {
  CHAT_MESSAGE_TIMELINE_SCROLL_TOLERANCE,
  getActiveTimelineAnchorIndex
} from "@/lib/chat-message-timeline"
import { ChatRenderStore } from "@/lib/chat-render-store"
import { generateChatTitle } from "@/lib/chat-utils"
import { useToastConstants, useToolButtonConstants, useTooltipConstants } from "@/lib/constants"
import {
  getContextUsageForModel,
  resolveConversationContextUsage
} from "@/lib/context-window-usage"
import {
  mergeSessionUsage,
  type SessionUsageRecords,
  summarizeSessionUsage,
  type UsageMessage
} from "@/lib/session-usage"
import { generateTitle, getSidecarUrl } from "@/lib/sidecar-client"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import type { ChatId, MessageId, Chat as StoredChat } from "@/types/chat"
import type { ReasoningEffort } from "@/types/settings"
import type { ContextState, ConversationCheckpoint } from "../../shared/context"
import { contextStateSchema, emptyContextState } from "../../shared/context"

interface AppChatProps {
  activeChatId?: ChatId | null
  chats: StoredChat[]
  newChatToken: string | null
  draftStore: Map<string, string>
  desktopChatPaneVisible: boolean
  isDesktopChatPaneActive?: () => boolean
  createChat: (title?: string, options?: { activate?: boolean }) => Promise<ChatId>
  loadMessages: (chatId: ChatId) => Promise<UIMessage[]>
  saveChatAllMessages: (chatId: ChatId, messages: UIMessage[], isNewChat?: boolean) => Promise<void>
  updateChatTitle: (
    chatId: ChatId,
    title: string,
    options?: { expectedCurrentTitle?: string }
  ) => Promise<void>
  onRequestActivateChat?: (chatId: ChatId, tokenAtSend: string) => void
  onChatUnread?: (chatId: ChatId) => void
  onChatReplyingChange?: (chatId: ChatId, isReplying: boolean) => void
}

interface AppChatInnerProps extends AppChatProps {
  sidecarApi: string
}

type SaveMessageOptions = {
  isAbort?: boolean
  isDisconnect?: boolean
  isError?: boolean
  isNewChat?: boolean
}

interface SessionRuntime {
  chatId: ChatId
  contextState: ContextState
  compactionAbort?: AbortController
  requestHeaders: () => Record<string, string>
  chat: AiChat<UIMessage>
  renderStore: ChatRenderStore
  hydrated: boolean
  isHydrating: boolean
  thinkingDurations: Map<MessageId, number>
  reasoningDurations: Map<MessageId, Record<string, number>>
  toolDurations: Map<MessageId, Record<string, number>>
  cleanup?: () => void
}

const getDraftKey = (chatId: ChatId | null | undefined) => (chatId ? `chat:${chatId}` : "new")

const EMPTY_SESSION_USAGE: SessionUsageRecords = new Map()

const TIMELINE_PREVIEW_LENGTH = 10

function getTimelinePreview(text: string): string {
  const normalizedText = text.replace(/\s+/g, " ").trim()
  if (!normalizedText) {
    return ""
  }

  const characters = Array.from(normalizedText)
  if (characters.length <= TIMELINE_PREVIEW_LENGTH) {
    return normalizedText
  }

  return `${characters.slice(0, TIMELINE_PREVIEW_LENGTH).join("")}...`
}

const AppChatInner = ({
  activeChatId,
  chats,
  newChatToken,
  draftStore,
  desktopChatPaneVisible,
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
  const activeChatIdRef = useRef<ChatId | null>(activeChatId ?? null)
  const newChatTokenRef = useRef<string | null>(newChatToken)
  const conversationContextRef = useRef<ConversationScrollController | null>(null)

  const sessionRuntimesRef = useRef<Map<ChatId, SessionRuntime>>(new Map())
  const pendingChatByTokenRef = useRef<Map<string, Promise<ChatId>>>(new Map())
  const draftByKeyRef = useRef<Map<string, string>>(draftStore)
  const hydrationRequestSeqRef = useRef<Map<ChatId, number>>(new Map())
  const draftRenderStoreRef = useRef<ChatRenderStore | null>(null)
  if (!draftRenderStoreRef.current) {
    draftRenderStoreRef.current = new ChatRenderStore()
  }
  const messageNodeByIdRef = useRef<Map<MessageId, HTMLDivElement>>(new Map())
  const messageNodeRefCallbacksRef = useRef<Map<MessageId, (node: HTMLDivElement | null) => void>>(
    new Map()
  )
  const [contextStates, setContextStates] = useState<Record<string, ContextState>>({})
  const [sessionUsageRecords, setSessionUsageRecords] = useState<
    Record<string, SessionUsageRecords>
  >({})
  const recordUsageMessages = useCallback((chatId: string, incoming: UsageMessage[]) => {
    setSessionUsageRecords(previous => {
      const records = previous[chatId] ?? EMPTY_SESSION_USAGE
      const next = mergeSessionUsage(records, incoming)
      return next === records ? previous : { ...previous, [chatId]: next }
    })
  }, [])
  const [compactingChats, setCompactingChats] = useState<Record<string, boolean>>({})
  const timelineItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const timelineAnchorOffsetsRef = useRef<number[]>([])
  const timelineGeometryDirtyRef = useRef(true)
  const timelineScrollFrameRef = useRef<number | null>(null)
  const [activeTimelineIndex, setActiveTimelineIndex] = useState(-1)

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
    (error: Error, fallbackDescription?: string) => {
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
        const contextErrorKey = getContextErrorKey(error.message)
        toast.error(toastConstants.error, {
          description: contextErrorKey
            ? t(`chat:compaction.${contextErrorKey}`)
            : (fallbackDescription ?? error.message)
        })
      }
    },
    [t, toastConstants]
  )

  const setUserMessageNodeRef = useCallback((messageId: MessageId, node: HTMLDivElement | null) => {
    if (node) {
      messageNodeByIdRef.current.set(messageId, node)
    } else {
      messageNodeByIdRef.current.delete(messageId)
    }
  }, [])

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
        const cachedReasoningDurations = runtime.reasoningDurations.get(msg.id)
        const cachedToolDurations = runtime.toolDurations.get(msg.id)
        const hasReasoningDurations =
          cachedReasoningDurations !== undefined && Object.keys(cachedReasoningDurations).length > 0
        const hasToolDurations =
          cachedToolDurations !== undefined && Object.keys(cachedToolDurations).length > 0

        if (msg.role === "assistant") {
          const hasRuntimeMetadata =
            cachedDuration !== undefined || hasReasoningDurations || hasToolDurations

          if (!hasRuntimeMetadata) {
            return msg
          }

          return {
            ...msg,
            metadata: {
              ...(msg.metadata || {}),
              ...(cachedDuration !== undefined ? { thinkingDuration: cachedDuration } : {}),
              ...(hasReasoningDurations ? { reasoningDurations: cachedReasoningDurations } : {}),
              ...(hasToolDurations ? { toolDurations: cachedToolDurations } : {})
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
          if (activeChatIdRef.current === chatId) {
            runtime.chat.messages = allMessagesWithMetadata
          }
        }
      }

      await saveChatAllMessages(chatId, allMessagesWithMetadata, options?.isNewChat ?? false)
    },
    [saveChatAllMessages]
  )

  const createSessionRuntime = useCallback(
    (
      chatId: ChatId,
      options?: { hydrated?: boolean; initialMessages?: UIMessage[] }
    ): SessionRuntime => {
      const renderStore = new ChatRenderStore()
      renderStore.setVisible(desktopChatPaneVisible && activeChatId === chatId)
      const requestHeaders = () => ({
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
      const runtime: SessionRuntime = {
        chatId,
        contextState: emptyContextState(),
        requestHeaders,
        hydrated: options?.hydrated ?? false,
        isHydrating: false,
        thinkingDurations: new Map<MessageId, number>(),
        reasoningDurations: new Map<MessageId, Record<string, number>>(),
        toolDurations: new Map<MessageId, Record<string, number>>(),
        renderStore,
        chat: new AiChat<UIMessage>({
          id: chatId,
          messages: options?.initialMessages ?? [],
          transport: new DefaultChatTransport({
            api: sidecarApi,
            headers: requestHeaders,
            prepareSendMessagesRequest: async ({ id, messages, trigger, messageId }) => {
              if (runtime.compactionAbort) {
                throw new Error("CHAT_NOT_READY")
              }
              await waitForChatCommit(chatId)
              runtime.contextState = await loadChatContext(chatId)
              return {
                body: {
                  id,
                  chatId,
                  messages,
                  trigger,
                  messageId,
                  contextState: runtime.contextState
                }
              }
            }
          }),
          sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
          onData: part => {
            if (part.type === "data-compaction-status") {
              const data = part.data as { chatId: string; status: string }
              if (data.chatId === chatId) {
                setCompactingChats(previous => ({
                  ...previous,
                  [chatId]: data.status === "compacting"
                }))
              }
            }
            if (part.type !== "data-context-checkpoint") {
              return
            }
            const data = part.data as ConversationCheckpoint
            if (data.chatId !== chatId) {
              return
            }
            const contextState = contextStateSchema.parse(data.contextState)
            runtime.contextState = contextState
            recordUsageMessages(chatId, data.messages)
            setContextStates(previous => ({ ...previous, [chatId]: contextState }))
            void commitChatContext(chatId, data.messages, data.messageIds, contextState).catch(
              error => {
                void runtime.chat.stop()
                showChatErrorToast(error instanceof Error ? error : new Error(String(error)))
              }
            )
          },
          onFinish: ({ messages, isAbort, isDisconnect, isError }) => {
            recordUsageMessages(chatId, messages)
            void (async () => {
              try {
                {
                  const lastMessage = messages.at(-1)
                  if (lastMessage?.role === "assistant") {
                    finishReasoningDurationsForMessage(lastMessage.id)
                    renderStore.publishMessagesNow(messages)
                    renderStore.notifyMessage(lastMessage.id)
                  }

                  await saveAllMessagesAsync(chatId, messages, { isAbort, isDisconnect, isError })

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
                setCompactingChats(previous => ({ ...previous, [chatId]: false }))
                onChatReplyingChange?.(chatId, false)
              }
            })()
          },
          onError: error => {
            setCompactingChats(previous => ({ ...previous, [chatId]: false }))
            onChatReplyingChange?.(chatId, false)
            showChatErrorToast(error)
          }
        })
      }

      // Track thinking/tool durations at the runtime level so background chats
      // (not rendered) still get accurate duration measurements.
      const thinkingStartTimes = new Map<MessageId, number>()
      const reasoningStartTimes = new Map<MessageId, Map<number, number>>()
      const toolStartTimes = new Map<string, number>()
      let prevIsThinking = false
      let prevLastMsgId: string | null = null
      const prevToolStates = new Map<string, string>()
      let prevIsReplying =
        runtime.chat.status === "submitted" || runtime.chat.status === "streaming"

      const getReasoningStartTimesForMessage = (messageId: MessageId) => {
        let messageStartTimes = reasoningStartTimes.get(messageId)
        if (!messageStartTimes) {
          messageStartTimes = new Map<number, number>()
          reasoningStartTimes.set(messageId, messageStartTimes)
        }

        return messageStartTimes
      }

      const hasReasoningStartTime = (messageId: MessageId, partIndex: number) =>
        reasoningStartTimes.get(messageId)?.has(partIndex) ?? false

      const hasReasoningDuration = (messageId: MessageId, partIndex: number) =>
        runtime.reasoningDurations.get(messageId)?.[String(partIndex)] !== undefined

      const startReasoningDuration = (messageId: MessageId, partIndex: number) => {
        const messageStartTimes = getReasoningStartTimesForMessage(messageId)
        if (!messageStartTimes.has(partIndex)) {
          messageStartTimes.set(partIndex, Date.now())
        }
      }

      const finishReasoningDuration = (
        messageId: MessageId,
        partIndex: number,
        endTime = Date.now()
      ) => {
        const messageStartTimes = reasoningStartTimes.get(messageId)
        const startTime = messageStartTimes?.get(partIndex)
        if (startTime === undefined) {
          return
        }

        const durationS = Math.round(((endTime - startTime) / 1000) * 10) / 10
        const prev = runtime.reasoningDurations.get(messageId) ?? {}
        runtime.reasoningDurations.set(messageId, { ...prev, [String(partIndex)]: durationS })
        messageStartTimes?.delete(partIndex)
        if (messageStartTimes?.size === 0) {
          reasoningStartTimes.delete(messageId)
        }
      }

      const finishReasoningDurationsForMessage = (messageId: MessageId, endTime = Date.now()) => {
        const messageStartTimes = reasoningStartTimes.get(messageId)
        if (!messageStartTimes) {
          return
        }

        for (const partIndex of Array.from(messageStartTimes.keys())) {
          finishReasoningDuration(messageId, partIndex, endTime)
        }
      }

      const unsubscribeStatus = runtime.chat["~registerStatusCallback"](() => {
        renderStore.publishStatus(runtime.chat.status)
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
        renderStore.enqueueMessages(msgs)
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
          const previousMessageId = prevLastMsgId
          prevIsThinking = false
          finishReasoningDurationsForMessage(previousMessageId)
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

        // --- Per-reasoning segment duration tracking ---
        const activeReasoningPartIndex =
          isStreaming &&
          lastPart !== undefined &&
          isReasoningUIPart(lastPart) &&
          lastPart.state === "streaming"
            ? lastMsg.parts.length - 1
            : null

        for (let partIndex = 0; partIndex < lastMsg.parts.length; partIndex += 1) {
          const part = lastMsg.parts[partIndex]
          if (!isReasoningUIPart(part)) {
            continue
          }

          const isActiveReasoning = activeReasoningPartIndex === partIndex

          if (
            !hasReasoningStartTime(lastMsg.id, partIndex) &&
            !hasReasoningDuration(lastMsg.id, partIndex)
          ) {
            startReasoningDuration(lastMsg.id, partIndex)
          }

          if (!isActiveReasoning && hasReasoningStartTime(lastMsg.id, partIndex)) {
            finishReasoningDuration(lastMsg.id, partIndex)
          }
        }

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

      const unsubscribeError = runtime.chat["~registerErrorCallback"](() => {
        renderStore.publishError(runtime.chat.error)
      })

      renderStore.publishMessagesNow(runtime.chat.messages)
      renderStore.publishStatus(runtime.chat.status)
      renderStore.publishError(runtime.chat.error)

      runtime.cleanup = () => {
        runtime.compactionAbort?.abort()
        unsubscribeMessages()
        unsubscribeStatus()
        unsubscribeError()
        renderStore.dispose()
        prevIsReplying = false
        thinkingStartTimes.clear()
        reasoningStartTimes.clear()
        toolStartTimes.clear()
        prevToolStates.clear()
      }

      return runtime
    },
    [
      saveAllMessagesAsync,
      recordUsageMessages,
      selectedModelRef,
      showChatErrorToast,
      onChatUnread,
      onChatReplyingChange,
      isDesktopChatPaneActive,
      desktopChatPaneVisible,
      activeChatId,
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
          existing.renderStore.publishMessagesNow(existing.chat.messages)
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
        const [loadedMessages, contextState, usageMessages] = await Promise.all([
          loadMessages(chatId),
          loadChatContext(chatId),
          loadChatUsage(chatId)
        ])
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
        latestRuntime.renderStore.publishMessagesNow(latestRuntime.chat.messages)

        recordUsageMessages(chatId, usageMessages)
        latestRuntime.contextState = contextState
        setContextStates(previous => ({ ...previous, [chatId]: contextState }))
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
    [loadMessages, recordUsageMessages]
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
      if (runtime.compactionAbort || !runtime.hydrated) {
        throw new Error("CHAT_NOT_READY")
      }
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
          parts,
          metadata: { createdAt: Date.now() }
        }
      ])
      runtime.renderStore.publishMessagesNow(runtime.chat.messages)

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
          const expectedCurrentTitle = generateChatTitle(messageText)
          void generateTitle(messageText, model.provider, model.api_id).then(title => {
            if (title) {
              void updateChatTitle(runtime.chatId, title, { expectedCurrentTitle })
            }
          })
        }
      }
    },
    [onChatReplyingChange, saveAllMessagesAsync, selectedModelRef, updateChatTitle]
  )

  useLayoutEffect(() => {
    activeChatIdRef.current = activeChatId ?? null
    messageNodeByIdRef.current.clear()
    messageNodeRefCallbacksRef.current.clear()
  }, [activeChatId])

  useEffect(() => {
    newChatTokenRef.current = newChatToken
  }, [newChatToken])

  useEffect(
    () => () => {
      messageNodeByIdRef.current.clear()
      messageNodeRefCallbacksRef.current.clear()
      if (timelineScrollFrameRef.current !== null) {
        cancelAnimationFrame(timelineScrollFrameRef.current)
        timelineScrollFrameRef.current = null
      }
      for (const runtime of sessionRuntimesRef.current.values()) {
        runtime.cleanup?.()
      }
      draftRenderStoreRef.current?.dispose()
    },
    []
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
    const knownChatIds = new Set(chats.map(chat => chat.id))

    for (const chatId of sessionRuntimesRef.current.keys()) {
      if (!knownChatIds.has(chatId)) {
        sessionRuntimesRef.current.get(chatId)?.cleanup?.()
        sessionRuntimesRef.current.delete(chatId)
        hydrationRequestSeqRef.current.delete(chatId)
        setSessionUsageRecords(previous => {
          if (!previous[chatId]) {
            return previous
          }
          const next = { ...previous }
          delete next[chatId]
          return next
        })
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
    draftRenderStoreRef.current?.setVisible(desktopChatPaneVisible && !activeChatId)
    for (const [chatId, runtime] of sessionRuntimesRef.current) {
      runtime.renderStore.setVisible(desktopChatPaneVisible && chatId === activeChatId)
    }
  }, [activeChatId, desktopChatPaneVisible])

  useEffect(() => {
    if (!activeChatId || !runtimeForActiveChat) {
      return
    }
    void hydrateSessionRuntime(activeChatId, runtimeForActiveChat)
  }, [activeChatId, hydrateSessionRuntime, runtimeForActiveChat])

  const activeRenderStore = runtimeForActiveChat?.renderStore ?? draftRenderStoreRef.current
  const status = useObservableValue(activeRenderStore.status())
  const error = useObservableValue(activeRenderStore.error())
  const messageOrder = useObservableValue(activeRenderStore.order())
  const orderedMessages = useMemo(
    () =>
      messageOrder.flatMap(messageId => {
        const message = activeRenderStore.message(messageId).getSnapshot()
        return message ? [message] : []
      }),
    [activeRenderStore, messageOrder]
  )

  const displayedContextState = activeChatId ? contextStates[activeChatId] : undefined
  const displayedContextUsage = getContextUsageForModel(
    resolveConversationContextUsage(
      runtimeForActiveChat?.chat.messages ?? [],
      displayedContextState
    ),
    selectedModel?.provider,
    selectedModel?.api_id
  )
  const displayedUsageRecords = activeChatId ? sessionUsageRecords[activeChatId] : undefined
  const sessionUsage = useMemo(
    () =>
      summarizeSessionUsage(
        displayedUsageRecords ?? EMPTY_SESSION_USAGE,
        displayedContextState?.events
      ),
    [displayedUsageRecords, displayedContextState?.events]
  )
  const inspectionHeadersKey = JSON.stringify([
    selectedModel?.provider,
    selectedModel?.providerLabel,
    selectedModel?.api_id,
    selectedModel?.label,
    useWebSearch,
    webSearchMode,
    reasoningEnabled,
    preferredReasoningEffort
  ])
  const contextCompacting = Boolean(activeChatId && compactingChats[activeChatId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: These inputs invalidate asynchronous reads of the mutable chat runtime.
  useEffect(() => {
    const runtime = runtimeForActiveChat
    if (
      !activeChatId ||
      !runtime ||
      displayedContextUsage?.breakdown ||
      !selectedModelRef.current ||
      contextCompacting
    ) {
      return
    }
    const controller = new AbortController()
    const chatId = activeChatId
    void estimateMissingChatUsage(
      sidecarApi,
      () => ({
        chatId,
        messages: runtime.chat.messages,
        contextState: runtime.contextState,
        status: runtime.chat.status,
        hydrated: runtime.hydrated,
        compacting: Boolean(runtime.compactionAbort),
        headers: runtime.requestHeaders()
      }),
      controller.signal
    )
      .then(usage => {
        if (
          !usage ||
          controller.signal.aborted ||
          sessionRuntimesRef.current.get(chatId) !== runtime
        ) {
          return
        }
        // Inspection is display-only; the next actual request commits authoritative usage.
        setContextStates(previous => ({
          ...previous,
          [chatId]: { ...runtime.contextState, usage }
        }))
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          console.warn("[AppChat] Context usage estimate unavailable", error)
        }
      })
    return () => controller.abort()
  }, [
    activeChatId,
    runtimeForActiveChat,
    displayedContextUsage,
    displayedContextState,
    status,
    inspectionHeadersKey,
    contextCompacting,
    sidecarApi,
    selectedModelRef
  ])

  useEffect(
    () =>
      conversationContextRef.current?.addLayoutListener(() => {
        timelineGeometryDirtyRef.current = true
      }),
    []
  )

  useEffect(() => {
    // Errors are shown by the toast and retained as metadata, never forged as model text.
    if (error) {
      runtimeForActiveChat?.chat.clearError()
    }
  }, [error, runtimeForActiveChat])

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

        // Leave the viewport to Conversation's default stick-to-bottom behavior.
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
      status,
      t,
      toastConstants
    ]
  )

  const handleStop = useCallback(() => {
    if (status === "streaming") {
      void runtimeForActiveChat?.chat.stop()
    }
  }, [runtimeForActiveChat, status])

  const handleToolApprovalResponse = useCallback<ChatAddToolApproveResponseFunction>(
    async response => {
      const runtime = activeChatIdRef.current
        ? sessionRuntimesRef.current.get(activeChatIdRef.current)
        : undefined
      if (!runtime || runtime.compactionAbort) {
        return
      }
      await runtime.chat.addToolApprovalResponse(response)
    },
    []
  )

  const handleRegenerate = useCallback((messageId: MessageId) => {
    const runtime = activeChatIdRef.current
      ? sessionRuntimesRef.current.get(activeChatIdRef.current)
      : undefined
    if (!runtime || runtime.compactionAbort) {
      return
    }
    void runtime.chat.regenerate({ messageId })
  }, [])

  const activeRuntime = runtimeForActiveChat
  const thinkingDurations = activeRuntime?.thinkingDurations
  const reasoningDurations = activeRuntime?.reasoningDurations
  const toolDurations = activeRuntime?.toolDurations
  const timelineAnchors = useMemo<ChatMessageTimelineAnchor[]>(
    () =>
      orderedMessages
        .filter(message => message.role === "user")
        .map(message => ({
          id: message.id,
          preview: getTimelinePreview(
            message.parts
              .filter(isTextUIPart)
              .map(part => part.text)
              .join("")
          )
        })),
    [orderedMessages]
  )

  const recalculateTimelineAnchorOffsets = useCallback((): number[] | null => {
    const anchorOffsets: number[] = []
    for (const anchor of timelineAnchors) {
      const messageNode = messageNodeByIdRef.current.get(anchor.id)
      if (!messageNode || !messageNode.isConnected) {
        return null
      }
      anchorOffsets.push(messageNode.offsetTop)
    }
    timelineAnchorOffsetsRef.current = anchorOffsets
    timelineGeometryDirtyRef.current = false
    return anchorOffsets
  }, [timelineAnchors])

  const syncActiveTimelineIndex = useCallback(() => {
    if (timelineAnchors.length === 0) {
      startTransition(() => {
        setActiveTimelineIndex(currentIndex => (currentIndex === -1 ? currentIndex : -1))
      })
      return
    }

    const scrollElement = conversationContextRef.current?.scrollRef.current
    if (!scrollElement) {
      return
    }

    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight)
    const isAtBottom =
      maxScrollTop <= CHAT_MESSAGE_TIMELINE_SCROLL_TOLERANCE ||
      scrollElement.scrollTop >= maxScrollTop - CHAT_MESSAGE_TIMELINE_SCROLL_TOLERANCE
    let nextActiveIndex = timelineAnchors.length - 1

    if (!isAtBottom) {
      const anchorOffsets =
        timelineGeometryDirtyRef.current ||
        timelineAnchorOffsetsRef.current.length !== timelineAnchors.length
          ? recalculateTimelineAnchorOffsets()
          : timelineAnchorOffsetsRef.current
      if (!anchorOffsets) {
        return
      }
      nextActiveIndex = getActiveTimelineAnchorIndex(anchorOffsets, scrollElement.scrollTop, {
        maxScrollTop,
        tolerance: CHAT_MESSAGE_TIMELINE_SCROLL_TOLERANCE,
        viewportHeight: scrollElement.clientHeight
      })
    }

    startTransition(() => {
      setActiveTimelineIndex(currentIndex =>
        currentIndex === nextActiveIndex ? currentIndex : nextActiveIndex
      )
    })
  }, [recalculateTimelineAnchorOffsets, timelineAnchors.length])

  const scheduleActiveTimelineSync = useCallback(() => {
    if (timelineScrollFrameRef.current !== null) {
      return
    }
    timelineScrollFrameRef.current = requestAnimationFrame(() => {
      timelineScrollFrameRef.current = null
      syncActiveTimelineIndex()
    })
  }, [syncActiveTimelineIndex])

  const scrollToTimelineIndex = useCallback(
    (index: number) => {
      const targetAnchor = timelineAnchors[index]
      if (!targetAnchor) {
        return
      }

      const conversationContext = conversationContextRef.current
      const scrollElement = conversationContext?.scrollRef.current
      const messageNode = messageNodeByIdRef.current.get(targetAnchor.id)
      if (!scrollElement || !messageNode || !messageNode.isConnected) {
        return
      }

      conversationContext.stopFollowing()
      startTransition(() => {
        setActiveTimelineIndex(currentIndex => (currentIndex === index ? currentIndex : index))
      })
      scrollElement.scrollTo({
        top: Math.max(0, messageNode.offsetTop),
        behavior: "smooth"
      })
    },
    [timelineAnchors]
  )

  const handleCompact = async () => {
    if (!activeChatId) {
      return
    }
    const runtime = sessionRuntimesRef.current.get(activeChatId)
    if (
      !runtime ||
      runtime.chat.status === "streaming" ||
      runtime.chat.status === "submitted" ||
      compactingChats[activeChatId]
    ) {
      return
    }
    const chatId = activeChatId
    setCompactingChats(previous => ({ ...previous, [chatId]: true }))
    const compactionAbort = new AbortController()
    runtime.compactionAbort = compactionAbort
    try {
      await waitForChatCommit(chatId)
      const response = await fetch(`${sidecarApi}/compact`, {
        signal: compactionAbort.signal,
        method: "POST",
        headers: { ...runtime.requestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          messages: runtime.chat.messages,
          contextState: runtime.contextState
        })
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || t("chat:compaction.failed"))
      }
      const contextState = contextStateSchema.parse(result.contextState)
      await commitChatContext(
        chatId,
        [],
        runtime.chat.messages.map(message => message.id),
        contextState
      )
      runtime.contextState = contextState
      setContextStates(previous => ({ ...previous, [chatId]: contextState }))
      if (result.compacted) {
        toast.success(t("chat:compaction.completed"))
      } else {
        toast.info(t("chat:compaction.unnecessary"))
      }
    } catch (error) {
      if (compactionAbort.signal.aborted) {
        toast.info(t("chat:compaction.cancelled"))
      } else {
        console.warn("[AppChat] Manual compaction failed", error)
        showChatErrorToast(
          error instanceof Error ? error : new Error(String(error)),
          t("chat:compaction.failed")
        )
      }
    } finally {
      runtime.compactionAbort = undefined
      setCompactingChats(previous => ({ ...previous, [chatId]: false }))
    }
  }

  const isStreaming = status === "streaming"
  const isSubmitDisabled = isStreaming
    ? false
    : !input.trim() || status !== "ready" || Boolean(activeChatId && compactingChats[activeChatId])
  const submitTooltip = isStreaming ? tooltipConstants.stop : tooltipConstants.submit
  const showIntroEmptyState = !activeChatId && messageOrder.length === 0 && status === "ready"

  useLayoutEffect(() => {
    timelineItemRefs.current.length = timelineAnchors.length
    timelineGeometryDirtyRef.current = true
    syncActiveTimelineIndex()
  }, [syncActiveTimelineIndex, timelineAnchors])

  useEffect(() => {
    const scrollElement = conversationContextRef.current?.scrollRef.current
    if (!scrollElement) {
      return
    }

    const handleResize = () => {
      timelineGeometryDirtyRef.current = true
      scheduleActiveTimelineSync()
    }

    scrollElement.addEventListener("scroll", scheduleActiveTimelineSync, { passive: true })
    window.addEventListener("resize", handleResize)
    scheduleActiveTimelineSync()

    return () => {
      scrollElement.removeEventListener("scroll", scheduleActiveTimelineSync)
      window.removeEventListener("resize", handleResize)
      if (timelineScrollFrameRef.current !== null) {
        cancelAnimationFrame(timelineScrollFrameRef.current)
        timelineScrollFrameRef.current = null
      }
    }
  }, [scheduleActiveTimelineSync])

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
        <Conversation
          className="h-full"
          contextRef={conversationContextRef}
          resetKey={focusTargetKey}
        >
          <ConversationContent className={cn(showIntroEmptyState && "min-h-full justify-center")}>
            {showIntroEmptyState ? (
              <NewChatEmptyState />
            ) : (
              <ChatTranscript
                store={activeRenderStore}
                sidecarOrigin={sidecarOrigin}
                thinkingDurations={thinkingDurations}
                reasoningDurations={reasoningDurations}
                toolDurations={toolDurations}
                getMessageNodeRef={getMessageNodeRef}
                onToolApprovalResponse={handleToolApprovalResponse}
                onRegenerate={handleRegenerate}
              />
            )}
          </ConversationContent>
          <ChatMessageTimeline
            activeIndex={activeTimelineIndex}
            anchors={timelineAnchors}
            itemRefs={timelineItemRefs}
            onSelect={scrollToTimelineIndex}
          />
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
            className="relative w-full max-w-(--chat-content-max-width) pb-2"
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
                    usage={displayedContextUsage}
                    contextState={displayedContextState}
                    withSeparator
                    onCompact={activeChatId ? handleCompact : undefined}
                    onCancelCompact={() => {
                      const runtime = activeChatId
                        ? sessionRuntimesRef.current.get(activeChatId)
                        : undefined
                      if (runtime?.compactionAbort) {
                        runtime.compactionAbort.abort()
                      } else {
                        void runtime?.chat.stop()
                      }
                    }}
                    compacting={Boolean(activeChatId && compactingChats[activeChatId])}
                    compactDisabled={status === "streaming" || status === "submitted"}
                  />

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
            <SessionTokenUsage
              usage={sessionUsage}
              contextUsage={displayedContextUsage}
              contextWindow={selectedModel?.contextWindow}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const AppChat = ({
  activeChatId,
  chats,
  newChatToken,
  draftStore,
  desktopChatPaneVisible,
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
      desktopChatPaneVisible={desktopChatPaneVisible}
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
