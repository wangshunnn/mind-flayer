import { useControllableState } from "@radix-ui/react-use-controllable-state"
import {
  CheckIcon,
  ChevronRightIcon,
  CircleXIcon,
  GlobeIcon,
  Loader2Icon,
  TerminalIcon,
  WrenchIcon,
  XIcon
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Streamdown } from "streamdown"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useActionConstants, useErrorConstants, useToolConstants } from "@/lib/constants"
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
  const iconClass = "size-3.5 transition-colors"

  switch (toolName.toLowerCase()) {
    case "websearch":
      return <GlobeIcon className={iconClass} />
    case "bashexecution":
      return <TerminalIcon className={iconClass} />
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

const defaultGetToolMessage = (toolName: string, state: ToolCallState, resultCount?: number) => {
  const toolConstants = useToolConstants()
  const { t } = useTranslation("tools")
  const isCompleted = ["output-available", "output-error", "output-denied"].includes(state)
  // Use translation if exists, otherwise fallback to original toolName
  const displayName = t(`names.${toolName}`, { defaultValue: toolName })

  if (!isCompleted) {
    return <Shimmer duration={1}>{displayName}</Shimmer>
  }
  if (state === "output-error") {
    return (
      <span>
        {displayName} {toolConstants.states.failed.toLowerCase()}
      </span>
    )
  }
  if (state === "output-denied") {
    return (
      <span>
        {displayName} {toolConstants.states.cancelled.toLowerCase()}
      </span>
    )
  }
  if (state === "output-available") {
    const parts: string[] = [displayName]
    if (resultCount !== undefined) {
      parts.push(t("results", { count: resultCount }))
    }
    return <span>{parts.join(" - ")}</span>
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
    const { isOpen, toolName, resultCount, state } = useToolCall()

    return (
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            {getToolIcon(toolName)}
            {getToolMessage(toolName, state, resultCount)}
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform opacity-50 ml-auto",
                isOpen ? "rotate-90" : "rotate-0"
              )}
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
      <div className={cn("overflow-y-auto pr-2")}>
        <div className="space-y-2">{children}</div>
      </div>
    </CollapsibleContent>
  )
)

// Sub-components for different tool states

export type ToolCallInputStreamingProps = {
  message?: string
}

export const ToolCallInputStreaming = memo(({ message }: ToolCallInputStreamingProps) => {
  const toolConstants = useToolConstants()
  return (
    <div className="flex items-center gap-2 py-1">
      <Loader2Icon className="size-3.5 animate-spin" />
      <span className="text-sm text-muted-foreground">
        {message ?? toolConstants.states.running}
      </span>
    </div>
  )
})

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
  ({ description, onApprove, onDeny }: ToolCallApprovalRequestedProps) => {
    const actionConstants = useActionConstants()
    return (
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
            {actionConstants.approve}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={onDeny}
          >
            <XIcon className="mr-1 size-3" />
            {actionConstants.deny}
          </Button>
        </div>
      </div>
    )
  }
)

export type ToolCallOutputErrorProps = {
  errorText?: string
}

export const ToolCallOutputError = memo(({ errorText }: ToolCallOutputErrorProps) => {
  const errorConstants = useErrorConstants()
  return (
    <div className="flex items-center gap-2 py-1">
      <CircleXIcon className="size-3.5 shrink-0 text-destructive" />
      <div className="text-sm text-destructive max-h-48 overflow-y-auto">
        {errorText ?? errorConstants.toolCallError}
      </div>
    </div>
  )
})

export type ToolCallOutputDeniedProps = {
  message?: string
}

export const ToolCallOutputDenied = memo(({ message }: ToolCallOutputDeniedProps) => {
  const errorConstants = useErrorConstants()
  return (
    <div className="flex items-center gap-2 py-1">
      <CircleXIcon className="size-3.5 shrink-0 text-destructive" />
      <div className="text-sm text-destructive max-h-48 overflow-y-auto">
        {message ?? errorConstants.toolExecutionDenied}
      </div>
    </div>
  )
})

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
  <div className="space-y-2 pr-2 max-h-70 overflow-y-auto">
    {results.map(result => (
      <div key={result.url} className="rounded-md border border-border/50 bg-muted/30 py-1 px-2">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-foreground hover:underline line-clamp-1"
        >
          {result.title}
        </a>
        <Streamdown
          mode="static"
          className="streamdown-tool-call text-xs! font-light text-muted-foreground line-clamp-1"
          components={{
            a: ({ children }) => <span>{children}</span>
          }}
        >
          {result.snippet[0]}
        </Streamdown>
      </div>
    ))}
  </div>
))

// Bash Execution specific result component
export type BashExecResult = {
  command: string
  args: string[]
  stdout: string
  stderr: string
  exitCode: number
  workingDir: string
  executedAt: string
}

export type ToolCallBashExecResultsProps = {
  result: BashExecResult
}

export const ToolCallBashExecResults = memo(({ result }: ToolCallBashExecResultsProps) => {
  const hasStdout = result.stdout && result.stdout.trim().length > 0
  const hasStderr = result.stderr && result.stderr.trim().length > 0

  return (
    <div className="space-y-1">
      {/* Command line */}
      <div className="rounded-md border border-border/50 bg-muted/50 px-3 py-2">
        <div className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground shrink-0">$</span>
          <code className="text-xs font-mono text-foreground flex-1">
            {result.command} {result.args.join(" ")}
          </code>
        </div>
      </div>

      {/* Stdout */}
      {hasStdout && (
        <div className="space-y-1">
          {/* <div className="text-xs text-muted-foreground pl-1">Output</div> */}
          <pre className="scrollbar-thin rounded-md border border-border/50 bg-muted/30 px-3 py-3 text-xs font-mono text-foreground overflow-x-auto max-h-70 overflow-y-auto">
            {result.stdout}
          </pre>
        </div>
      )}

      {/* Stderr */}
      {hasStderr && (
        <div className="space-y-1">
          {/* <div className="text-xs text-muted-foreground">Error output:</div> */}
          <pre className="scrollbar-thin rounded-md border border-destructive/50 bg-destructive/5 px-3 py-3 text-xs font-mono text-destructive overflow-x-auto max-h-48 overflow-y-auto">
            {result.stderr}
          </pre>
        </div>
      )}
    </div>
  )
})

ToolCall.displayName = "ToolCall"
ToolCallTrigger.displayName = "ToolCallTrigger"
ToolCallContent.displayName = "ToolCallContent"
ToolCallInputStreaming.displayName = "ToolCallInputStreaming"
ToolCallInputAvailable.displayName = "ToolCallInputAvailable"
ToolCallApprovalRequested.displayName = "ToolCallApprovalRequested"
ToolCallOutputError.displayName = "ToolCallOutputError"
ToolCallOutputDenied.displayName = "ToolCallOutputDenied"
ToolCallWebSearchResults.displayName = "ToolCallWebSearchResults"
ToolCallBashExecResults.displayName = "ToolCallBashExecResults"
