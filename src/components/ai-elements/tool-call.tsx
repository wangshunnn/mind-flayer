import { useControllableState } from "@radix-ui/react-use-controllable-state"
import {
  CheckIcon,
  ChevronRightIcon,
  CircleXIcon,
  GlobeIcon,
  Loader2Icon,
  TerminalIcon,
  TimerIcon,
  WrenchIcon,
  XIcon
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext, useEffect, useRef, useState } from "react"
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
  onToolDurationChange?: (duration: number) => void
  toolName: string
  resultCount?: number
  state: ToolCallState
}

const MS_IN_S = 1000
const FINAL_STATES: ToolCallState[] = ["output-available", "output-error", "output-denied"]
const ACTIVE_STATES: ToolCallState[] = ["input-streaming", "input-available", "approval-responded"]
const TOOL_CALL_STATUS_BADGE_BASE =
  "inline-flex items-center rounded-full ml-1.5 px-2 py-1 text-[10px] min-w-max"
const TOOL_CALL_STATUS_BADGE_VARIANTS = {
  success: "bg-green-500/10 text-green-600 dark:text-green-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400"
} as const

const formatDuration = (duration: number) => {
  const safeDuration = Math.max(0, duration)
  if (safeDuration < 1) {
    return `${Math.round(safeDuration * MS_IN_S)}ms`
  }
  return `${safeDuration.toFixed(2)} s`
}

export const getToolCallStatusBadgeClass = (
  variant: keyof typeof TOOL_CALL_STATUS_BADGE_VARIANTS
) => cn(TOOL_CALL_STATUS_BADGE_BASE, TOOL_CALL_STATUS_BADGE_VARIANTS[variant])

export const ToolCall = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    duration: durationProp,
    onToolDurationChange,
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
    const startTimeRef = useRef<number | null>(null)
    const prevStateRef = useRef<ToolCallState>(state)

    // Track duration from execution start until terminal output state.
    useEffect(() => {
      const prevState = prevStateRef.current
      const isFinalState = FINAL_STATES.includes(state)
      const isActiveState = ACTIVE_STATES.includes(state)
      const approvedNow = prevState === "approval-requested" && state === "approval-responded"

      if (!isFinalState && (approvedNow || (isActiveState && startTimeRef.current === null))) {
        startTimeRef.current = Date.now()
      }

      if (
        (state === "output-available" || state === "output-error") &&
        startTimeRef.current !== null
      ) {
        const calculatedDuration =
          Math.round(((Date.now() - startTimeRef.current) / MS_IN_S) * 10) / 10
        setDuration(calculatedDuration)
        startTimeRef.current = null
      }

      if (state === "output-denied") {
        startTimeRef.current = null
      }

      prevStateRef.current = state
    }, [state])

    // Update duration if prop changes
    useEffect(() => {
      if (durationProp !== undefined) {
        setDuration(durationProp)
      }
    }, [durationProp])

    useEffect(() => {
      if (duration !== undefined) {
        onToolDurationChange?.(duration)
      }
    }, [duration, onToolDurationChange])

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
  icon?: ReactNode
  trailingContent?: ReactNode
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
        {displayName}
        <span className={getToolCallStatusBadgeClass("error")}>
          {toolConstants.states.failed.toLowerCase()}
        </span>
      </span>
    )
  }
  if (state === "output-denied") {
    return (
      <span>
        {displayName}
        <span className={getToolCallStatusBadgeClass("error")}>
          {toolConstants.states.cancelled.toLowerCase()}
        </span>
      </span>
    )
  }
  if (state === "output-available") {
    const parts: string[] = [displayName]
    const shouldShowDoneBadge = toolName.toLowerCase() !== "bashexecution"
    if (resultCount !== undefined) {
      parts.push(t("results", { count: resultCount }))
    }
    return (
      <span>
        {parts.join(" - ")}
        {shouldShowDoneBadge && (
          <span className={getToolCallStatusBadgeClass("success")}>
            {toolConstants.states.done.toLowerCase()}
          </span>
        )}
      </span>
    )
  }
  return <span>{displayName}</span>
}

export const ToolCallTrigger = memo(
  ({
    className,
    children,
    icon,
    trailingContent,
    getToolMessage = defaultGetToolMessage,
    ...props
  }: ToolCallTriggerProps) => {
    const { isOpen, toolName, duration, resultCount, state } = useToolCall()
    const showDuration = FINAL_STATES.includes(state) && duration !== undefined

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
            {icon ?? getToolIcon(toolName)}
            {getToolMessage(toolName, state, resultCount)}
            {trailingContent}
            <div className="ml-auto flex items-center gap-2">
              {showDuration && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/90">
                  <TimerIcon className="size-3" />
                  {formatDuration(duration)}
                </span>
              )}
              <ChevronRightIcon
                className={cn(
                  "size-3.5 transition-transform opacity-50",
                  isOpen ? "rotate-90" : "rotate-0"
                )}
              />
            </div>
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
  description: ReactNode
}

export const ToolCallInputStreaming = memo(({ description }: ToolCallInputStreamingProps) => {
  const toolConstants = useToolConstants()
  return (
    <div className="flex items-center gap-2 py-1">
      <Loader2Icon className="size-3.5 animate-spin" />
      <div className="text-sm text-muted-foreground">
        {description ?? toolConstants.states.running}
      </div>
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
        <div className="mb-3 text-sm text-muted-foreground">{description}</div>
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

export type BashExecInput = {
  command?: string
  args?: string[]
}

const formatBashExecCommand = (input?: BashExecInput) =>
  `${input?.command ?? ""} ${input?.args?.join(" ") ?? ""}`.trim()

export const BashExecCommandLine = ({ input }: { input?: BashExecInput }) => {
  const command = formatBashExecCommand(input)
  if (!command) {
    return null
  }

  return (
    <div className="rounded-md border border-border/50 bg-muted/50 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground shrink-0">$</span>
        <code className="text-xs font-mono text-foreground flex-1">{command}</code>
      </div>
    </div>
  )
}

export type ToolCallOutputErrorProps = {
  errorText?: string
  input?: BashExecInput
}

export const ToolCallOutputError = memo(({ errorText, input }: ToolCallOutputErrorProps) => {
  const errorConstants = useErrorConstants()
  return (
    <div className="space-y-1 py-1">
      <BashExecCommandLine input={input} />
      <div className="flex items-center gap-2">
        <CircleXIcon className="size-3.5 shrink-0 text-destructive" />
        <div className="text-sm text-destructive max-h-48 overflow-y-auto">
          {errorText ?? errorConstants.toolCallError}
        </div>
      </div>
    </div>
  )
})

export type ToolCallOutputDeniedProps = {
  message?: string
  input?: BashExecInput
}

export const ToolCallOutputDenied = memo(({ message, input }: ToolCallOutputDeniedProps) => {
  const errorConstants = useErrorConstants()
  return (
    <div className="space-y-1 py-1">
      <BashExecCommandLine input={input} />
      <div className="flex items-center gap-2">
        <CircleXIcon className="size-3.5 shrink-0 text-destructive" />
        <div className="text-sm text-destructive max-h-48 overflow-y-auto">
          {message ?? errorConstants.toolExecutionDenied}
        </div>
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
  input: BashExecInput
  result: BashExecResult
}

export const ToolCallBashExecResults = memo(({ input, result }: ToolCallBashExecResultsProps) => {
  const hasStdout = result.stdout && result.stdout.trim().length > 0
  const hasStderr = result.stderr && result.stderr.trim().length > 0

  return (
    <div className="space-y-1">
      <BashExecCommandLine input={input} />

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
