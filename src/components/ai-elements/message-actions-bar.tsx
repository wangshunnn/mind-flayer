import {
  CheckIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  ShareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon
} from "lucide-react"
import type { ComponentProps } from "react"
import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Copy button with feedback
export type CopyButtonProps = ComponentProps<typeof Button> & {
  text: string
  tooltip?: string
}

export const CopyButton = ({
  text,
  tooltip = "Copy",
  size = "icon-sm",
  variant = "ghost",
  className,
  ...props
}: CopyButtonProps) => {
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
            <span className="sr-only">{copied ? "Copied" : tooltip}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copied ? "Copied!" : tooltip}</p>
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
}: UserMessageActionsBarProps) => (
  <div
    className={cn(
      "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
      "justify-end",
      className
    )}
    {...props}
  >
    <CopyButton text={messageText} tooltip="Copy" />
    <TooltipProvider>
      <Tooltip disableHoverableContent={true}>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={onEdit}
          >
            <PencilIcon className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Edit</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
)

// Assistant message actions bar (always visible)
export type AssistantMessageActionsBarProps = ComponentProps<"div"> & {
  messageText: string
  onLike?: () => void
  onDislike?: () => void
  onShare?: () => void
  onRefresh?: () => void
  tokenInfo?: {
    inputTokens: number
    outputTokens: number
    totalTokens?: number
  }
}

export const AssistantMessageActionsBar = ({
  messageText,
  onLike,
  onDislike,
  onShare,
  onRefresh,
  tokenInfo,
  className,
  ...props
}: AssistantMessageActionsBarProps) => (
  <div className={cn("flex items-center gap-0.5 text-muted-foreground", className)} {...props}>
    <CopyButton text={messageText} tooltip="Copy" />
    <TooltipProvider>
      <Tooltip disableHoverableContent={true}>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={onLike}
          >
            <ThumbsUpIcon className="size-3.5" />
            <span className="sr-only">Like</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Like</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <TooltipProvider>
      <Tooltip disableHoverableContent={true}>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={onDislike}
          >
            <ThumbsDownIcon className="size-3.5" />
            <span className="sr-only">Dislike</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Dislike</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <TooltipProvider>
      <Tooltip disableHoverableContent={true}>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={onShare}
          >
            <ShareIcon className="size-3.5" />
            <span className="sr-only">Share</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Share</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <TooltipProvider>
      <Tooltip disableHoverableContent={true}>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
          >
            <RefreshCwIcon className="size-3.5" />
            <span className="sr-only">Regenerate</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Regenerate</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    {tokenInfo && (
      <span className="ml-2 text-xs text-muted-foreground/70">
        {tokenInfo.inputTokens}/{tokenInfo.outputTokens} tokens
      </span>
    )}
  </div>
)
