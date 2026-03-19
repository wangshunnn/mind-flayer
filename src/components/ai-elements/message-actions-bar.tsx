import type { LanguageModelUsage } from "ai"
import {
  CheckIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon
} from "lucide-react"
import type { ComponentProps } from "react"
import { useCallback, useState } from "react"
import { TokenUsageDetails } from "@/components/ai-elements/token-usage-details"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useActionConstants } from "@/lib/constants"
import type { ModelPricing } from "@/lib/provider-constants"
import { cn } from "@/lib/utils"

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
              <CheckIcon className="size-3.5 text-brand" />
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

// Assistant message actions bar (always visible)
export type AssistantMessageActionsBarProps = ComponentProps<"div"> & {
  messageText: string
  onLike?: () => void
  onDislike?: () => void
  onShare?: () => void
  onRefresh?: () => void
  showRefresh?: boolean
  tokenInfo?: LanguageModelUsage
  createdAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
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
  createdAt,
  firstTokenAt,
  lastTokenAt,
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
          createdAt={createdAt}
          firstTokenAt={firstTokenAt}
          lastTokenAt={lastTokenAt}
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
