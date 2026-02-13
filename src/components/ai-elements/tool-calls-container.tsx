import { useControllableState } from "@radix-ui/react-use-controllable-state"
import type { ChatAddToolApproveResponseFunction, DynamicToolUIPart, ToolUIPart } from "ai"
import { ChevronRightIcon, TerminalIcon, WrenchIcon } from "lucide-react"
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
  ToolCallInputStreaming,
  ToolCallOutputDenied,
  ToolCallOutputError,
  ToolCallTrigger,
  ToolCallWebSearchResults
} from "@/components/ai-elements/tool-call"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

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

const defaultGetToolsMessage = (toolCount: number) => {
  const { t } = useTranslation("tools")
  return <span>{t("usedTools", { count: toolCount })}</span>
}

export const ToolCallsContainerTrigger = memo(
  ({
    className,
    children,
    toolNames = [],
    totalDuration,
    getToolsMessage = defaultGetToolsMessage,
    ...props
  }: ToolCallsContainerTriggerProps) => {
    const { isOpen, toolCount } = useToolCallsContainer()

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            <WrenchIcon className="size-4" />
            {getToolsMessage(toolCount)}
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
  onToolDurationChange?: (toolCallId: string, duration: number) => void
}

const ToolCallWebSearch = ({
  part,
  onToolApprovalResponse,
  duration,
  onDurationChange
}: {
  part: ToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
  duration?: number
  onDurationChange?: (duration: number) => void
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
      onToolDurationChange={onDurationChange}
      resultCount={output?.totalResults}
      defaultOpen={part.state === "input-streaming"}
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
  duration,
  onDurationChange
}: {
  part: ToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
  duration?: number
  onDurationChange?: (duration: number) => void
}) => {
  const toolCallId = part.toolCallId
  const input = part.input as BashExecInput
  const output = part.state === "output-available" ? (part.output as BashExecResult) : null

  const approvalId = part.approval?.id

  return (
    <ToolCall
      key={toolCallId}
      toolName="bashExecution"
      state={part.state}
      duration={duration}
      onToolDurationChange={onDurationChange}
      defaultOpen={part.state === "input-streaming"}
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
              Exit: {output.exitCode}
            </span>
          ) : null
        }
      />
      <ToolCallContent>
        {(part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-responded") && (
          <ToolCallInputStreaming description={<BashExecCommandLine input={input} />} />
        )}
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

export const ToolCallsList = memo(
  ({
    toolParts,
    onToolApprovalResponse,
    toolDurations,
    onToolDurationChange
  }: ToolCallsListProps) => (
    <ToolCallsContainerContent>
      {toolParts.map(part => {
        const duration = toolDurations?.[part.toolCallId]
        const handleDurationChange = (nextDuration: number) => {
          onToolDurationChange?.(part.toolCallId, nextDuration)
        }

        if (part.type === "tool-webSearch") {
          return (
            <ToolCallWebSearch
              key={part.toolCallId}
              part={part}
              duration={duration}
              onDurationChange={handleDurationChange}
              onToolApprovalResponse={onToolApprovalResponse}
            />
          )
        }

        if (part.type === "tool-bashExecution") {
          return (
            <ToolCallBashExec
              key={part.toolCallId}
              part={part}
              duration={duration}
              onDurationChange={handleDurationChange}
              onToolApprovalResponse={onToolApprovalResponse}
            />
          )
        }

        return null
      })}
    </ToolCallsContainerContent>
  )
)

ToolCallsContainer.displayName = "ToolCallsContainer"
ToolCallsContainerTrigger.displayName = "ToolCallsContainerTrigger"
ToolCallsContainerContent.displayName = "ToolCallsContainerContent"
ToolCallsList.displayName = "ToolCallsList"
