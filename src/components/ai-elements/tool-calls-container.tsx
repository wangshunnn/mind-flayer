import { useControllableState } from "@radix-ui/react-use-controllable-state"
import type { ChatAddToolApproveResponseFunction, DynamicToolUIPart, ToolUIPart } from "ai"
import { ChevronRightIcon, TerminalIcon, WrenchIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext } from "react"
import { useTranslation } from "react-i18next"
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
  type BashExecResult,
  ToolCall,
  ToolCallApprovalRequested,
  ToolCallBashExecResults,
  ToolCallContent,
  ToolCallInputStreaming,
  ToolCallOutputDenied,
  ToolCallOutputError,
  ToolCallTrigger,
  ToolCallWebSearchResults,
  useToolCall
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
}

const ToolCallWebSearch = ({
  part,
  onToolApprovalResponse
}: {
  part: ToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
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
      resultCount={output?.totalResults}
      defaultOpen
    >
      <ToolCallTrigger />
      <ToolCallContent>
        {(part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-responded") && (
          <ToolCallInputStreaming message={input?.objective} />
        )}
        {part.state === "approval-requested" && approvalId && (
          <ToolCallApprovalRequested
            description={<span>{input?.objective ?? ""}</span>}
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
  onToolApprovalResponse
}: {
  part: ToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
}) => {
  const toolCallId = part.toolCallId
  const input = part.input as {
    command: string
    args: string[]
  }
  const output = part.state === "output-available" ? (part.output as BashExecResult) : null

  const approvalId = part.approval?.id

  return (
    <ToolCall
      key={toolCallId}
      toolName="bashExecution"
      state={part.state}
      resultCount={output?.exitCode === 0 ? 1 : 0}
      defaultOpen
    >
      <BashExecTrigger exitCode={output?.exitCode} />
      <ToolCallContent>
        {(part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-responded") && (
          <ToolCallInputStreaming
            message={`${input?.command || ""} ${input?.args?.join(" ") || ""}`.trim()}
          />
        )}
        {part.state === "approval-requested" && approvalId && (
          <ToolCallApprovalRequested
            description={
              <code className="text-xs font-mono">
                {input?.command || ""} {input?.args?.join(" ") || ""}
              </code>
            }
            onApprove={() => onToolApprovalResponse({ id: approvalId, approved: true })}
            onDeny={() => onToolApprovalResponse({ id: approvalId, approved: false })}
          />
        )}
        {part.state === "output-available" && output && <ToolCallBashExecResults result={output} />}
        {part.state === "output-error" && <ToolCallOutputError errorText={part.errorText} />}
        {part.state === "output-denied" && <ToolCallOutputDenied message={part.errorText} />}
      </ToolCallContent>
    </ToolCall>
  )
}

const BashExecTrigger = ({ exitCode }: { exitCode?: number }) => {
  const { isOpen, state } = useToolCall()
  const { t } = useTranslation(["tools", "common"])
  const displayName = t("tools:names.bashExecution", { defaultValue: "bashExecution" })
  const isCompleted = ["output-available", "output-error", "output-denied"].includes(state)
  const isSuccess = exitCode === 0 && state === "output-available"

  const getMessage = () => {
    if (!isCompleted) {
      return <Shimmer duration={1}>{displayName}</Shimmer>
    }
    if (state === "output-error") {
      return (
        <div>
          {displayName}
          <span className="inline-flex items-center rounded-md ml-2 px-2 py-0.5 text-xs min-w-max bg-red-500/10 text-red-600 dark:text-red-400">
            {t("tools:states.failed").toLowerCase()}
          </span>
        </div>
      )
    }
    if (state === "output-denied") {
      return (
        <span>
          {displayName}{" "}
          <span className="inline-flex items-center rounded-md ml-2 px-2 py-0.5 text-xs min-w-max bg-red-500/10 text-red-600 dark:text-red-400">
            {t("tools:states.cancelled").toLowerCase()}
          </span>
        </span>
      )
    }
    return <span>{displayName}</span>
  }

  return (
    <ToolCallTrigger>
      <TerminalIcon className="size-3.5 transition-colors" />
      {getMessage()}
      {state === "output-available" && exitCode !== undefined && (
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs min-w-max",
            isSuccess
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
          )}
        >
          Exit: {exitCode}
        </span>
      )}
      <ChevronRightIcon
        className={cn(
          "size-3.5 transition-transform opacity-50 ml-auto",
          isOpen ? "rotate-90" : "rotate-0"
        )}
      />
    </ToolCallTrigger>
  )
}

export const ToolCallsList = memo(({ toolParts, onToolApprovalResponse }: ToolCallsListProps) => (
  <ToolCallsContainerContent>
    {toolParts.map(part => {
      if (part.type === "tool-webSearch") {
        return (
          <ToolCallWebSearch
            key={part.toolCallId}
            part={part}
            onToolApprovalResponse={onToolApprovalResponse}
          />
        )
      }

      if (part.type === "tool-bashExecution") {
        return (
          <ToolCallBashExec
            key={part.toolCallId}
            part={part}
            onToolApprovalResponse={onToolApprovalResponse}
          />
        )
      }

      return null
    })}
  </ToolCallsContainerContent>
))

ToolCallsContainer.displayName = "ToolCallsContainer"
ToolCallsContainerTrigger.displayName = "ToolCallsContainerTrigger"
ToolCallsContainerContent.displayName = "ToolCallsContainerContent"
ToolCallsList.displayName = "ToolCallsList"
