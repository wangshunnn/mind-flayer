import { useControllableState } from "@radix-ui/react-use-controllable-state"
import {
  type ChatAddToolApproveResponseFunction,
  type DynamicToolUIPart,
  getToolName,
  type ToolUIPart
} from "ai"
import {
  ChevronRightIcon,
  LibraryBigIcon,
  TerminalIcon,
  WandSparklesIcon,
  WrenchIcon
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext } from "react"
import { useTranslation } from "react-i18next"
import {
  BashExecCommandLine,
  type BashExecInput,
  type BashExecResult,
  getToolCallStatusBadgeClass,
  ToolCall,
  ToolCallApprovalRequested,
  ToolCallBashExecResults,
  ToolCallContent,
  ToolCallCopyablePre,
  ToolCallInputStreaming,
  ToolCallOutputDenied,
  ToolCallOutputError,
  ToolCallTrigger,
  ToolCallWebSearchResults
} from "@/components/ai-elements/tool-call"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ReadToolDisplayContext, ReadToolInput, ReadToolOutput } from "@/lib/tool-helpers"
import { cn } from "@/lib/utils"
import { Separator } from "../ui/separator"

type ToolCallsContainerContextValue = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  toolCount: number
}

const ToolCallsContainerContext = createContext<ToolCallsContainerContextValue | null>(null)

export const useToolCallsContainer = () => {
  const context = useContext(ToolCallsContainerContext)
  if (!context) {
    throw new Error("ToolCallsContainer components must be used within ToolCallsContainer")
  }
  return context
}

export type ToolCallsContainerProps = ComponentProps<typeof Collapsible> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  toolCount: number
}

export const ToolCallsContainer = memo(
  ({
    className,
    open,
    defaultOpen = true,
    onOpenChange,
    toolCount,
    children,
    ...props
  }: ToolCallsContainerProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange
    })

    const handleOpenChange = (newOpen: boolean) => {
      setIsOpen(newOpen)
    }

    return (
      <ToolCallsContainerContext.Provider value={{ isOpen, setIsOpen, toolCount }}>
        <div className={cn("rounded-lg p-0", className)}>
          <Collapsible
            className="not-prose"
            onOpenChange={handleOpenChange}
            open={isOpen}
            {...props}
          >
            {children}
          </Collapsible>
        </div>
      </ToolCallsContainerContext.Provider>
    )
  }
)

export type ToolCallsContainerTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  toolNames?: string[]
  isAnyToolInProgress?: boolean
  totalDuration?: number
  getToolsMessage?: (toolCount: number) => ReactNode
}

export const ToolCallsContainerTrigger = memo(
  ({
    className,
    children,
    toolNames = [],
    totalDuration,
    getToolsMessage,
    ...props
  }: ToolCallsContainerTriggerProps) => {
    const { isOpen, toolCount } = useToolCallsContainer()
    const { t } = useTranslation("tools")
    const defaultMessage = <span>{t("usedTools", { count: toolCount })}</span>

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            <WrenchIcon className="size-4" />
            {getToolsMessage ? getToolsMessage(toolCount) : defaultMessage}
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform opacity-50",
                isOpen ? "rotate-90" : "rotate-0"
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    )
  }
)

export type ToolCallsContainerContentProps = ComponentProps<typeof CollapsibleContent> & {
  maxHeight?: string
}

export const ToolCallsContainerContent = memo(
  ({ className, maxHeight = "24rem", children, ...props }: ToolCallsContainerContentProps) => (
    <CollapsibleContent
      className={cn(
        "relative mt-2 text-sm leading-normal",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
        "outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      {...props}
    >
      <div className="overflow-y-auto pr-2">
        <div className="space-y-3">{children}</div>
      </div>
    </CollapsibleContent>
  )
)

export type ToolCallsListProps = {
  toolParts: (ToolUIPart | DynamicToolUIPart)[]
  onToolApprovalResponse: ChatAddToolApproveResponseFunction
  toolDurations?: Record<string, number>
}

export type ToolCallTimelineItemProps = {
  part: ToolUIPart | DynamicToolUIPart
  onToolApprovalResponse: ChatAddToolApproveResponseFunction
  duration?: number
}

const formatStructuredValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const ToolCallStructuredBlock = ({ value }: { value: unknown }) => {
  const formatted = formatStructuredValue(value)
  if (!formatted) {
    return null
  }

  return (
    <pre
      className={cn(
        "scrollbar-thin rounded-md border border-border/50",
        "bg-muted/30 px-3 py-3",
        "text-xs font-mono text-foreground",
        "overflow-x-auto max-h-70 overflow-y-auto",
        "whitespace-pre-wrap wrap-break-word"
      )}
    >
      {formatted}
    </pre>
  )
}

const ToolCallWebSearch = ({
  part,
  onToolApprovalResponse,
  duration
}: {
  part: ToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
  duration?: number
}) => {
  const toolCallId = part.toolCallId
  const input = part.input as {
    objective: string
    searchQueries: string[]
    maxResults?: number
  }
  const output =
    part.state === "output-available"
      ? (part.output as {
          query: string
          results: Array<{
            title: string
            url: string
            snippet: string
          }>
          totalResults: number
        })
      : null

  const approvalId = part.approval?.id

  return (
    <ToolCall
      key={toolCallId}
      toolName="webSearch"
      state={part.state}
      duration={duration}
      resultCount={output?.totalResults}
      defaultOpen={false}
    >
      <ToolCallTrigger />
      <ToolCallContent>
        {(part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-responded") && (
          <ToolCallInputStreaming description={input?.objective} />
        )}
        {part.state === "approval-requested" && approvalId && (
          <ToolCallApprovalRequested
            description={input?.objective ?? ""}
            onApprove={() => onToolApprovalResponse({ id: approvalId, approved: true })}
            onDeny={() => onToolApprovalResponse({ id: approvalId, approved: false })}
          />
        )}
        {part.state === "output-available" && output && (
          <ToolCallWebSearchResults results={output.results} />
        )}
        {part.state === "output-error" && <ToolCallOutputError errorText={part.errorText} />}
        {part.state === "output-denied" && <ToolCallOutputDenied message={part.errorText} />}
      </ToolCallContent>
    </ToolCall>
  )
}

const ToolCallBashExec = ({
  part,
  onToolApprovalResponse,
  duration
}: {
  part: ToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
  duration?: number
}) => {
  const toolCallId = part.toolCallId
  const { t } = useTranslation("tools")
  const input = part.input as BashExecInput
  const output = part.state === "output-available" ? (part.output as BashExecResult) : null

  const approvalId = part.approval?.id

  return (
    <ToolCall
      key={toolCallId}
      toolName="bashExecution"
      state={part.state}
      duration={duration}
      defaultOpen={false}
    >
      <ToolCallTrigger
        icon={<TerminalIcon className="size-3.5 transition-colors" />}
        trailingContent={
          part.state === "output-available" && output?.exitCode !== undefined ? (
            <span
              className={cn(
                "ml-0",
                getToolCallStatusBadgeClass(output.exitCode === 0 ? "success" : "error")
              )}
            >
              {t("bashExecution.exitCode", { code: output.exitCode })}
            </span>
          ) : null
        }
      />
      <ToolCallContent>
        {(part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-responded") && <BashExecCommandLine input={input} />}
        {part.state === "approval-requested" && approvalId && (
          <ToolCallApprovalRequested
            description={<BashExecCommandLine input={input} />}
            onApprove={() => onToolApprovalResponse({ id: approvalId, approved: true })}
            onDeny={() => onToolApprovalResponse({ id: approvalId, approved: false })}
          />
        )}
        {part.state === "output-available" && output && (
          <ToolCallBashExecResults input={input} result={output} />
        )}
        {part.state === "output-error" && (
          <ToolCallOutputError input={input} errorText={part.errorText} />
        )}
        {part.state === "output-denied" && (
          <ToolCallOutputDenied input={input} message={part.errorText} />
        )}
      </ToolCallContent>
    </ToolCall>
  )
}

const ToolCallRead = ({
  part,
  onToolApprovalResponse,
  duration
}: {
  part: ToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
  duration?: number
}) => {
  const toolCallId = part.toolCallId
  const { t } = useTranslation("tools")
  const input = part.input as ReadToolInput
  const output = part.state === "output-available" ? (part.output as ReadToolOutput) : null
  const approvalId = part.approval?.id
  const inputFilePath = input?.filePath || t("read.emptyFile")
  const outputFilePath = output?.filePath || t("read.emptyFile")
  const skillContext = output?.displayContext?.kind === "skill" ? output.displayContext : null
  return (
    <ToolCall
      key={toolCallId}
      toolName="read"
      state={part.state}
      duration={duration}
      defaultOpen={false}
    >
      <ToolCallTrigger>
        {skillContext ? (
          <ToolCallSkillBadge
            skillContext={skillContext}
            skillLabel={t("skillRead.badge")}
            fileKindLabel={t(`skillRead.fileKinds.${skillContext.fileKind}`)}
          />
        ) : undefined}
      </ToolCallTrigger>
      <ToolCallContent>
        {(part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-responded") && (
          <ToolCallInputStreaming
            description={
              <ToolCallCopyablePre
                displayText={inputFilePath}
                leadingContent={<LibraryBigIcon className="mt-0.5 size-3" />}
              />
            }
          />
        )}
        {part.state === "approval-requested" && approvalId && (
          <ToolCallApprovalRequested
            description={
              <ToolCallCopyablePre
                displayText={inputFilePath}
                leadingContent={<LibraryBigIcon className="mt-0.5 size-3" />}
              />
            }
            onApprove={() => onToolApprovalResponse({ id: approvalId, approved: true })}
            onDeny={() => onToolApprovalResponse({ id: approvalId, approved: false })}
          />
        )}
        {part.state === "output-available" && output && (
          <div className="space-y-2">
            <ToolCallCopyablePre
              displayText={outputFilePath}
              leadingContent={<LibraryBigIcon className="mt-0.5 size-3" />}
            />
            <ToolCallCopyablePre
              displayText={output.content || t("read.emptyFile")}
              copyText={output.content}
              textClassName="scrollbar-thin max-h-70 overflow-y-auto"
            />
            {output.truncated && output.nextOffset !== null && (
              <div className="text-xs text-muted-foreground pl-1">
                {t("read.nextOffset", { nextOffset: output.nextOffset })}
              </div>
            )}
          </div>
        )}
        {part.state === "output-error" && <ToolCallOutputError errorText={part.errorText} />}
        {part.state === "output-denied" && <ToolCallOutputDenied message={part.errorText} />}
      </ToolCallContent>
    </ToolCall>
  )
}

const ToolCallSkillBadge = ({
  skillContext,
  skillLabel,
  fileKindLabel
}: {
  skillContext: Extract<ReadToolDisplayContext, { kind: "skill" }>
  skillLabel: string
  fileKindLabel: string
}) => (
  <div className="flex min-w-0 flex-wrap items-center gap-2">
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full",
        "px-2 py-1 text-[10px] font-medium",
        "text-indigo-500 dark:text-indigo-300 bg-indigo-500/10 dark:bg-indigo-500/20"
      )}
    >
      <WandSparklesIcon className="size-3" />
      {skillLabel}
    </span>
    <span className="text-xs font-medium text-foreground">{skillContext.skillName}</span>
    <span className="text-xs text-muted-foreground">{fileKindLabel}</span>
  </div>
)

const ToolCallGeneric = ({
  part,
  onToolApprovalResponse,
  duration
}: {
  part: ToolUIPart | DynamicToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
  duration?: number
}) => {
  const toolName = getToolName(part)
  const approvalId = part.approval?.id
  const input = formatStructuredValue(part.input)
  const output = formatStructuredValue(part.state === "output-available" ? part.output : null)

  return (
    <ToolCall
      key={part.toolCallId}
      toolName={toolName}
      state={part.state}
      duration={duration}
      defaultOpen={false}
    >
      <ToolCallTrigger />
      <ToolCallContent>
        {(part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-responded") && (
          <ToolCallInputStreaming description={input ?? toolName} />
        )}
        {part.state === "approval-requested" && approvalId && (
          <ToolCallApprovalRequested
            description={<ToolCallStructuredBlock value={part.input} />}
            onApprove={() => onToolApprovalResponse({ id: approvalId, approved: true })}
            onDeny={() => onToolApprovalResponse({ id: approvalId, approved: false })}
          />
        )}
        {part.state === "output-available" && output && <ToolCallStructuredBlock value={output} />}
        {part.state === "output-error" && <ToolCallOutputError errorText={part.errorText} />}
        {part.state === "output-denied" && <ToolCallOutputDenied message={part.errorText} />}
      </ToolCallContent>
    </ToolCall>
  )
}

export const ToolCallTimelineItem = memo(
  ({ part, onToolApprovalResponse, duration }: ToolCallTimelineItemProps) => {
    if (part.type === "tool-webSearch") {
      return (
        <ToolCallWebSearch
          part={part}
          duration={duration}
          onToolApprovalResponse={onToolApprovalResponse}
        />
      )
    }

    if (part.type === "tool-bashExecution") {
      return (
        <ToolCallBashExec
          part={part}
          duration={duration}
          onToolApprovalResponse={onToolApprovalResponse}
        />
      )
    }

    if (part.type === "tool-read") {
      return (
        <ToolCallRead
          part={part}
          duration={duration}
          onToolApprovalResponse={onToolApprovalResponse}
        />
      )
    }

    return (
      <ToolCallGeneric
        part={part}
        duration={duration}
        onToolApprovalResponse={onToolApprovalResponse}
      />
    )
  }
)

export type ToolCallsSummaryData = {
  toolNames: string[]
  skillNames: string[]
}

const TOOL_CALLS_SUMMARY_BADGE_STYLES = {
  tools: "text-brand/90",
  skills: "text-brand/90"
} as const

const getToolSummarySkillContext = (
  part: ToolUIPart | DynamicToolUIPart
): Extract<ReadToolDisplayContext, { kind: "skill" }> | null => {
  const output = part.output as ReadToolOutput | undefined
  return output?.displayContext?.kind === "skill" ? output.displayContext : null
}

export function collectToolCallsSummary(
  toolParts: (ToolUIPart | DynamicToolUIPart)[]
): ToolCallsSummaryData {
  const toolNames: string[] = []
  const skillNames: string[] = []
  const seenToolNames = new Set<string>()
  const seenSkillNames = new Set<string>()

  for (const part of toolParts) {
    const skillContext = getToolSummarySkillContext(part)
    const toolName = getToolName(part)

    if (!seenToolNames.has(toolName)) {
      seenToolNames.add(toolName)
      toolNames.push(toolName)
    }

    if (skillContext?.skillName && !seenSkillNames.has(skillContext.skillName)) {
      seenSkillNames.add(skillContext.skillName)
      skillNames.push(skillContext.skillName)
    }
  }

  return { toolNames, skillNames }
}

type ToolCallsSummaryBadgeProps = {
  badgeType: keyof typeof TOOL_CALLS_SUMMARY_BADGE_STYLES
  icon: ReactNode
  label: string
  names: string[]
}

const ToolCallsSummaryBadge = ({ badgeType, icon, label, names }: ToolCallsSummaryBadgeProps) => (
  <Tooltip disableHoverableContent={true}>
    <TooltipTrigger asChild>
      <button
        aria-label={label}
        className={cn(
          "inline-flex cursor-default items-center gap-1 rounded-full",
          "text-xs whitespace-nowrap outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
          TOOL_CALLS_SUMMARY_BADGE_STYLES[badgeType]
        )}
        data-summary-badge={badgeType}
        type="button"
      >
        {icon}
        <span>{label}</span>
      </button>
    </TooltipTrigger>
    <TooltipContent className="max-w-72 px-3 py-2" data-summary-tooltip={badgeType} side="top">
      <div className="flex flex-col gap-1">
        {names.map(name => (
          <p className="leading-5" key={`${badgeType}-${name}`}>
            {name}
          </p>
        ))}
      </div>
    </TooltipContent>
  </Tooltip>
)

export type ToolCallsSummaryProps = ComponentProps<"div"> & {
  toolParts: (ToolUIPart | DynamicToolUIPart)[]
}

export const ToolCallsSummary = memo(
  ({ className, toolParts, ...props }: ToolCallsSummaryProps) => {
    const { t } = useTranslation("tools")
    const summary = collectToolCallsSummary(toolParts)
    const translatedToolNames = summary.toolNames.map(toolName =>
      t(`names.${toolName}`, { defaultValue: toolName })
    )
    const hasToolBadge = translatedToolNames.length > 0
    const hasSkillBadge = summary.skillNames.length > 0
    const shouldShowSeparator = hasToolBadge && hasSkillBadge

    return (
      <div
        className={cn("flex w-full flex-wrap items-center gap-2.5 pb-1 text-xs", className)}
        {...props}
      >
        {hasToolBadge && (
          <ToolCallsSummaryBadge
            badgeType="tools"
            icon={<WrenchIcon className="size-3" />}
            label={t("summary.toolsLabel", { count: translatedToolNames.length })}
            names={translatedToolNames}
          />
        )}
        {shouldShowSeparator && <Separator orientation="vertical" className="h-3!" />}
        {hasSkillBadge && (
          <ToolCallsSummaryBadge
            badgeType="skills"
            icon={<WandSparklesIcon className="size-3" />}
            label={t("summary.skillsLabel", { count: summary.skillNames.length })}
            names={summary.skillNames}
          />
        )}
      </div>
    )
  }
)

export const ToolCallsList = memo(
  ({ toolParts, onToolApprovalResponse, toolDurations }: ToolCallsListProps) => (
    <ToolCallsContainerContent>
      {toolParts.map(part => (
        <ToolCallTimelineItem
          key={part.toolCallId}
          part={part}
          duration={toolDurations?.[part.toolCallId]}
          onToolApprovalResponse={onToolApprovalResponse}
        />
      ))}
    </ToolCallsContainerContent>
  )
)

ToolCallsContainer.displayName = "ToolCallsContainer"
ToolCallsContainerTrigger.displayName = "ToolCallsContainerTrigger"
ToolCallsContainerContent.displayName = "ToolCallsContainerContent"
ToolCallTimelineItem.displayName = "ToolCallTimelineItem"
ToolCallsSummary.displayName = "ToolCallsSummary"
ToolCallsList.displayName = "ToolCallsList"
