import { useControllableState } from "@radix-ui/react-use-controllable-state"
import { CheckIcon, ChevronRightIcon, GlobeIcon, LoaderIcon, WrenchIcon, XIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext, useEffect, useState } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type ToolCallContextValue = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  duration: number | undefined
  toolName: string
  resultCount?: number
  state: ToolCallState
}

type ToolCallState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied"

const ToolCallContext = createContext<ToolCallContextValue | null>(null)

export const useToolCall = () => {
  const context = useContext(ToolCallContext)
  if (!context) {
    throw new Error("ToolCall components must be used within ToolCall")
  }
  return context
}

export type ToolCallProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  duration?: number
  toolName: string
  resultCount?: number
  state: ToolCallState
}

const MS_IN_S = 1000
const AUTO_CLOSE_DELAY = 500

// States that indicate the tool is still in progress
const IN_PROGRESS_STATES: ToolCallState[] = [
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded"
]

export const ToolCall = memo(
  ({
    className,
    open,
    defaultOpen = false,
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
    const [duration, setDuration] = useControllableState({
      prop: durationProp,
      defaultProp: undefined
    })

    const [startTime, setStartTime] = useState<number | null>(null)
    const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false)
    const [prevState, setPrevState] = useState<ToolCallState>(state)

    const isInProgress = IN_PROGRESS_STATES.includes(state)

    // Auto-expand when tool is in progress, auto-collapse when completed
    useEffect(() => {
      if (isInProgress) {
        // Always expand when in progress
        setIsOpen(true)
        setHasAutoCollapsed(false)
      } else if (!hasAutoCollapsed) {
        // Auto-collapse after completion (with a small delay)
        const timer = setTimeout(() => {
          setIsOpen(false)
          setHasAutoCollapsed(true)
        }, AUTO_CLOSE_DELAY)
        return () => clearTimeout(timer)
      }
    }, [isInProgress, hasAutoCollapsed, setIsOpen])

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
        setDuration(Math.round(((Date.now() - startTime) / MS_IN_S) * 10) / 10)
        setStartTime(null)
      }

      setPrevState(state)
    }, [state, startTime, prevState, setDuration])

    const handleOpenChange = (newOpen: boolean) => {
      setIsOpen(newOpen)
    }

    return (
      <ToolCallContext.Provider
        value={{ isOpen, setIsOpen, duration, toolName, resultCount, state }}
      >
        <Collapsible
          className={cn("not-prose my-1", className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ToolCallContext.Provider>
    )
  }
)

/**
 * Get the appropriate icon for the tool with color based on state
 */
const getToolIcon = (toolName: string) => {
  // Determine color based on state
  const colorClass = "transition-colors"

  const iconClass = cn("size-4", colorClass)

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
  const displayName = toolName === "webSearch" ? "Web Search" : toolName

  // Show shimmer for all in-progress states (not completed)
  const isCompleted = ["output-available", "output-error", "output-denied"].includes(state)

  if (!isCompleted) {
    return <Shimmer duration={1}>{`${displayName}...`}</Shimmer>
  }

  // Completed states
  if (state === "output-error") {
    return <span>{displayName} failed</span>
  }

  if (state === "output-denied") {
    return <span>{displayName} cancelled</span>
  }

  if (state === "output-available") {
    const parts: string[] = [displayName]
    if (resultCount !== undefined) {
      parts.push(`${resultCount} results`)
    }
    if (duration !== undefined) {
      parts.push(`${duration}s`)
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

export type ToolCallContentProps = ComponentProps<typeof CollapsibleContent>

export const ToolCallContent = memo(({ className, children, ...props }: ToolCallContentProps) => (
  <CollapsibleContent
    className={cn(
      "relative mt-4 text-sm leading-normal pl-6",
      "before:absolute before:left-1.75 before:top-0 before:h-full before:w-0.5 before:rounded-full",
      "before:bg-muted-foreground/20",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
      "text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  >
    <ScrollArea className="max-h-64">
      <div className="space-y-2 pr-4">{children}</div>
    </ScrollArea>
  </CollapsibleContent>
))

// Sub-components for different tool states

export type ToolCallInputStreamingProps = {
  message?: string
}

export const ToolCallInputStreaming = memo(
  ({ message = "Preparing..." }: ToolCallInputStreamingProps) => (
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
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={onDeny}
        >
          <XIcon className="mr-1 size-3" />
          Deny
        </Button>
      </div>
    </div>
  )
)

export type ToolCallOutputErrorProps = {
  errorText?: string
}

export const ToolCallOutputError = memo(
  ({ errorText = "An error occurred" }: ToolCallOutputErrorProps) => (
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
  ({ message = "Tool execution was denied by user" }: ToolCallOutputDeniedProps) => (
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
