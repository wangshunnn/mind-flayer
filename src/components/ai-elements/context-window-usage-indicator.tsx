import type { LanguageModelUsage } from "ai"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Separator } from "@/components/ui/separator"
import {
  computeContextWindowUsage,
  formatContextWindowTokens,
  resolveUsedTokens,
  type UsageLevel
} from "@/lib/context-window-usage"
import { cn } from "@/lib/utils"

const RING_COLOR_BY_LEVEL: Record<UsageLevel, string> = {
  green: "var(--color-status-positive)",
  yellow: "#eab308",
  red: "var(--color-destructive)"
}

const PERCENT_MAX_FRACTION_DIGITS = 1

export interface ContextWindowUsageIndicatorProps {
  usage?: LanguageModelUsage
  contextWindow?: number | null
  className?: string
  interactive?: boolean
  showPercent?: boolean
}

export interface ContextWindowUsageDetailsProps {
  usage?: LanguageModelUsage
  contextWindow?: number | null
}

function buildUsageSummary(params: {
  usage?: LanguageModelUsage
  contextWindow?: number | null
  t: TFunction<"chat">
}) {
  const { usage, contextWindow, t } = params
  if (!usage) {
    return {
      usageView: null,
      usedTokensText: null,
      usageSummary: null,
      percentText: null
    }
  }

  const usageView = computeContextWindowUsage(usage, contextWindow)
  const usedTokensText = formatContextWindowTokens(resolveUsedTokens(usage))
  if (!usageView) {
    return {
      usageView,
      usedTokensText,
      usageSummary: t("contextWindowUsage.unavailable"),
      percentText: null
    }
  }

  const percentText = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: PERCENT_MAX_FRACTION_DIGITS
  }).format(usageView.percent)

  return {
    usageView,
    usedTokensText,
    usageSummary: t("contextWindowUsage.summary", {
      used: usedTokensText,
      limit: formatContextWindowTokens(usageView.limitTokens),
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

  if (!usage || !usedTokensText || !usageSummary) {
    return null
  }

  const detailSummary = usageView
    ? t("contextWindowUsage.detailSummary", {
        used: usedTokensText,
        limit: formatContextWindowTokens(usageView.limitTokens)
      })
    : null
  const progressColor = usageView ? RING_COLOR_BY_LEVEL[usageView.level] : null

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{t("contextWindowUsage.title")}</p>
      {usageView && detailSummary && percentText ? (
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
              className="h-full rounded-full"
              data-testid="context-window-usage-progress-fill"
              style={{
                width: `${usageView.percent}%`,
                backgroundColor: progressColor ?? "var(--color-border)",
                backgroundImage:
                  "repeating-linear-gradient(-45deg, rgba(255,255,255,0.35) 0 4px, rgba(255,255,255,0.08) 4px 8px)"
              }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{usageSummary}</p>
      )}
      {!usageView && (
        <p className="text-xs text-muted-foreground/80">
          {t("contextWindowUsage.usedInputOnly", { used: usedTokensText })}
        </p>
      )}
      <div className="space-y-2 pt-0.5">
        <Separator />
        <p
          className="text-[11px] leading-relaxed text-muted-foreground/80"
          data-testid="context-window-usage-note"
        >
          {t("contextWindowUsage.compressionHint")}
        </p>
      </div>
    </div>
  )
}

export function ContextWindowUsageIndicator({
  usage,
  contextWindow,
  className,
  interactive = true,
  showPercent = false
}: ContextWindowUsageIndicatorProps) {
  const { t } = useTranslation("chat")

  if (!usage) {
    return null
  }

  const { usageView, usageSummary, percentText } = buildUsageSummary({
    usage,
    contextWindow,
    t
  })

  const ringColor = usageView
    ? RING_COLOR_BY_LEVEL[usageView.level]
    : "var(--color-muted-foreground)"
  const ringPercent = usageView ? usageView.percent : 0
  const ringDegrees = ringPercent * 3.6
  const ringStyle = {
    background: `conic-gradient(${ringColor} ${ringDegrees}deg, var(--color-border) ${ringDegrees}deg 360deg)`
  } as const

  if (!interactive) {
    return <ContextWindowUsageRing className={className} ringStyle={ringStyle} />
  }

  const triggerAriaLabel = t("contextWindowUsage.ariaLabel", { summary: usageSummary })

  return (
    <HoverCard closeDelay={100} openDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          aria-label={triggerAriaLabel}
          className={cn(
            showPercent ? "h-8 gap-1.5 px-2 text-xs font-medium tabular-nums" : "size-6",
            "text-muted-foreground hover:text-foreground",
            className
          )}
          size={showPercent ? "sm" : "icon-xs"}
          type="button"
          variant="ghost"
        >
          <ContextWindowUsageRing
            className={showPercent ? "size-5" : undefined}
            ringStyle={ringStyle}
          />
          {showPercent && usageView && percentText && <span>{percentText}%</span>}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-56 p-3">
        <ContextWindowUsageDetails usage={usage} contextWindow={contextWindow} />
      </HoverCardContent>
    </HoverCard>
  )
}
