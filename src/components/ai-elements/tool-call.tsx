import { useControllableState } from "@radix-ui/react-use-controllable-state"
import { CheckIcon, ChevronRightIcon, CircleXIcon, CopyIcon, TimerIcon, XIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Streamdown } from "streamdown"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Terminal } from "@/components/ai-elements/terminal"
import { getToolIcon } from "@/components/ai-elements/tool-icon"
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
  autoOpenWhileActive?: boolean
  duration?: number
  toolName: string
  resultCount?: number
  state: ToolCallState
}

const FINAL_STATES: ToolCallState[] = ["output-available", "output-error", "output-denied"]
const ACTIVE_STATES: ToolCallState[] = ["input-streaming", "input-available", "approval-responded"]
const TOOL_CALL_STATUS_BADGE_BASE =
  "inline-flex items-center font-normal rounded-full px-2 py-1 text-[10px] min-w-max"
const TOOL_CALL_STATUS_BADGE_VARIANTS = {
  success: "bg-green-500/10 text-green-600 dark:text-green-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400"
} as const

export const formatToolCallDuration = (duration: number) => {
  const safeDuration = Math.max(0, duration)
  return `${safeDuration.toFixed(2)} s`
}

const isActiveToolState = (state: ToolCallState) => ACTIVE_STATES.includes(state)

export const getToolCallStatusBadgeClass = (
  variant: keyof typeof TOOL_CALL_STATUS_BADGE_VARIANTS
) => cn(TOOL_CALL_STATUS_BADGE_BASE, TOOL_CALL_STATUS_BADGE_VARIANTS[variant])

export const ToolCall = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    autoOpenWhileActive = false,
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
    const hasUserToggledRef = useRef(false)
    const autoExpandedForApprovalRef = useRef(false)
    const autoExpandedForActiveRef = useRef(false)
    const previousStateRef = useRef(state)

    useEffect(() => {
      if (open !== undefined) {
        previousStateRef.current = state
        return
      }

      const previousState = previousStateRef.current

      const shouldAutoOpenForActive = autoOpenWhileActive && isActiveToolState(state)
      const wasAutoOpenActive = isActiveToolState(previousState)

      if (state === "approval-requested") {
        if (!hasUserToggledRef.current && !isOpen) {
          autoExpandedForApprovalRef.current = true
          setIsOpen(true)
        }
      } else if (shouldAutoOpenForActive) {
        if (!hasUserToggledRef.current && !isOpen) {
          autoExpandedForActiveRef.current = true
          setIsOpen(true)
        }
      } else if (
        wasAutoOpenActive &&
        autoExpandedForActiveRef.current &&
        !hasUserToggledRef.current &&
        isOpen
      ) {
        autoExpandedForActiveRef.current = false
        setIsOpen(false)
      } else if (
        previousState === "approval-requested" &&
        autoExpandedForApprovalRef.current &&
        !hasUserToggledRef.current &&
        isOpen
      ) {
        autoExpandedForApprovalRef.current = false
        setIsOpen(false)
      }

      previousStateRef.current = state
    }, [autoOpenWhileActive, isOpen, open, setIsOpen, state])

    const handleOpenChange = (newOpen: boolean) => {
      if (open === undefined) {
        hasUserToggledRef.current = true
        autoExpandedForApprovalRef.current = false
        autoExpandedForActiveRef.current = false
      }
      setIsOpen(newOpen)
    }

    return (
      <ToolCallContext.Provider
        value={{ isOpen, setIsOpen, duration: durationProp, toolName, resultCount, state }}
      >
        <div className={cn("group/tool-call rounded-md text-muted-foreground", className)}>
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

const defaultGetToolMessage = (
  toolName: string,
  state: ToolCallState,
  _duration?: number,
  resultCount?: number
) => {
  const toolConstants = useToolConstants()
  const { t } = useTranslation("tools")
  const isCompleted = ["output-available", "output-error", "output-denied"].includes(state)
  // Use translation if exists, otherwise fallback to original toolName
  const displayName = t(`names.${toolName}`, { defaultValue: toolName })

  if (!isCompleted) {
    return <Shimmer duration={1}>{displayName}</Shimmer>
  }

  let label = displayName
  let badge: ReactNode = null

  if (state === "output-error") {
    badge = (
      <span className={getToolCallStatusBadgeClass("error")}>
        {toolConstants.states.failed.toLowerCase()}
      </span>
    )
  } else if (state === "output-denied") {
    badge = (
      <span className={getToolCallStatusBadgeClass("error")}>
        {toolConstants.states.cancelled.toLowerCase()}
      </span>
    )
  } else if (state === "output-available") {
    if (resultCount !== undefined) {
      label = `${displayName} - ${t("results", { count: resultCount })}`
    }
    if (toolName.toLowerCase() !== "bashexecution") {
      badge = (
        <span className={getToolCallStatusBadgeClass("success")}>
          {toolConstants.states.done.toLowerCase()}
        </span>
      )
    }
  }

  return (
    <span className="flex items-center gap-2">
      {label}
      {badge}
    </span>
  )
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
    const triggerContent = children ?? (
      <>
        {icon ?? getToolIcon(toolName, "size-3 transition-colors")}
        {getToolMessage(toolName, state, duration, resultCount)}
        {trailingContent}
      </>
    )

    return (
      <CollapsibleTrigger
        className={cn(
          "group/activity-row flex min-h-7 w-full items-center gap-2 rounded-md pl-0 pr-1 py-1",
          "text-muted-foreground text-xs transition-colors",
          "hover:bg-muted/40 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className
        )}
        {...props}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {triggerContent}
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 transition-all",
              isOpen
                ? "rotate-90 opacity-70"
                : "rotate-0 opacity-0 group-hover/activity-row:opacity-60 group-focus-visible/activity-row:opacity-70"
            )}
            data-activity-chevron="true"
          />
        </div>
        {showDuration ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/90"
              data-activity-duration="true"
            >
              <TimerIcon className="size-3" />
              {formatToolCallDuration(duration)}
            </span>
          </div>
        ) : null}
      </CollapsibleTrigger>
    )
  }
)

export type ToolCallContentProps = ComponentProps<typeof CollapsibleContent> & {
  maxHeight?: string
}

export const ToolCallContent = memo(
  ({ className, maxHeight = "28rem", children, style, ...props }: ToolCallContentProps) => (
    <CollapsibleContent
      className={cn(
        "relative mt-1 rounded-md bg-muted/70 px-2 py-2 text-xs leading-normal",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
        "text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      style={{ maxHeight, ...style }}
      {...props}
    >
      <div className={cn("max-h-full overflow-y-auto pr-1")}>
        <div className="space-y-2">{children}</div>
      </div>
    </CollapsibleContent>
  )
)

// Sub-components for different tool states

export type ToolCallInputStreamingProps = {
  description?: ReactNode
}

export const ToolCallInputStreaming = memo(({ description }: ToolCallInputStreamingProps) => {
  const toolConstants = useToolConstants()
  return (
    <div className="py-1 text-xs text-muted-foreground">
      {description ?? <Shimmer duration={1}>{toolConstants.states.running}</Shimmer>}
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

const BASH_STDERR_ANSI_COLOR = "\u001B[31m"
const BASH_ANSI_RESET = "\u001B[0m"

export type ToolCallCopyablePreProps = {
  displayText: string
  copyText?: string
  className?: string
  textClassName?: string
  leadingContent?: ReactNode
}

export const ToolCallCopyablePre = memo(
  ({
    displayText,
    copyText = displayText,
    className,
    textClassName,
    leadingContent
  }: ToolCallCopyablePreProps) => {
    const actionConstants = useActionConstants()
    const [copied, setCopied] = useState(false)
    const isCopyDisabled = copyText.length === 0

    const handleCopy = useCallback(async () => {
      if (isCopyDisabled) {
        return
      }

      try {
        await navigator.clipboard.writeText(copyText)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch (error) {
        console.error("Failed to copy tool content:", error)
      }
    }, [copyText, isCopyDisabled])

    return (
      <div className={cn("rounded-md border border-border/50 bg-muted/30 px-3 py-3", className)}>
        <div className="flex items-start gap-2">
          {leadingContent ? (
            <span className="shrink-0 text-muted-foreground">{leadingContent}</span>
          ) : null}
          <pre
            className={cn(
              "min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs font-mono text-foreground",
              textClassName
            )}
          >
            {displayText}
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            disabled={isCopyDisabled}
            className={cn(
              "shrink-0 text-muted-foreground/50",
              "transition-colors hover:text-foreground",
              "disabled:cursor-default disabled:opacity-30"
            )}
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            <span className="sr-only">
              {copied ? actionConstants.copied : actionConstants.copy}
            </span>
          </button>
        </div>
      </div>
    )
  }
)

const formatBashExecCommand = (input?: BashExecInput) =>
  `${input?.command ?? ""} ${input?.args?.join(" ") ?? ""}`.trim()

const normalizeBashExecChunk = (value?: string) => {
  if (!value || value.trim().length === 0) {
    return null
  }

  return value.replace(/\n+$/u, "")
}

const formatBashExecTranscript = ({
  input,
  result,
  stderrLabel
}: {
  input?: BashExecInput
  result?: Pick<BashExecResult, "stdout" | "stderr">
  stderrLabel: string
}) => {
  const command = formatBashExecCommand(input)
  const stdout = normalizeBashExecChunk(result?.stdout)
  const stderr = normalizeBashExecChunk(result?.stderr)
  const sections: string[] = []

  if (command) {
    sections.push(`\u001B[36m$\u001B[0m ${command}`)
  }

  if (stdout) {
    sections.push(stdout)
  }

  if (stderr) {
    sections.push(`${BASH_STDERR_ANSI_COLOR}${stderrLabel}:${BASH_ANSI_RESET}\n${stderr}`)
  }

  return sections.join("\n\n")
}

export const BashExecCommandLine = memo(({ input }: { input?: BashExecInput }) => {
  const { t } = useTranslation("tools")
  const transcript = formatBashExecTranscript({
    input,
    stderrLabel: t("bashExecution.stderr")
  })

  if (!transcript) {
    return null
  }

  return <Terminal className="max-w-full" output={transcript} />
})

export type ToolCallOutputErrorProps = {
  errorText?: string
  input?: BashExecInput
}

export const ToolCallOutputError = memo(({ errorText, input }: ToolCallOutputErrorProps) => {
  const errorConstants = useErrorConstants()
  return (
    <div className="space-y-2 py-1">
      <BashExecCommandLine input={input} />
      <div className="flex items-center gap-2">
        <CircleXIcon className="size-3.5 shrink-0 text-destructive" />
        <div className="text-xs text-destructive max-h-48 overflow-y-auto">
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
    <div className="space-y-2 py-1">
      <BashExecCommandLine input={input} />
      <div className="flex items-center gap-2">
        <CircleXIcon className="size-3.5 shrink-0 text-destructive" />
        <div className="text-xs text-destructive max-h-48 overflow-y-auto">
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
  <div className="space-y-2 pr-2 max-h-48 overflow-y-auto">
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
          linkSafety={{ enabled: false }}
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
  const { t } = useTranslation("tools")
  const transcript = formatBashExecTranscript({
    input,
    result,
    stderrLabel: t("bashExecution.stderr")
  })

  if (!transcript) {
    return null
  }

  return <Terminal className="max-w-full" output={transcript} />
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
ToolCallCopyablePre.displayName = "ToolCallCopyablePre"
