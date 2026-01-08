import { useControllableState } from "@radix-ui/react-use-controllable-state"
import { CheckIcon, ChevronRightIcon, GlobeIcon, LoaderIcon, WrenchIcon, XIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext, useEffect, useState } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ACTION_CONSTANTS, ERROR_CONSTANTS, TEXT_UTILS, TOOL_CONSTANTS } from "@/lib/constants"
import { cn } from "@/lib/utils"

type ToolCallState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied"

type ToolCallContextValue = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  duration: number | undefined
  toolName: string
  resultCount?: number
  state: ToolCallState
}

const ToolCallContext = createContext<ToolCallContextValue | null>(null)

export const useToolCall = () => {
  const context = useContext(ToolCallContext)
  if (!context) {
    throw new Error("ToolCall components must be used within ToolCall")
  }
  return context
}

export type ToolCallProps = ComponentProps<typeof Collapsible> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  duration?: number
  toolName: string
  resultCount?: number
  state: ToolCallState
}

const MS_IN_S = 1000

export const ToolCall = memo(
  ({
    className,
    open,
    defaultOpen = true,
    onOpenChange,
    duration: durationProp,
    toolName,
    resultCount,
    state,
    children,
    ...props
  }: ToolCallProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange
    })
    const [duration, setDuration] = useState<number | undefined>(durationProp)
    const [startTime, setStartTime] = useState<number | null>(null)
    const [prevState, setPrevState] = useState<ToolCallState>(state)

    // Track duration: start timing after approval is granted or when tool starts execution
    useEffect(() => {
      // Start timing when transitioning from approval-requested to another state (user clicked approve)
      // or when entering a non-approval state directly
      const shouldStartTiming =
        (prevState === "approval-requested" && state !== "approval-requested") ||
        (state === "input-streaming" && startTime === null)

      if (shouldStartTiming && state !== "output-denied") {
        setStartTime(Date.now())
      }

      // Stop timing when reaching a final state
      if ((state === "output-available" || state === "output-error") && startTime !== null) {
        const calculatedDuration = Math.round(((Date.now() - startTime) / MS_IN_S) * 10) / 10
        setDuration(calculatedDuration)
        setStartTime(null)
      }

      setPrevState(state)
    }, [state, startTime, prevState])

    // Update duration if prop changes
    useEffect(() => {
      if (durationProp !== undefined) {
        setDuration(durationProp)
      }
    }, [durationProp])

    const handleOpenChange = (newOpen: boolean) => {
      setIsOpen(newOpen)
    }

    return (
      <ToolCallContext.Provider
        value={{ isOpen, setIsOpen, duration, toolName, resultCount, state }}
      >
        <div className={cn("rounded-lg border border-border/50 bg-muted/30 p-3", className)}>
          <Collapsible
            className="not-prose"
            onOpenChange={handleOpenChange}
            open={isOpen}
            {...props}
          >
            {children}
          </Collapsible>
        </div>
      </ToolCallContext.Provider>
    )
  }
)

/**
 * Get the appropriate icon for the tool
 */
const getToolIcon = (toolName: string) => {
  const iconClass = "size-4 transition-colors"

  switch (toolName.toLowerCase()) {
    case "websearch":
      return <GlobeIcon className={iconClass} />
    default:
      return <WrenchIcon className={iconClass} />
  }
}

export type ToolCallTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getToolMessage?: (
    toolName: string,
    state: ToolCallState,
    duration?: number,
    resultCount?: number
  ) => ReactNode
}

const defaultGetToolMessage = (
  toolName: string,
  state: ToolCallState,
  duration?: number,
  resultCount?: number
) => {
  // Display tool name in a readable format
  const displayName = TEXT_UTILS.getToolDisplayName(toolName)

  // Show shimmer for all in-progress states (not completed)
  const isCompleted = ["output-available", "output-error", "output-denied"].includes(state)

  if (!isCompleted) {
    return <Shimmer duration={1}>{`${displayName}...`}</Shimmer>
  }

  // Completed states
  if (state === "output-error") {
    return (
      <span>
        {displayName} {TOOL_CONSTANTS.states.failed.toLowerCase()}
      </span>
    )
  }

  if (state === "output-denied") {
    return (
      <span>
        {displayName} {TOOL_CONSTANTS.states.cancelled.toLowerCase()}
      </span>
    )
  }

  if (state === "output-available") {
    const parts: string[] = [displayName]
    if (resultCount !== undefined) {
      parts.push(`${resultCount} results`)
    }
    if (duration !== undefined && duration > 0) {
      parts.push(TEXT_UTILS.formatDuration(duration))
    }
    return <span>{parts.join(" · ")}</span>
  }

  return <span>{displayName}</span>
}

export const ToolCallTrigger = memo(
  ({
    className,
    children,
    getToolMessage = defaultGetToolMessage,
    ...props
  }: ToolCallTriggerProps) => {
    const { isOpen, duration, toolName, resultCount, state } = useToolCall()

    return (
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            {getToolIcon(toolName)}
            {getToolMessage(toolName, state, duration, resultCount)}
            <ChevronRightIcon
              className={cn("size-4 transition-transform", isOpen ? "rotate-90" : "rotate-0")}
            />
          </>
        )}
      </CollapsibleTrigger>
    )
  }
)

export type ToolCallContentProps = ComponentProps<typeof CollapsibleContent> & {
  maxHeight?: string
}

export const ToolCallContent = memo(
  ({ className, maxHeight = "16rem", children, ...props }: ToolCallContentProps) => (
    <CollapsibleContent
      className={cn(
        "relative mt-3 text-sm leading-normal",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
        "text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      {...props}
    >
      <div className="overflow-y-auto pr-2" style={{ maxHeight }}>
        <div className="space-y-2">{children}</div>
      </div>
    </CollapsibleContent>
  )
)

// Sub-components for different tool states

export type ToolCallInputStreamingProps = {
  message?: string
}

export const ToolCallInputStreaming = memo(
  ({ message = TOOL_CONSTANTS.states.working }: ToolCallInputStreamingProps) => (
    <div className="flex items-center gap-2 py-1">
      <LoaderIcon className="size-3.5 animate-spin" />
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  )
)

export type ToolCallInputAvailableProps = {
  children: ReactNode
}

export const ToolCallInputAvailable = memo(({ children }: ToolCallInputAvailableProps) => (
  <div className="py-1">{children}</div>
))

export type ToolCallApprovalRequestedProps = {
  description: ReactNode
  onApprove: () => void
  onDeny: () => void
}

export const ToolCallApprovalRequested = memo(
  ({ description, onApprove, onDeny }: ToolCallApprovalRequestedProps) => (
    <div className="py-1">
      <p className="mb-3 text-sm text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs bg-primary hover:bg-primary/90"
          onClick={onApprove}
        >
          <CheckIcon className="mr-1 size-3" />
          {ACTION_CONSTANTS.approve}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={onDeny}
        >
          <XIcon className="mr-1 size-3" />
          {ACTION_CONSTANTS.deny}
        </Button>
      </div>
    </div>
  )
)

export type ToolCallOutputErrorProps = {
  errorText?: string
}

export const ToolCallOutputError = memo(
  ({ errorText = ERROR_CONSTANTS.toolCallError }: ToolCallOutputErrorProps) => (
    <div className="flex items-center gap-2 py-1">
      <XIcon className="size-3.5 text-destructive" />
      <span className="text-sm text-destructive">{errorText}</span>
    </div>
  )
)

export type ToolCallOutputDeniedProps = {
  message?: string
}

export const ToolCallOutputDenied = memo(
  ({ message = ERROR_CONSTANTS.toolExecutionDenied }: ToolCallOutputDeniedProps) => (
    <div className="flex items-center gap-2 py-1">
      <XIcon className="size-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  )
)

// Web Search specific result component
export type WebSearchResult = {
  title: string
  url: string
  snippet: string
}

export type ToolCallWebSearchResultsProps = {
  results: WebSearchResult[]
}

export const ToolCallWebSearchResults = memo(({ results }: ToolCallWebSearchResultsProps) => (
  <div className="space-y-2">
    {results.map(result => (
      <div key={result.url} className="rounded-md border border-border/50 bg-muted/30 p-2.5">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-foreground hover:underline"
        >
          {result.title}
        </a>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{result.snippet}</p>
      </div>
    ))}
  </div>
))

ToolCall.displayName = "ToolCall"
ToolCallTrigger.displayName = "ToolCallTrigger"
ToolCallContent.displayName = "ToolCallContent"
ToolCallInputStreaming.displayName = "ToolCallInputStreaming"
ToolCallInputAvailable.displayName = "ToolCallInputAvailable"
ToolCallApprovalRequested.displayName = "ToolCallApprovalRequested"
ToolCallOutputError.displayName = "ToolCallOutputError"
ToolCallOutputDenied.displayName = "ToolCallOutputDenied"
ToolCallWebSearchResults.displayName = "ToolCallWebSearchResults"
