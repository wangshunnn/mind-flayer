import type { TFunction } from "i18next"
import { LoaderCircleIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Separator } from "@/components/ui/separator"
import {
  type ContextTokenUsage,
  computeContextWindowUsage,
  formatContextWindowLimit,
  formatContextWindowPercent,
  formatContextWindowTokens,
  resolveUsedTokens,
  type UsageLevel
} from "@/lib/context-window-usage"
import { findModelPricing } from "@/lib/provider-constants"
import { cn } from "@/lib/utils"
import type { ContextState } from "../../../shared/context"
import { TokenUsageDetails } from "./token-usage-details"

const RING_COLOR_BY_LEVEL: Record<UsageLevel, string> = {
  green: "var(--color-status-positive)",
  yellow: "#eab308",
  red: "var(--color-destructive)"
}

const BREAKDOWN_ROWS = [
  { key: "systemTokens", label: "contextWindowUsage.systemPrompt", color: "bg-zinc-400" },
  { key: "toolsTokens", label: "contextWindowUsage.tools", color: "bg-violet-400" },
  { key: "messageTokens", label: "contextWindowUsage.messages", color: "bg-blue-500" }
] as const

export interface ContextWindowUsageIndicatorProps {
  usage?: ContextTokenUsage
  contextWindow?: number | null
  className?: string
  interactive?: boolean
  showPercent?: boolean
  contextState?: ContextState
  onCompact?: () => void
  onCancelCompact?: () => void
  compacting?: boolean
  compactDisabled?: boolean
  withSeparator?: boolean
}

export interface ContextWindowUsageDetailsProps {
  usage?: ContextTokenUsage
  contextWindow?: number | null
}

function buildUsageSummary(params: {
  usage?: ContextTokenUsage
  contextWindow?: number | null
  t: TFunction<"chat">
}) {
  const { usage, contextWindow, t } = params
  const usedTokens = usage ? resolveUsedTokens(usage) : undefined
  if (!usage || usedTokens === undefined) {
    return {
      usageView: null,
      usedTokensText: null,
      usageSummary: t(usage ? "contextWindowUsage.unknown" : "contextWindowUsage.noStatistics"),
      percentText: null
    }
  }

  const usageView = computeContextWindowUsage(usage, contextWindow)
  const usedTokensText = `${usage.source === "estimated" ? "~" : ""}${formatContextWindowTokens(usedTokens)}`
  if (!usageView) {
    return {
      usageView,
      usedTokensText,
      usageSummary: t("contextWindowUsage.unavailable"),
      percentText: null
    }
  }

  const percentText = formatContextWindowPercent(usageView.percent, usage.source)

  return {
    usageView,
    usedTokensText,
    usageSummary: t("contextWindowUsage.summary", {
      used: usedTokensText,
      limit: formatContextWindowLimit(usageView.limitTokens),
      percent: percentText
    }),
    percentText
  }
}

function ContextWindowUsageRing({
  ringStyle,
  className
}: {
  ringStyle: Readonly<{ background: string }>
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-6 items-center justify-center rounded-full", className)}
    >
      <span className="relative block size-4 rounded-full" style={ringStyle}>
        <span className="absolute inset-0.75 rounded-full bg-chat-input-bg" />
      </span>
    </span>
  )
}

export function ContextWindowUsageDetails({
  usage,
  contextWindow
}: ContextWindowUsageDetailsProps) {
  const { t } = useTranslation("chat")
  const { usageView, usedTokensText, usageSummary, percentText } = buildUsageSummary({
    usage,
    contextWindow,
    t
  })

  const breakdown = usage?.breakdown
  const breakdownTotal = breakdown
    ? breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
    : 0
  const detailSummary = usageView
    ? t("contextWindowUsage.detailSummary", {
        used: usedTokensText,
        limit: formatContextWindowLimit(usageView.limitTokens)
      })
    : null
  const progressColor = usageView ? RING_COLOR_BY_LEVEL[usageView.level] : null

  return (
    <div className={cn("max-w-[calc(100vw-3rem)] space-y-2", breakdown ? "w-64" : "w-48")}>
      <p className="text-xs font-medium">{t("contextWindowUsage.title")}</p>
      {!usedTokensText ? (
        <p className="text-xs text-muted-foreground" data-testid="context-window-usage-empty">
          {usageSummary}
        </p>
      ) : usageView && detailSummary && percentText ? (
        <div className="space-y-2" data-testid="context-window-usage-details">
          <div className="flex items-center justify-between gap-4 text-xs">
            <p className="text-muted-foreground">{detailSummary}</p>
            <span
              className="font-medium tabular-nums text-foreground"
              data-testid="context-window-usage-percent"
            >
              {percentText}%
            </span>
          </div>
          <div
            aria-hidden
            className="h-1.5 overflow-hidden rounded-full bg-border/70"
            data-testid="context-window-usage-progress"
          >
            <div
              className="flex h-full overflow-hidden rounded-full"
              data-testid="context-window-usage-progress-fill"
              style={{
                width: `${Math.min(100, usageView.percent)}%`,
                backgroundColor:
                  breakdownTotal > 0 ? undefined : (progressColor ?? "var(--color-border)"),
                backgroundImage:
                  breakdownTotal > 0
                    ? undefined
                    : "repeating-linear-gradient(-45deg, rgba(255,255,255,0.35) 0 4px, rgba(255,255,255,0.08) 4px 8px)"
              }}
            >
              {breakdown && breakdownTotal > 0 && usageView.percent > 0
                ? BREAKDOWN_ROWS.filter(row => breakdown[row.key] > 0).map(row => (
                    <span
                      key={row.key}
                      className={cn("h-full", row.color)}
                      data-testid={`context-window-usage-segment-${row.key}`}
                      style={{ width: `${(breakdown[row.key] / breakdownTotal) * 100}%` }}
                    />
                  ))
                : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{usageSummary}</p>
      )}
      {!usageView && usedTokensText && (
        <p className="text-xs text-muted-foreground/80">
          {t("contextWindowUsage.usedTokensOnly", { used: usedTokensText })}
        </p>
      )}
      {breakdown && (
        <dl className="space-y-2 py-1 text-xs" data-testid="context-window-usage-breakdown">
          {BREAKDOWN_ROWS.map(row => (
            <div key={row.key} className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-xs", row.color)} />
                {t(row.label)}
              </dt>
              <dd className="shrink-0 tabular-nums">
                ~{formatContextWindowLimit(breakdown[row.key])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export function ContextWindowUsageIndicator({
  usage,
  contextWindow,
  className,
  interactive = true,
  contextState,
  onCompact,
  onCancelCompact,
  compacting = false,
  compactDisabled = false,
  withSeparator = false,
  showPercent = false
}: ContextWindowUsageIndicatorProps) {
  const { t } = useTranslation("chat")

  if (!usage && !onCompact) {
    return null
  }

  const { usageView, usageSummary, percentText } = buildUsageSummary({
    usage: usage,
    contextWindow,
    t
  })

  const ringColor = usageView
    ? RING_COLOR_BY_LEVEL[usageView.level]
    : "var(--color-muted-foreground)"
  const ringPercent = usageView ? Math.min(100, usageView.percent) : 0
  const ringDegrees = ringPercent * 3.6
  const ringStyle = {
    background: `conic-gradient(${ringColor} ${ringDegrees}deg, var(--color-border) ${ringDegrees}deg 360deg)`
  } as const

  const separator = withSeparator ? (
    <Separator
      orientation="vertical"
      className="h-3! mr-1"
      data-testid="context-window-usage-separator"
    />
  ) : null
  if (!interactive) {
    return (
      <>
        <ContextWindowUsageRing className={className} ringStyle={ringStyle} />
        {separator}
      </>
    )
  }

  const triggerAriaLabel = usageSummary
    ? t("contextWindowUsage.ariaLabel", { summary: usageSummary })
    : t("contextWindowUsage.ariaLabel", { summary: t("contextWindowUsage.noStatistics") })

  return (
    <>
      <HoverCard closeDelay={100} openDelay={100}>
        <HoverCardTrigger asChild>
          <Button
            aria-label={compacting ? t("compaction.compacting") : triggerAriaLabel}
            className={cn(
              showPercent ? "h-8 gap-1.5 px-2 text-xs font-medium tabular-nums" : "size-6",
              "text-muted-foreground hover:text-foreground",
              className
            )}
            size={showPercent ? "sm" : "icon-xs"}
            type="button"
            variant="ghost"
          >
            {compacting ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <ContextWindowUsageRing
                className={showPercent ? "size-5" : undefined}
                ringStyle={ringStyle}
              />
            )}
            {showPercent && usageView && percentText && <span>{percentText}%</span>}
          </Button>
        </HoverCardTrigger>
        <HoverCardContent align="end" className="w-auto p-3">
          <ContextWindowUsageDetails usage={usage} contextWindow={contextWindow} />
          {onCompact && (
            <Button
              className="mt-2 w-full"
              size="sm"
              variant="outline"
              onClick={compacting ? onCancelCompact : onCompact}
              disabled={compacting ? !onCancelCompact : compactDisabled}
            >
              {t(compacting ? "compaction.cancel" : "compaction.action")}
            </Button>
          )}
          {contextState?.events.some(event => event.type === "compaction") && (
            <details className="mt-2 max-w-96 text-xs">
              <summary className="cursor-pointer">{t("compaction.history")}</summary>
              {contextState.events
                .filter(event => event.type === "compaction")
                .map(event => (
                  <details key={event.id} className="mt-2">
                    <summary className="cursor-pointer">
                      {t("compaction.tokens", {
                        before: formatContextWindowTokens(event.tokensBefore),
                        after: formatContextWindowTokens(event.tokensAfter)
                      })}
                    </summary>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap py-2">
                      {event.summary}
                    </pre>
                    {event.usage && (
                      <TokenUsageDetails
                        usage={event.usage}
                        modelPricing={findModelPricing(event.modelProvider, event.modelId)}
                      />
                    )}
                  </details>
                ))}
            </details>
          )}
        </HoverCardContent>
      </HoverCard>
      {separator}
    </>
  )
}
