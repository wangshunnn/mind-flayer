import { useControllableState } from "@radix-ui/react-use-controllable-state"
import type { ChatAddToolApproveResponseFunction, ToolUIPart } from "ai"
import { ChevronRightIcon, WrenchIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext } from "react"
import { useTranslation } from "react-i18next"
import {
  ToolCall,
  ToolCallApprovalRequested,
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
          "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
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
        "relative mt-4 text-sm leading-normal",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
        "outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      {...props}
    >
      <div className="overflow-y-auto pr-2" style={{ maxHeight }}>
        <div className="space-y-3">{children}</div>
      </div>
    </CollapsibleContent>
  )
)

export type ToolCallsListProps = {
  toolParts: ToolUIPart[]
  onToolApprovalResponse: ChatAddToolApproveResponseFunction
}

const ToolCallWebSearch = ({
  part,
  onToolApprovalResponse
}: {
  part: ToolUIPart
  onToolApprovalResponse: ToolCallsListProps["onToolApprovalResponse"]
}) => {
  const callId = part.toolCallId
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
      key={callId}
      toolName="webSearch"
      state={part.state}
      resultCount={output?.totalResults}
    >
      <ToolCallTrigger />
      <ToolCallContent>
        {(part.state === "input-streaming" || part.state === "input-available") && (
          <ToolCallInputStreaming message={input?.objective} />
        )}
        {part.state === "approval-requested" && approvalId && (
          <ToolCallApprovalRequested
            description={
              <>
                The AI wants to search the web for: <strong>"{input?.objective ?? ""}"</strong>
              </>
            }
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
      return null
    })}
  </ToolCallsContainerContent>
))

ToolCallsContainer.displayName = "ToolCallsContainer"
ToolCallsContainerTrigger.displayName = "ToolCallsContainerTrigger"
ToolCallsContainerContent.displayName = "ToolCallsContainerContent"
ToolCallsList.displayName = "ToolCallsList"
