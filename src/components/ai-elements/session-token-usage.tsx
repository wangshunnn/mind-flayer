import { useTranslation } from "react-i18next"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  type ContextTokenUsage,
  computeContextWindowUsage,
  formatContextWindowLimit,
  formatContextWindowTokens,
  resolveUsedTokens
} from "@/lib/context-window-usage"
import { formatCompactTokens, type SessionUsageSummary } from "@/lib/session-usage"
import { cn } from "@/lib/utils"

interface SessionTokenUsageProps {
  usage: SessionUsageSummary
  contextUsage?: ContextTokenUsage
  contextWindow?: number | null
}

export function SessionTokenUsage({ usage, contextUsage, contextWindow }: SessionTokenUsageProps) {
  const { t } = useTranslation("chat")
  if (!usage.hasUsage) {
    return null
  }
  const unavailable = t("sessionUsage.unavailable")
  const hit = usage.cacheHitPercent === null ? unavailable : `${usage.cacheHitPercent.toFixed(1)}%`
  const turns = t(usage.turns === 1 ? "sessionUsage.oneTurn" : "sessionUsage.manyTurns", {
    count: usage.turns
  })
  const steps = t(usage.steps === 1 ? "sessionUsage.oneStep" : "sessionUsage.manySteps", {
    count: usage.steps
  })
  const activity = `${turns} · ${steps}`
  const limit = contextWindow === undefined ? contextUsage?.contextWindow : contextWindow
  const validLimit =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? limit : undefined
  const contextView = contextUsage
    ? computeContextWindowUsage(contextUsage, validLimit ?? null)
    : null
  const estimated = contextUsage?.source === "estimated" ? "~" : ""
  const context = `${contextView ? `${estimated}${contextView.percent.toFixed(1)}%` : "?"}/${validLimit ? formatContextWindowLimit(validLimit) : unavailable}`
  const contextTokens = contextUsage ? resolveUsedTokens(contextUsage) : undefined
  const contextDetails = `${contextTokens === undefined ? "?" : `${estimated}${formatContextWindowTokens(contextTokens)}`} / ${validLimit ? formatContextWindowLimit(validLimit) : unavailable}`
  const summary = t("sessionUsage.summary", {
    activity,
    contextUsage: context,
    input: formatContextWindowTokens(usage.input),
    output: formatContextWindowTokens(usage.output),
    read: usage.cacheRead === null ? unavailable : formatContextWindowTokens(usage.cacheRead),
    hit
  })
  const metrics = [
    ["input", `↑ ${formatCompactTokens(usage.input)}`, formatContextWindowTokens(usage.input)],
    ["output", `↓ ${formatCompactTokens(usage.output)}`, formatContextWindowTokens(usage.output)],
    [
      "read",
      `R ${usage.cacheRead === null ? unavailable : formatCompactTokens(usage.cacheRead)}`,
      usage.cacheRead === null ? unavailable : formatContextWindowTokens(usage.cacheRead)
    ],
    ["hit", `CH ${hit}`, hit],
    ["context", context, contextDetails]
  ] as const

  return (
    <div className="flex w-full min-w-0 justify-center pt-1.5" data-testid="session-token-usage">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={summary}
            className={cn(
              "block min-w-0 max-w-full rounded px-1 py-0.5",
              "text-xs tabular-nums text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <span className="block truncate">
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <span>{activity}</span>
                {metrics.map(([key, label]) => (
                  <span key={key} className="inline-flex items-center gap-2">
                    {key === "output" ? (
                      <span aria-hidden>·</span>
                    ) : (
                      <Separator orientation="vertical" className="h-3!" />
                    )}
                    <span>{label}</span>
                  </span>
                ))}
              </span>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="w-max max-w-[calc(100vw-2rem)] space-y-2 p-3 text-left text-wrap">
          <p className="font-medium">{t("sessionUsage.title")}</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt>{t("sessionUsage.turns")}</dt>
            <dd className="text-right tabular-nums">{usage.turns}</dd>
            <dt>{t("sessionUsage.steps")}</dt>
            <dd className="text-right tabular-nums">{usage.steps}</dd>
            {metrics.map(([key, , value]) => (
              <div className="contents" key={key}>
                <dt>{t(`sessionUsage.${key}`)}</dt>
                <dd className="text-right tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
