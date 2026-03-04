import type { UIMessage } from "ai"
import { isTextUIPart } from "ai"
import { RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageContent,
  MessageResponse
} from "@/components/ai-elements/message"
import { TopFloatingHeader } from "@/components/top-floating-header"
import { Button } from "@/components/ui/button"
import {
  getSidecarUrl,
  getTelegramChannelSessionMessages,
  getTelegramChannelSessions,
  type TelegramChannelSessionSummary
} from "@/lib/sidecar-client"
import { cn } from "@/lib/utils"

const TELEGRAM_POLL_INTERVAL_MS = 2_000

export function ChannelTelegramChat() {
  const { t } = useTranslation("common")
  const [sessions, setSessions] = useState<TelegramChannelSessionSummary[]>([])
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null)
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const [sidecarOrigin, setSidecarOrigin] = useState<string | undefined>(undefined)

  const selectedSessionKeyRef = useRef<string | null>(null)
  const sessionsRequestSeqRef = useRef(0)
  const messagesRequestSeqRef = useRef(0)

  const isRefreshing = isRefreshingSessions || isLoadingMessages

  useEffect(() => {
    selectedSessionKeyRef.current = selectedSessionKey
  }, [selectedSessionKey])

  useEffect(() => {
    let cancelled = false

    void getSidecarUrl("/api/chat")
      .then(sidecarApi => {
        if (cancelled) {
          return
        }

        try {
          setSidecarOrigin(new URL(sidecarApi).origin)
        } catch {
          setSidecarOrigin(undefined)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSidecarOrigin(undefined)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadMessagesForSession = useCallback(
    async (sessionKey: string) => {
      const requestSeq = messagesRequestSeqRef.current + 1
      messagesRequestSeqRef.current = requestSeq
      setIsLoadingMessages(true)

      try {
        const result = await getTelegramChannelSessionMessages(sessionKey)
        if (requestSeq !== messagesRequestSeqRef.current) {
          return
        }

        if (selectedSessionKeyRef.current !== sessionKey) {
          return
        }

        setMessages(result.messages)
        setErrorMessage(null)
        setLastRefreshedAt(Date.now())
      } catch (error) {
        if (requestSeq !== messagesRequestSeqRef.current) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : t("channelChat.refreshFailed"))
      } finally {
        if (requestSeq === messagesRequestSeqRef.current) {
          setIsLoadingMessages(false)
        }
      }
    },
    [t]
  )

  const refreshAll = useCallback(async () => {
    const requestSeq = sessionsRequestSeqRef.current + 1
    sessionsRequestSeqRef.current = requestSeq
    setIsRefreshingSessions(true)

    try {
      const result = await getTelegramChannelSessions()
      if (requestSeq !== sessionsRequestSeqRef.current) {
        return
      }

      setSessions(result.sessions)

      const currentSelected = selectedSessionKeyRef.current
      const nextSelected =
        currentSelected && result.sessions.some(session => session.sessionKey === currentSelected)
          ? currentSelected
          : (result.sessions[0]?.sessionKey ?? null)

      if (nextSelected !== currentSelected) {
        selectedSessionKeyRef.current = nextSelected
        setSelectedSessionKey(nextSelected)
      }

      if (!nextSelected) {
        messagesRequestSeqRef.current += 1
        setMessages([])
        setErrorMessage(null)
        setLastRefreshedAt(Date.now())
        return
      }

      await loadMessagesForSession(nextSelected)
    } catch (error) {
      if (requestSeq !== sessionsRequestSeqRef.current) {
        return
      }

      setErrorMessage(error instanceof Error ? error.message : t("channelChat.refreshFailed"))
    } finally {
      if (requestSeq === sessionsRequestSeqRef.current) {
        setIsRefreshingSessions(false)
      }
    }
  }, [loadMessagesForSession, t])

  useEffect(() => {
    void refreshAll()

    const timer = window.setInterval(() => {
      void refreshAll()
    }, TELEGRAM_POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [refreshAll])

  const handleSelectSession = useCallback(
    (sessionKey: string) => {
      if (sessionKey === selectedSessionKeyRef.current) {
        return
      }

      selectedSessionKeyRef.current = sessionKey
      setSelectedSessionKey(sessionKey)
      void loadMessagesForSession(sessionKey)
    },
    [loadMessagesForSession]
  )

  const lastUpdatedLabel = useMemo(() => {
    if (!lastRefreshedAt) {
      return t("channelChat.neverUpdated")
    }

    return t("channelChat.lastUpdated", {
      time: new Date(lastRefreshedAt).toLocaleTimeString()
    })
  }, [lastRefreshedAt, t])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopFloatingHeader
        contentClassName="w-[min(620px,calc(100vw-13rem))]"
        rightSlotClassName="right-3"
        rightSlot={
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshAll()}
            disabled={isRefreshing}
          >
            <RefreshCwIcon className={cn("size-3.5", isRefreshing && "animate-spin")} />
            {t("channelChat.refresh")}
          </Button>
        }
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{t("channelChat.title")}</p>
          <p className="truncate text-xs text-muted-foreground">{lastUpdatedLabel}</p>
        </div>
      </TopFloatingHeader>

      {errorMessage && (
        <div className="border-b bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-48 border-r bg-muted/20">
          <div className="h-full overflow-y-auto px-2 py-2">
            {sessions.length === 0 ? (
              <div className="px-2 py-4 text-xs text-muted-foreground">
                {t("channelChat.noSessionsSidebar")}
              </div>
            ) : (
              <ul className="space-y-1">
                {sessions.map(session => {
                  const isActive = selectedSessionKey === session.sessionKey
                  return (
                    <li key={session.sessionKey}>
                      <button
                        type="button"
                        data-session-key={session.sessionKey}
                        data-active={isActive}
                        onClick={() => handleSelectSession(session.sessionKey)}
                        className={cn(
                          "w-full rounded-md border border-transparent px-2 py-2 text-left transition-colors",
                          "hover:bg-sidebar-accent",
                          isActive && "bg-sidebar-accent"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium">
                            {t("channelChat.chatId", { chatId: session.chatId })}
                          </p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {t("channelChat.messageCount", { count: session.messageCount })}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {session.lastMessagePreview || t("channelChat.noPreview")}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 flex-1">
          <Conversation className="h-full">
            <ConversationContent>
              {sessions.length === 0 ? (
                <ConversationEmptyState
                  title={t("channelChat.noSessionsTitle")}
                  description={t("channelChat.noSessionsDescription")}
                />
              ) : messages.length === 0 && !isLoadingMessages ? (
                <ConversationEmptyState
                  title={t("channelChat.noMessagesTitle")}
                  description={t("channelChat.noMessagesDescription")}
                />
              ) : (
                messages.map(message => {
                  const messageText = message.parts
                    .filter(isTextUIPart)
                    .map(part => part.text)
                    .join("")
                    .trim()
                  const textToRender = messageText || t("channelChat.nonTextPlaceholder")
                  const isUserMessage = message.role === "user"

                  return (
                    <MessageBranch defaultBranch={0} key={message.id}>
                      <MessageBranchContent>
                        <Message from={message.role}>
                          <MessageContent>
                            {isUserMessage ? (
                              <div className="whitespace-pre-wrap wrap-break-word">
                                {textToRender}
                              </div>
                            ) : (
                              <MessageResponse localImageProxyOrigin={sidecarOrigin}>
                                {textToRender}
                              </MessageResponse>
                            )}
                          </MessageContent>
                        </Message>
                      </MessageBranchContent>
                    </MessageBranch>
                  )
                })
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>
      </div>
    </div>
  )
}
