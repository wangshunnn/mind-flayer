import { useControllableState } from "@radix-ui/react-use-controllable-state"
import {
  BookOpenTextIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleXIcon,
  CopyIcon,
  GlobeIcon,
  LibraryBigIcon,
  Loader2Icon,
  TerminalIcon,
  TimerIcon,
  WrenchIcon,
  XIcon
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useCallback, useContext, useEffect, useRef, useState } from "react"
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
const FINAL_STATES: ToolCallState[] = ["output-available", "output-error", "output-denied"]
const TOOL_CALL_STATUS_BADGE_BASE =
  "inline-flex items-center font-normal rounded-full px-2 py-1 text-[10px] min-w-max"
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
    const previousStateRef = useRef(state)

    useEffect(() => {
      if (open !== undefined) {
        previousStateRef.current = state
        return
      }

      const previousState = previousStateRef.current

      if (state === "approval-requested") {
        if (!hasUserToggledRef.current && !isOpen) {
          autoExpandedForApprovalRef.current = true
          setIsOpen(true)
        }
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
    }, [isOpen, open, setIsOpen, state])

    const handleOpenChange = (newOpen: boolean) => {
      if (open === undefined) {
        hasUserToggledRef.current = true
        autoExpandedForApprovalRef.current = false
      }
      setIsOpen(newOpen)
    }

    return (
      <ToolCallContext.Provider
        value={{ isOpen, setIsOpen, duration: durationProp, toolName, resultCount, state }}
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
    case "read":
      return <BookOpenTextIcon className={iconClass} />
    case "skillread":
      return <LibraryBigIcon className={iconClass} />
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
    const triggerContent = children ?? (
      <>
        {icon ?? getToolIcon(toolName)}
        {getToolMessage(toolName, state, resultCount)}
        {trailingContent}
      </>
    )

    return (
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        <div className="flex min-w-0 flex-1 text-xs font-medium items-center gap-2">
          {triggerContent}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
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
    <div className="flex items-start gap-2 py-1">
      <Loader2Icon className="mt-0.5 size-3.5 shrink-0 animate-spin" />
      <div className="min-w-0 flex-1 text-sm text-muted-foreground">
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
            className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-30"
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

export const BashExecCommandLine = ({ input }: { input?: BashExecInput }) => {
  const command = formatBashExecCommand(input)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!command) return
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [command])

  if (!command) {
    return null
  }

  return (
    <div className="rounded-md border border-border/50 bg-muted/50 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground shrink-0">$</span>
        <code className="text-xs font-mono text-foreground flex-1 break-all">{command}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
        </button>
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
          <ToolCallCopyablePre
            displayText={result.stdout}
            textClassName="scrollbar-thin max-h-48 overflow-y-auto"
          />
        </div>
      )}

      {/* Stderr */}
      {hasStderr && !hasStdout && (
        <div className="space-y-1">
          <ToolCallCopyablePre
            displayText={result.stderr}
            className="border-destructive/50 bg-destructive/5"
            textClassName="scrollbar-thin max-h-48 overflow-y-auto text-destructive"
          />
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
ToolCallCopyablePre.displayName = "ToolCallCopyablePre"
