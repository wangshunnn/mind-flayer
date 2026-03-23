import type { LanguageModelUsage, UIMessage } from "ai"
import { isTextUIPart } from "ai"
import { ArchiveIcon, CircleDot, Ellipsis, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  ContextWindowUsageDetails,
  ContextWindowUsageIndicator
} from "@/components/ai-elements/context-window-usage-indicator"
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
  MessageContent
} from "@/components/ai-elements/message"
import { TokenUsageDetails } from "@/components/ai-elements/token-usage-details"
import { TopFloatingHeader } from "@/components/top-floating-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { computeContextWindowUsage, formatContextWindowTokens } from "@/lib/context-window-usage"
import { findModelContextWindow, findModelPricing } from "@/lib/provider-constants"
import {
  deleteTelegramChannelSession,
  getTelegramChannelSessionMessages,
  getTelegramChannelSessions,
  type TelegramChannelSessionSummary
} from "@/lib/sidecar-client"
import { cn } from "@/lib/utils"

const TELEGRAM_POLL_INTERVAL_MS = 2_000
const CONTEXT_PERCENT_MAX_FRACTION_DIGITS = 1

interface AssistantMessageMetadata {
  createdAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
  totalUsage?: LanguageModelUsage
  modelProvider?: string
  modelProviderLabel?: string
  modelId?: string
  modelLabel?: string
}

interface ThreadSessionGroup {
  chatId: string
  sessions: TelegramChannelSessionSummary[]
}

function formatCompactThreadStartedAt(formatter: Intl.DateTimeFormat, timestamp: number) {
  const parts = formatter.formatToParts(new Date(timestamp))
  const lookup = new Map(parts.map(part => [part.type, part.value]))

  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")} ${lookup.get("hour")}:${lookup.get("minute")}:${lookup.get("second")}`
}

function ThreadMetaDivider({ children, testId }: { children: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="w-(--chat-content-width) max-w-(--chat-content-max-width) px-2 py-2"
    >
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="shrink-0 rounded-full border bg-background px-3 py-1 text-[11px] text-muted-foreground">
          {children}
        </span>
        <Separator className="flex-1" />
      </div>
    </div>
  )
}

export function ChannelTelegramChat() {
  const { t, i18n } = useTranslation("common")
  const { t: tChat } = useTranslation("chat")
  const [sessions, setSessions] = useState<TelegramChannelSessionSummary[]>([])
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null)
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingSessionKey, setDeletingSessionKey] = useState<string | null>(null)

  const selectedSessionKeyRef = useRef<string | null>(null)
  const sessionsRequestSeqRef = useRef(0)
  const messagesRequestSeqRef = useRef(0)

  useEffect(() => {
    selectedSessionKeyRef.current = selectedSessionKey
  }, [selectedSessionKey])

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

  const refreshAll = useCallback(
    async (options?: { preferredSelectedSessionKey?: string | null }) => {
      const requestSeq = sessionsRequestSeqRef.current + 1
      sessionsRequestSeqRef.current = requestSeq

      try {
        const result = await getTelegramChannelSessions()
        if (requestSeq !== sessionsRequestSeqRef.current) {
          return
        }

        setSessions(result.sessions)

        const currentSelected =
          options?.preferredSelectedSessionKey ?? selectedSessionKeyRef.current
        const nextSelected =
          currentSelected && result.sessions.some(session => session.sessionKey === currentSelected)
            ? currentSelected
            : (result.sessions.find(session => session.isActive)?.sessionKey ??
              result.sessions[0]?.sessionKey ??
              null)

        if (nextSelected !== currentSelected) {
          selectedSessionKeyRef.current = nextSelected
          setSelectedSessionKey(nextSelected)
        }

        if (!nextSelected) {
          messagesRequestSeqRef.current += 1
          setMessages([])
          setErrorMessage(null)
          return
        }

        await loadMessagesForSession(nextSelected)
      } catch (error) {
        if (requestSeq !== sessionsRequestSeqRef.current) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : t("channelChat.refreshFailed"))
      }
    },
    [loadMessagesForSession, t]
  )

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

  const handleDeleteSession = useCallback(
    async (sessionKey: string) => {
      if (deletingSessionKey) {
        return
      }

      const orderedSessions = sessions
      const deletedIndex = orderedSessions.findIndex(session => session.sessionKey === sessionKey)
      const remainingSessions = orderedSessions.filter(session => session.sessionKey !== sessionKey)
      const wasDeletingSelectedSession = selectedSessionKeyRef.current === sessionKey
      let preferredSelectedSessionKey = selectedSessionKeyRef.current

      if (preferredSelectedSessionKey === sessionKey) {
        preferredSelectedSessionKey =
          remainingSessions[deletedIndex]?.sessionKey ??
          remainingSessions[remainingSessions.length - 1]?.sessionKey ??
          null
      }

      setDeletingSessionKey(sessionKey)

      try {
        await deleteTelegramChannelSession(sessionKey)

        if (wasDeletingSelectedSession || !preferredSelectedSessionKey) {
          messagesRequestSeqRef.current += 1
          setMessages([])
          setErrorMessage(null)
        }

        selectedSessionKeyRef.current = preferredSelectedSessionKey
        setSelectedSessionKey(preferredSelectedSessionKey)

        await refreshAll({ preferredSelectedSessionKey })
        toast.success(t("toast.channelThreadDeleted"))
      } catch (error) {
        toast.error(t("toast.error"), {
          description:
            error instanceof Error ? error.message : t("toast.failedToDeleteChannelThread")
        })
      } finally {
        setDeletingSessionKey(current => (current === sessionKey ? null : current))
      }
    },
    [deletingSessionKey, refreshAll, sessions, t]
  )

  const startedAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }),
    [i18n.language]
  )
  const compactStartedAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }),
    []
  )

  const threadSessionGroups = useMemo<ThreadSessionGroup[]>(() => {
    const groupsByChatId = new Map<string, TelegramChannelSessionSummary[]>()

    for (const session of sessions) {
      const existing = groupsByChatId.get(session.chatId)
      if (existing) {
        existing.push(session)
      } else {
        groupsByChatId.set(session.chatId, [session])
      }
    }

    return [...groupsByChatId.entries()].map(([chatId, groupedSessions]) => ({
      chatId,
      sessions: groupedSessions
    }))
  }, [sessions])

  const selectedSession = useMemo(
    () => sessions.find(session => session.sessionKey === selectedSessionKey) ?? null,
    [selectedSessionKey, sessions]
  )

  const selectedSessionUsageView = useMemo(() => {
    if (!selectedSession?.latestAssistantUsage) {
      return null
    }

    const contextWindow = findModelContextWindow(
      selectedSession.latestModelProvider,
      selectedSession.latestModelId
    )
    if (!contextWindow) {
      return null
    }

    return computeContextWindowUsage(selectedSession.latestAssistantUsage, contextWindow)
  }, [
    selectedSession?.latestAssistantUsage,
    selectedSession?.latestModelId,
    selectedSession?.latestModelProvider
  ])

  const selectedSessionPercentText = useMemo(() => {
    if (!selectedSessionUsageView) {
      return null
    }

    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: CONTEXT_PERCENT_MAX_FRACTION_DIGITS
    }).format(selectedSessionUsageView.percent)
  }, [selectedSessionUsageView])

  const selectedSessionUsageSummaryText = useMemo(() => {
    if (!selectedSessionUsageView) {
      return null
    }

    return tChat("contextWindowUsage.summary", {
      used: formatContextWindowTokens(selectedSessionUsageView.usedTokens),
      limit: formatContextWindowTokens(selectedSessionUsageView.limitTokens),
      percent: selectedSessionPercentText ?? "0"
    })
  }, [selectedSessionPercentText, selectedSessionUsageView, tChat])

  const selectedSessionStartedAtText = useMemo(() => {
    if (!selectedSession) {
      return null
    }

    return t("channelChat.threadStartedAt", {
      time: startedAtFormatter.format(new Date(selectedSession.startedAt))
    })
  }, [selectedSession, startedAtFormatter, t])

  const selectedSessionArchivedText = useMemo(() => {
    if (!selectedSession || selectedSession.isActive) {
      return null
    }

    return t("channelChat.threadArchivedNotice")
  }, [selectedSession, t])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopFloatingHeader
        contentClassName="w-[min(640px,calc(100vw-14rem))] justify-start"
        rightSlotClassName="right-3"
        rightSlot={
          selectedSession?.latestAssistantUsage &&
          selectedSessionUsageView &&
          selectedSessionPercentText &&
          selectedSessionUsageSummaryText ? (
            <HoverCard closeDelay={100} openDelay={100}>
              <HoverCardTrigger asChild>
                <Button
                  data-testid="thread-context-usage-trigger"
                  aria-label={tChat("contextWindowUsage.ariaLabel", {
                    summary: selectedSessionUsageSummaryText
                  })}
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                >
                  <ContextWindowUsageIndicator
                    className="size-5"
                    contextWindow={selectedSessionUsageView.limitTokens}
                    interactive={false}
                    usage={selectedSession.latestAssistantUsage}
                  />
                  <span className="text-xs font-medium tabular-nums">
                    {selectedSessionPercentText}%
                  </span>
                </Button>
              </HoverCardTrigger>
              <HoverCardContent align="end" className="w-auto p-3">
                <ContextWindowUsageDetails
                  contextWindow={selectedSessionUsageView.limitTokens}
                  usage={selectedSession.latestAssistantUsage}
                />
              </HoverCardContent>
            </HoverCard>
          ) : null
        }
      >
        <p className="truncate text-sm font-medium">{t("channelChat.title")}</p>
      </TopFloatingHeader>

      {errorMessage && (
        <div className="border-b bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 border-r bg-muted/20">
          <div className="h-full overflow-y-auto px-2 py-2">
            {threadSessionGroups.length === 0 ? (
              <div className="px-2 py-4 text-xs text-muted-foreground">
                {t("channelChat.noSessionsSidebar")}
              </div>
            ) : (
              <div className="space-y-4">
                {threadSessionGroups.map(group => (
                  <section key={group.chatId}>
                    <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {t("channelChat.threadId", { chatId: group.chatId })}
                    </p>
                    <ul className="space-y-1">
                      {group.sessions.map(session => {
                        const isSelected = selectedSessionKey === session.sessionKey
                        const title = session.firstMessagePreview || t("channelChat.untitledThread")
                        const statusLabel = session.isActive
                          ? t("channelChat.activeStatus")
                          : t("channelChat.archivedStatus")
                        const statusDescription = session.isActive
                          ? t("channelChat.activeStatusDescription")
                          : t("channelChat.archivedStatusDescription")

                        return (
                          <li key={session.sessionKey}>
                            <div
                              className={cn(
                                "group/session-item relative rounded-md border border-transparent px-2 py-1 transition-colors",
                                "hover:bg-sidebar-accent",
                                isSelected && "bg-sidebar-accent"
                              )}
                            >
                              <button
                                type="button"
                                data-session-key={session.sessionKey}
                                data-active={isSelected}
                                onClick={() => handleSelectSession(session.sessionKey)}
                                className="absolute inset-0 rounded-md outline-hidden focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                              >
                                <span className="sr-only">{title}</span>
                              </button>

                              <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
                                <p className="min-w-0 flex-1 truncate text-xs font-medium leading-4">
                                  {title}
                                </p>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-xs"
                                      data-session-status={session.isActive ? "active" : "archived"}
                                      aria-label={`${statusLabel}. ${statusDescription}`}
                                      onClick={() => handleSelectSession(session.sessionKey)}
                                      className="pointer-events-auto size-6 inline-flex shrink-0 items-center justify-center rounded-sm p-1 text-muted-foreground transition-colors outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                                    >
                                      {session.isActive ? (
                                        <CircleDot
                                          aria-hidden
                                          className="size-3 text-status-positive"
                                        />
                                      ) : (
                                        <ArchiveIcon aria-hidden className="size-3" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-56">
                                    <div className="space-y-1">
                                      <p className="font-medium">{statusLabel}</p>
                                      <p>{statusDescription}</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </div>

                              <div className="pointer-events-none relative z-10 mt-0.5 flex items-center justify-between gap-2">
                                <p className="min-w-0 flex-1 truncate text-[11px] leading-4 text-muted-foreground">
                                  {formatCompactThreadStartedAt(
                                    compactStartedAtFormatter,
                                    session.startedAt
                                  )}
                                </p>
                                {!session.isActive ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        data-session-delete-trigger={session.sessionKey}
                                        disabled={deletingSessionKey !== null}
                                        onClick={event => {
                                          event.stopPropagation()
                                        }}
                                        className={cn(
                                          "pointer-events-auto size-6 shrink-0 text-muted-foreground hover:text-foreground"
                                        )}
                                      >
                                        <Ellipsis className="size-3" />
                                        <span className="sr-only">{t("nav.more")}</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" side="bottom" className="w-44">
                                      <DropdownMenuItem
                                        data-session-delete-action={session.sessionKey}
                                        disabled={deletingSessionKey !== null}
                                        onClick={event => {
                                          event.stopPropagation()
                                          void handleDeleteSession(session.sessionKey)
                                        }}
                                      >
                                        <Trash2 className="text-muted-foreground" />
                                        <span>{t("menu.deleteChat")}</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <Conversation className="h-full">
            <ConversationContent>
              {selectedSessionStartedAtText && (
                <ThreadMetaDivider testId="selected-thread-started-at">
                  {selectedSessionStartedAtText}
                </ThreadMetaDivider>
              )}

              {threadSessionGroups.length === 0 ? (
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
                  const metadata = message.metadata as AssistantMessageMetadata | undefined
                  const messageModelPricing = findModelPricing(
                    metadata?.modelProvider,
                    metadata?.modelId
                  )

                  return (
                    <MessageBranch defaultBranch={0} key={message.id}>
                      <MessageBranchContent>
                        <Message from={message.role}>
                          <MessageContent>
                            <div className="whitespace-pre-wrap wrap-break-word">
                              {textToRender}
                            </div>
                          </MessageContent>

                          {message.role === "assistant" && metadata?.totalUsage && (
                            <div className="flex items-center gap-0.5 text-muted-foreground">
                              <TokenUsageDetails
                                usage={metadata.totalUsage}
                                createdAt={metadata.createdAt}
                                firstTokenAt={metadata.firstTokenAt}
                                lastTokenAt={metadata.lastTokenAt}
                                modelProvider={metadata.modelProvider}
                                modelProviderLabel={metadata.modelProviderLabel}
                                modelId={metadata.modelId}
                                modelLabel={metadata.modelLabel}
                                modelPricing={messageModelPricing}
                              />
                            </div>
                          )}
                        </Message>
                      </MessageBranchContent>
                    </MessageBranch>
                  )
                })
              )}

              {selectedSessionArchivedText && (
                <ThreadMetaDivider testId="selected-thread-archived-notice">
                  {selectedSessionArchivedText}
                </ThreadMetaDivider>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>
      </div>
    </div>
  )
}
