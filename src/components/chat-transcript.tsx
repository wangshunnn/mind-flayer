import type {
  ChatAddToolApproveResponseFunction,
  ChatStatus,
  LanguageModelUsage,
  UIMessage
} from "ai"
import { isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai"
import { CircleIcon } from "lucide-react"
import { memo, useCallback, useMemo } from "react"
import {
  AssistantActivityTimeline,
  AssistantFallbackParts,
  buildAssistantMessageSegments
} from "@/components/ai-elements/assistant-activity"
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
import { useObservableValue } from "@/hooks/use-observable-value"
import type { ChatRenderStore } from "@/lib/chat-render-store"
import { findModelPricing } from "@/lib/provider-constants"
import type { MessageId } from "@/types/chat"

type AssistantMessageMetadata = {
  createdAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
  totalUsage?: LanguageModelUsage
  modelProvider?: string
  modelProviderLabel?: string
  modelId?: string
  modelLabel?: string
  thinkingDuration?: number
  reasoningDurations?: Record<string, number>
  toolDurations?: Record<string, number>
}

interface ChatTranscriptProps {
  store: ChatRenderStore
  sidecarOrigin?: string
  thinkingDurations?: ReadonlyMap<MessageId, number>
  reasoningDurations?: ReadonlyMap<MessageId, Record<string, number>>
  toolDurations?: ReadonlyMap<MessageId, Record<string, number>>
  getMessageNodeRef: (
    messageId: MessageId,
    role: UIMessage["role"]
  ) => ((node: HTMLDivElement | null) => void) | undefined
  onToolApprovalResponse: ChatAddToolApproveResponseFunction
  onRegenerate: (messageId: MessageId) => void
}

interface ChatMessageSeatProps extends Omit<ChatTranscriptProps, "store"> {
  store: ChatRenderStore
  messageId: MessageId
  isLastMessage: boolean
  isStreaming: boolean
}

const noop = () => {
  // Message editing is not implemented yet.
}

const ChatMessageSeat = memo(function ChatMessageSeat({
  store,
  messageId,
  isLastMessage,
  isStreaming,
  sidecarOrigin,
  thinkingDurations,
  reasoningDurations,
  toolDurations,
  getMessageNodeRef,
  onToolApprovalResponse,
  onRegenerate
}: ChatMessageSeatProps) {
  const message = useObservableValue(store.message(messageId))
  const handleRegenerate = useCallback(() => {
    onRegenerate(messageId)
  }, [messageId, onRegenerate])

  const derived = useMemo(() => {
    if (!message) {
      return null
    }
    const messageText = message.parts
      .filter(isTextUIPart)
      .map(part => part.text)
      .join("")
    const metadata = message.metadata as AssistantMessageMetadata | undefined
    const isAssistantMessage = message.role === "assistant"
    return {
      messageText,
      metadata,
      isUserMessage: message.role === "user",
      isAssistantMessage,
      assistantSegments: isAssistantMessage ? buildAssistantMessageSegments(message.parts) : [],
      firstReasoningPartIndex: isAssistantMessage ? message.parts.findIndex(isReasoningUIPart) : -1,
      messageModelPricing: findModelPricing(metadata?.modelProvider, metadata?.modelId),
      hasPendingApproval: message.parts.some(
        part => isToolUIPart(part) && part.state === "approval-requested"
      )
    }
  }, [message])

  if (!message || !derived) {
    return null
  }

  const {
    messageText,
    metadata,
    isUserMessage,
    isAssistantMessage,
    assistantSegments,
    firstReasoningPartIndex,
    messageModelPricing,
    hasPendingApproval
  } = derived
  const messageToolDurations = metadata?.toolDurations ?? toolDurations?.get(message.id)
  const messageReasoningDurations =
    metadata?.reasoningDurations ?? reasoningDurations?.get(message.id)

  return (
    <MessageBranch defaultBranch={0}>
      <MessageBranchContent>
        <Message from={message.role} ref={getMessageNodeRef(message.id, message.role)}>
          {isUserMessage ? (
            <MessageContent>
              <div className="whitespace-pre-wrap wrap-break-word">{messageText}</div>
            </MessageContent>
          ) : (
            assistantSegments.map(segment => {
              if (segment.type === "text") {
                return (
                  <MessageContent key={`text-${message.id}-${segment.startPartIndex}`}>
                    <MessageResponse localImageProxyOrigin={sidecarOrigin}>
                      {segment.text}
                    </MessageResponse>
                  </MessageContent>
                )
              }

              if (segment.type === "fallback") {
                return (
                  <AssistantFallbackParts
                    key={`fallback-${message.id}-${segment.startPartIndex}`}
                    parts={segment.parts}
                  />
                )
              }

              return (
                <AssistantActivityTimeline
                  autoOpenWhileActive
                  fallbackThinkingDurationPartIndex={
                    firstReasoningPartIndex >= 0 ? firstReasoningPartIndex : undefined
                  }
                  key={`activity-${message.id}-${segment.startPartIndex}`}
                  onToolApprovalResponse={onToolApprovalResponse}
                  parts={segment.parts}
                  reasoningDurations={messageReasoningDurations}
                  thinkingDuration={
                    metadata?.thinkingDuration ?? thinkingDurations?.get(message.id)
                  }
                  toolDurations={messageToolDurations}
                />
              )
            })
          )}
          {isUserMessage && (
            <UserMessageActionsBar
              messageText={messageText}
              createdAt={metadata?.createdAt}
              onEdit={noop}
            />
          )}
          {isAssistantMessage && !isStreaming && !hasPendingApproval && (
            <AssistantMessageActionsBar
              messageText={messageText}
              tokenInfo={metadata?.totalUsage}
              createdAt={metadata?.createdAt}
              firstTokenAt={metadata?.firstTokenAt}
              lastTokenAt={metadata?.lastTokenAt}
              modelProvider={metadata?.modelProvider}
              modelProviderLabel={metadata?.modelProviderLabel}
              modelId={metadata?.modelId}
              modelLabel={metadata?.modelLabel}
              modelPricing={messageModelPricing}
              onRefresh={handleRegenerate}
              showRefresh={isLastMessage}
            />
          )}
        </Message>
      </MessageBranchContent>
    </MessageBranch>
  )
})

const AssistantReplyPlaceholder = memo(function AssistantReplyPlaceholder({
  store,
  lastMessageId,
  status
}: {
  store: ChatRenderStore
  lastMessageId?: MessageId
  status: ChatStatus
}) {
  const message = useObservableValue(store.message(lastMessageId ?? "__missing__"))
  const show =
    (status === "submitted" && message?.role === "user") ||
    ((status === "streaming" || status === "error") && message?.parts.length === 0)

  if (!show) {
    return null
  }

  return (
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
  )
})

export const ChatTranscript = memo(function ChatTranscript(props: ChatTranscriptProps) {
  const { store } = props
  const order = useObservableValue(store.order())
  const status = useObservableValue(store.status())
  const lastMessageId = order.at(-1)

  return (
    <>
      {order.map(messageId => (
        <ChatMessageSeat
          {...props}
          isLastMessage={messageId === lastMessageId}
          isStreaming={status === "streaming" && messageId === lastMessageId}
          key={messageId}
          messageId={messageId}
        />
      ))}
      <AssistantReplyPlaceholder store={store} lastMessageId={lastMessageId} status={status} />
    </>
  )
})
