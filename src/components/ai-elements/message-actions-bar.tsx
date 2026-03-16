import type { LanguageModelUsage } from "ai"
import {
  CheckIcon,
  CopyIcon,
  GaugeIcon,
  PencilIcon,
  RefreshCwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon
} from "lucide-react"
import type { ComponentProps } from "react"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useActionConstants } from "@/lib/constants"
import { computeMessageUsageCost } from "@/lib/message-usage-cost"
import type { ModelPricing, PricingCurrency } from "@/lib/provider-constants"
import { cn } from "@/lib/utils"

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

// Copy button with feedback
export type CopyButtonProps = ComponentProps<typeof Button> & {
  text: string
  tooltip?: string
}

export const CopyButton = ({
  text,
  tooltip,
  size = "icon-sm",
  variant = "ghost",
  className,
  ...props
}: CopyButtonProps) => {
  const { copy, copied: copiedText, copiedSuccess } = useActionConstants()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)

      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy text:", err)
    }
  }, [text])

  const displayTooltip = tooltip ?? copy

  return (
    <TooltipProvider>
      <Tooltip disableHoverableContent={true}>
        <TooltipTrigger asChild>
          <Button
            size={size}
            type="button"
            variant={variant}
            className={cn("text-muted-foreground hover:text-foreground", className)}
            onClick={handleCopy}
            {...props}
          >
            {copied ? (
              <CheckIcon className="size-3.5 text-brand-green" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
            <span className="sr-only">{copied ? copiedText : displayTooltip}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{copied ? copiedSuccess : displayTooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// User message actions bar (show on hover)
export type UserMessageActionsBarProps = ComponentProps<"div"> & {
  messageText: string
  onEdit?: () => void
}

export const UserMessageActionsBar = ({
  messageText,
  onEdit,
  className,
  ...props
}: UserMessageActionsBarProps) => {
  const { edit } = useActionConstants()

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
        "justify-end",
        className
      )}
      {...props}
    >
      <CopyButton text={messageText} />
      <TooltipProvider>
        <Tooltip disableHoverableContent={true}>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={onEdit}
            >
              <PencilIcon className="size-3.5" />
              <span className="sr-only">{edit}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{edit}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

type TokenUsageDetailsProps = {
  usage: LanguageModelUsage
  modelProvider?: string
  modelProviderLabel?: string
  modelId?: string
  modelLabel?: string
  modelPricing?: ModelPricing
}

const TokenUsageDetails = ({
  usage,
  modelProvider,
  modelProviderLabel,
  modelId,
  modelLabel,
  modelPricing
}: TokenUsageDetailsProps) => {
  const { t } = useTranslation("chat")

  const costCurrency = modelPricing?.currency ?? DEFAULT_PRICING_CURRENCY
  const belowMinimumCostLabel = t("tokens.belowMinimumCost", {
    symbol: currencySymbols[costCurrency]
  })

  const usageCost = useMemo(
    () => computeMessageUsageCost(usage, modelPricing),
    [usage, modelPricing]
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

  return (
    <HoverCard closeDelay={100} openDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          size="icon-xs"
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
        >
          <GaugeIcon className="size-3.5" />
          <span className="sr-only">{t("tokens.openDetails")}</span>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="center" sideOffset={8} className="w-50 p-3">
        <div className="space-y-3">
          {displayModelName && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">{t("tokens.model")}</p>
              <p className="text-xs break-all text-muted-foreground">{displayModelName}</p>
            </div>
          )}

          <div className="space-y-1.5">
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
                      {formatCost(
                        value,
                        costCurrency,
                        t("tokens.notAvailable"),
                        belowMinimumCostLabel
                      )}
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

// Assistant message actions bar (always visible)
export type AssistantMessageActionsBarProps = ComponentProps<"div"> & {
  messageText: string
  onLike?: () => void
  onDislike?: () => void
  onShare?: () => void
  onRefresh?: () => void
  showRefresh?: boolean
  tokenInfo?: LanguageModelUsage
  modelProvider?: string
  modelProviderLabel?: string
  modelId?: string
  modelLabel?: string
  modelPricing?: ModelPricing
}

export const AssistantMessageActionsBar = ({
  messageText,
  onLike,
  onDislike,
  onShare,
  onRefresh,
  showRefresh = true,
  tokenInfo,
  modelProvider,
  modelProviderLabel,
  modelId,
  modelLabel,
  modelPricing,
  className,
  ...props
}: AssistantMessageActionsBarProps) => {
  const { like, dislike, regenerate } = useActionConstants()

  return (
    <div className={cn("flex items-center gap-0.5 text-muted-foreground", className)} {...props}>
      <CopyButton text={messageText} />
      <TooltipProvider>
        <Tooltip disableHoverableContent={true}>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={onLike}
            >
              <ThumbsUpIcon className="size-3.5" />
              <span className="sr-only">{like}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{like}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip disableHoverableContent={true}>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={onDislike}
            >
              <ThumbsDownIcon className="size-3.5" />
              <span className="sr-only">{dislike}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{dislike}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {showRefresh && (
        <TooltipProvider>
          <Tooltip disableHoverableContent={true}>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                type="button"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={onRefresh}
              >
                <RefreshCwIcon className="size-3.5" />
                <span className="sr-only">{regenerate}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{regenerate}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {tokenInfo && (
        <TokenUsageDetails
          usage={tokenInfo}
          modelProvider={modelProvider}
          modelProviderLabel={modelProviderLabel}
          modelId={modelId}
          modelLabel={modelLabel}
          modelPricing={modelPricing}
        />
      )}
    </div>
  )
}
