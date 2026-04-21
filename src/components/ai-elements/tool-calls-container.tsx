import {
  type ChatAddToolApproveResponseFunction,
  type DynamicToolUIPart,
  getToolName,
  type ToolUIPart
} from "ai"
import { BotIcon, LibraryBigIcon, TerminalIcon, WandSparklesIcon, WrenchIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Terminal } from "@/components/ai-elements/terminal"
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
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type {
  AgentSessionOutput,
  AgentSessionReadInput,
  AgentSessionSendInput,
  AgentSessionStartInput,
  AgentSessionStopInput,
  ReadToolDisplayContext,
  ReadToolInput,
  ReadToolOutput
} from "@/lib/tool-helpers"
import { cn } from "@/lib/utils"
import { Separator } from "../ui/separator"

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

type AgentSessionInput =
  | AgentSessionStartInput
  | AgentSessionReadInput
  | AgentSessionSendInput
  | AgentSessionStopInput

const AGENT_SESSION_TERMINAL_STATUSES = new Set(["failed", "stopped", "timeout"])
const FINAL_TOOL_STATES = new Set(["output-available", "output-error", "output-denied"])

const getAgentSessionStatusClassName = (status: string) =>
  cn(
    "text-[10px] font-normal",
    AGENT_SESSION_TERMINAL_STATUSES.has(status)
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground/80"
  )

const formatAgentSessionInput = (toolName: string, input: AgentSessionInput | undefined) => {
  if (!input) {
    return toolName
  }

  if ("agent" in input) {
    return `${input.agent} ${input.mode} ${input.cwd}`
  }

  if ("key" in input || "text" in input) {
    const parts = [input.sessionId]
    if (input.text) {
      parts.push(JSON.stringify(input.text))
    }
    if (input.key) {
      parts.push(input.key)
    }
    return parts.join(" ")
  }

  return input.sessionId
}

const formatAgentSessionTranscript = (
  input: AgentSessionInput | undefined,
  output: AgentSessionOutput,
  labels: {
    session: string
    status: string
    exit: (code: number) => string
    nextOffset: (nextOffset: number) => string
  }
) => {
  const lines = [
    `$ ${output.commandPreview || formatAgentSessionInput("agent session", input)}`,
    `[${labels.session}] ${output.sessionId}`,
    `[${labels.status}] ${output.status}${
      output.exitCode === null ? "" : `, ${labels.exit(output.exitCode)}`
    }`,
    output.output
  ]

  if (output.nextOffset !== null) {
    lines.push(`[${labels.nextOffset(output.nextOffset)}]`)
  }

  return lines.filter(Boolean).join("\n")
}

type ToolCallFrameProps = {
  part: ToolUIPart | DynamicToolUIPart
  toolName: string
  onToolApprovalResponse: ChatAddToolApproveResponseFunction
  duration?: number
  resultCount?: number
  triggerProps?: ComponentProps<typeof ToolCallTrigger>
  inputContent?: ReactNode
  approvalContent?: ReactNode
  outputContent?: ReactNode
  errorContent?: ReactNode
  deniedContent?: ReactNode
}

const ToolCallFrame = ({
  part,
  toolName,
  onToolApprovalResponse,
  duration,
  resultCount,
  triggerProps,
  inputContent,
  approvalContent,
  outputContent,
  errorContent,
  deniedContent
}: ToolCallFrameProps) => {
  const approvalId = part.approval?.id

  return (
    <ToolCall
      key={part.toolCallId}
      toolName={toolName}
      state={part.state}
      duration={duration}
      resultCount={resultCount}
      defaultOpen={false}
    >
      <ToolCallTrigger {...triggerProps} />
      <ToolCallContent>
        {(part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-responded") && (
          <ToolCallInputStreaming description={inputContent ?? toolName} />
        )}
        {part.state === "approval-requested" && approvalId && (
          <ToolCallApprovalRequested
            description={approvalContent ?? inputContent ?? toolName}
            onApprove={() => onToolApprovalResponse({ id: approvalId, approved: true })}
            onDeny={() => onToolApprovalResponse({ id: approvalId, approved: false })}
          />
        )}
        {part.state === "output-available" && outputContent}
        {part.state === "output-error" &&
          (errorContent ?? <ToolCallOutputError errorText={part.errorText} />)}
        {part.state === "output-denied" &&
          (deniedContent ?? <ToolCallOutputDenied message={part.errorText} />)}
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

export const ToolCallTimelineItem = memo(
  ({ part, onToolApprovalResponse, duration }: ToolCallTimelineItemProps) => {
    const { t } = useTranslation("tools")
    const toolName = getToolName(part)

    if (part.type === "tool-webSearch") {
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

      return (
        <ToolCallFrame
          part={part}
          toolName={toolName}
          onToolApprovalResponse={onToolApprovalResponse}
          duration={duration}
          resultCount={output?.totalResults}
          inputContent={input?.objective}
          approvalContent={input?.objective ?? ""}
          outputContent={output ? <ToolCallWebSearchResults results={output.results} /> : null}
        />
      )
    }

    if (part.type === "tool-bashExecution") {
      const input = part.input as BashExecInput
      const output = part.state === "output-available" ? (part.output as BashExecResult) : null
      const commandLine = <BashExecCommandLine input={input} />

      return (
        <ToolCallFrame
          part={part}
          toolName={toolName}
          onToolApprovalResponse={onToolApprovalResponse}
          duration={duration}
          triggerProps={{
            icon: <TerminalIcon className="size-3.5 transition-colors" />,
            trailingContent:
              part.state === "output-available" && output?.exitCode !== undefined ? (
                <span
                  className={getToolCallStatusBadgeClass(
                    output.exitCode === 0 ? "success" : "error"
                  )}
                >
                  {t("bashExecution.exitCode", { code: output.exitCode })}
                </span>
              ) : null
          }}
          inputContent={commandLine}
          approvalContent={commandLine}
          outputContent={output ? <ToolCallBashExecResults input={input} result={output} /> : null}
          errorContent={<ToolCallOutputError input={input} errorText={part.errorText} />}
          deniedContent={<ToolCallOutputDenied input={input} message={part.errorText} />}
        />
      )
    }

    if (
      part.type === "tool-agentSessionStart" ||
      part.type === "tool-agentSessionRead" ||
      part.type === "tool-agentSessionSend" ||
      part.type === "tool-agentSessionStop"
    ) {
      const input = part.input as AgentSessionInput | undefined
      const output = part.state === "output-available" ? (part.output as AgentSessionOutput) : null
      const inputText = formatAgentSessionInput(toolName, input)

      return (
        <ToolCallFrame
          part={part}
          toolName={toolName}
          onToolApprovalResponse={onToolApprovalResponse}
          duration={duration}
          triggerProps={{
            icon: <BotIcon className="size-3.5 transition-colors" />,
            getToolMessage: (agentToolName, state) => {
              const displayName = t(`names.${agentToolName}`, { defaultValue: agentToolName })
              return FINAL_TOOL_STATES.has(state) ? (
                displayName
              ) : (
                <Shimmer duration={1}>{displayName}</Shimmer>
              )
            },
            trailingContent:
              output?.status !== undefined ? (
                <span className={getAgentSessionStatusClassName(output.status)}>
                  {t(`agentSession.status.${output.status}`)}
                </span>
              ) : null
          }}
          inputContent={<ToolCallCopyablePre displayText={inputText} />}
          approvalContent={<ToolCallCopyablePre displayText={inputText} />}
          outputContent={
            output ? (
              <Terminal
                className="max-w-full"
                isStreaming={output.status === "running"}
                output={formatAgentSessionTranscript(input, output, {
                  session: t("agentSession.session"),
                  status: t("agentSession.statusLabel"),
                  exit: code => t("agentSession.exitCode", { code }),
                  nextOffset: nextOffset => t("agentSession.nextOffset", { nextOffset })
                })}
              />
            ) : null
          }
          errorContent={<ToolCallOutputError errorText={part.errorText} />}
          deniedContent={<ToolCallOutputDenied message={part.errorText} />}
        />
      )
    }

    if (part.type === "tool-read") {
      const input = part.input as ReadToolInput
      const output = part.state === "output-available" ? (part.output as ReadToolOutput) : null
      const inputFilePath = input?.filePath || t("read.emptyFile")
      const outputFilePath = output?.filePath || t("read.emptyFile")
      const skillContext = output?.displayContext?.kind === "skill" ? output.displayContext : null
      const copyableInput = (
        <ToolCallCopyablePre
          displayText={inputFilePath}
          leadingContent={<LibraryBigIcon className="mt-0.5 size-3" />}
        />
      )

      return (
        <ToolCallFrame
          part={part}
          toolName={toolName}
          onToolApprovalResponse={onToolApprovalResponse}
          duration={duration}
          triggerProps={{
            children: skillContext ? (
              <ToolCallSkillBadge
                skillContext={skillContext}
                skillLabel={t("skillRead.badge")}
                fileKindLabel={t(`skillRead.fileKinds.${skillContext.fileKind}`)}
              />
            ) : undefined
          }}
          inputContent={copyableInput}
          approvalContent={copyableInput}
          outputContent={
            output ? (
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
            ) : null
          }
        />
      )
    }

    const input = formatStructuredValue(part.input)
    const output = formatStructuredValue(part.state === "output-available" ? part.output : null)

    return (
      <ToolCallFrame
        part={part}
        toolName={toolName}
        onToolApprovalResponse={onToolApprovalResponse}
        duration={duration}
        inputContent={input ?? toolName}
        approvalContent={<ToolCallStructuredBlock value={part.input} />}
        outputContent={output ? <ToolCallStructuredBlock value={output} /> : null}
      />
    )
  }
)

export type ToolCallsSummaryData = {
  toolNames: string[]
  skillNames: string[]
}

const TOOL_CALLS_SUMMARY_BADGE_STYLES = {
  tools: "text-brand/90 hover:text-brand/90",
  skills: "text-brand/90 hover:text-brand/90"
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
  <HoverCard closeDelay={100} openDelay={100}>
    <HoverCardTrigger asChild>
      <Button
        aria-label={label}
        className={cn(
          "h-6 text-xs font-medium whitespace-nowrap px-1 has-[>svg]:px-1.5",
          TOOL_CALLS_SUMMARY_BADGE_STYLES[badgeType]
        )}
        data-summary-badge={badgeType}
        size="sm"
        type="button"
        variant="ghost"
      >
        {icon}
        <span>{label}</span>
      </Button>
    </HoverCardTrigger>
    <HoverCardContent
      side="top"
      align="start"
      className="w-auto p-3"
      data-summary-tooltip={badgeType}
      sideOffset={8}
    >
      <div className="space-y-3">
        <p className="text-xs font-medium">{label}</p>
        <div className="space-y-2">
          <Separator />
          <div className="space-y-1.5">
            {names.map(name => (
              <p
                className="text-xs leading-relaxed text-muted-foreground"
                key={`${badgeType}-${name}`}
              >
                {name}
              </p>
            ))}
          </div>
        </div>
      </div>
    </HoverCardContent>
  </HoverCard>
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
        className={cn("flex w-full flex-wrap items-center gap-1.5 text-xs", className)}
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
ToolCallTimelineItem.displayName = "ToolCallTimelineItem"
ToolCallsSummary.displayName = "ToolCallsSummary"
