import type { LanguageModelUsage } from "ai"
import { BadgeInfoIcon, GaugeIcon } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  computeMessagePerformanceMetrics,
  formatMessageLatency,
  formatMessageTokensPerSecond
} from "@/lib/message-performance-metrics"
import { computeMessageUsageCost } from "@/lib/message-usage-cost"
import type { ModelPricing, PricingCurrency } from "@/lib/provider-constants"

export interface TokenUsageDetailsProps {
  usage: LanguageModelUsage
  createdAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
  modelProvider?: string
  modelProviderLabel?: string
  modelId?: string
  modelLabel?: string
  modelPricing?: ModelPricing
}

const englishIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
})

const DEFAULT_PRICING_CURRENCY: PricingCurrency = "USD"

const currencyFormatters: Record<PricingCurrency, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }),
  CNY: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "CNY",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  })
}

const currencySymbols: Record<PricingCurrency, string> = {
  USD: "$",
  CNY: "¥"
}

const minimumDisplayableCost: Record<PricingCurrency, number> = {
  USD: 0.0001,
  CNY: 0.0001
}

const formatTokenCount = (value: number) =>
  englishIntegerFormatter.format(Math.max(0, Math.round(value)))

const formatCost = (
  value: number | null,
  currency: PricingCurrency,
  unavailableLabel: string,
  belowMinimumLabel: string
) => {
  if (value === null) {
    return unavailableLabel
  }

  if (value > 0 && value < minimumDisplayableCost[currency]) {
    return belowMinimumLabel
  }

  return currencyFormatters[currency].format(value)
}

export function TokenUsageDetails({
  usage,
  createdAt,
  firstTokenAt,
  lastTokenAt,
  modelProvider,
  modelProviderLabel,
  modelId,
  modelLabel,
  modelPricing
}: TokenUsageDetailsProps) {
  const { t } = useTranslation("chat")

  const costCurrency = modelPricing?.currency ?? DEFAULT_PRICING_CURRENCY
  const belowMinimumCostLabel = t("tokens.belowMinimumCost", {
    symbol: currencySymbols[costCurrency]
  })

  const usageCost = useMemo(
    () => computeMessageUsageCost(usage, modelPricing),
    [usage, modelPricing]
  )
  const performanceMetrics = useMemo(
    () => computeMessagePerformanceMetrics(usage, { createdAt, firstTokenAt, lastTokenAt }),
    [usage, createdAt, firstTokenAt, lastTokenAt]
  )
  const aggregatedInputCost =
    usageCost.costs.input === null &&
    usageCost.costs.cachedRead === null &&
    usageCost.costs.cachedWrite === null
      ? null
      : (usageCost.costs.input ?? 0) +
        (usageCost.costs.cachedRead ?? 0) +
        (usageCost.costs.cachedWrite ?? 0)
  const hasModelMetadata = Boolean(modelProvider && modelId)
  const showCostUnavailable = !hasModelMetadata || !usageCost.hasAnyPricing
  const displayProvider = modelProviderLabel ?? modelProvider
  const displayModel = modelLabel ?? modelId
  const displayModelName =
    displayProvider && displayModel ? `${displayProvider}/${displayModel}` : null
  const notAvailableLabel = t("tokens.notAvailable")
  const ttftLabel = formatMessageLatency(performanceMetrics.ttftMs, notAvailableLabel)
  const ttltLabel = formatMessageLatency(performanceMetrics.ttltMs, notAvailableLabel)
  const tpsLabel = formatMessageTokensPerSecond(performanceMetrics.tps, notAvailableLabel)
  const detailTriggerLabel = t("tokens.openDetailsWithMetrics", {
    ttft: ttftLabel,
    ttlt: ttltLabel,
    tps: tpsLabel
  })

  const tokenRows = [
    [t("tokens.inputTotal"), usageCost.tokens.input],
    [t("tokens.outputTotal"), usageCost.tokens.output],
    [t("tokens.cachedReadInput"), usageCost.tokens.cachedReadInput],
    [t("tokens.cachedWriteInput"), usageCost.tokens.cachedWriteInput],
    [t("tokens.total"), usageCost.tokens.total]
  ] as const

  const costRows = [
    [t("tokens.costInput"), aggregatedInputCost],
    [t("tokens.costOutput"), usageCost.costs.output],
    [t("tokens.costTotal"), usageCost.costs.total]
  ] as const
  const performanceRows = [
    ["TTFT", t("tokens.ttftName"), ttftLabel, t("tokens.ttftDescription")],
    ["TTLT", t("tokens.ttltName"), ttltLabel, t("tokens.ttltDescription")],
    ["TPS", t("tokens.tpsName"), tpsLabel, t("tokens.tpsDescription")]
  ] as const

  return (
    <HoverCard closeDelay={100} openDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          aria-label={detailTriggerLabel}
          size="icon-xs"
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
        >
          <GaugeIcon className="size-3.5" />
          <span className="sr-only">{t("tokens.openDetails")}</span>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="center" sideOffset={8} className="w-56 p-3">
        <div className="space-y-3">
          {displayModelName && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">{t("tokens.model")}</p>
              <p className="text-xs break-all text-muted-foreground">{displayModelName}</p>
            </div>
          )}

          <div className="space-y-1.5 border-t pt-2" data-testid="token-performance-summary">
            <p className="text-xs font-medium">{t("tokens.performanceTitle")}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
              {performanceRows.map(([label, name, value, description]) => (
                <div className="contents" key={label}>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span>{label}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("tokens.performanceInfo", { metric: label })}
                          className="size-4 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                          data-testid={`token-performance-info-${label.toLowerCase()}`}
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          <BadgeInfoIcon className="size-3" />
                          <span className="sr-only">
                            {t("tokens.performanceInfo", { metric: label })}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-54">
                        <div className="space-y-1 text-xs">
                          <p className="font-medium">{`${label}（${name}）`}</p>
                          <p>{description}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </dt>
                  <dd className="text-right tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-1.5 border-t pt-2">
            <p className="text-xs font-medium">{t("tokens.usageTitle")}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-xs">
              {tokenRows.map(([label, value]) => (
                <div className="contents" key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right tabular-nums">{formatTokenCount(value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-1.5 border-t pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">
                {t("tokens.costTitle", { currency: costCurrency })}
              </p>
              {usageCost.isEstimated && (
                <span className="text-[10px] tracking-wide uppercase text-muted-foreground">
                  {t("tokens.estimated")}
                </span>
              )}
            </div>

            {showCostUnavailable ? (
              <p className="text-xs text-muted-foreground">{t("tokens.costUnavailable")}</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
                {costRows.map(([label, value]) => (
                  <div className="contents" key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right tabular-nums">
                      {formatCost(value, costCurrency, notAvailableLabel, belowMinimumCostLabel)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
