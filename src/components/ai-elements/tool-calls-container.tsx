import { useControllableState } from "@radix-ui/react-use-controllable-state"
import { ChevronRightIcon, WrenchIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
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
    defaultOpen = false,
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
  getToolsMessage?: (
    toolCount: number,
    toolNames: string[],
    isAnyToolInProgress: boolean,
    totalDuration?: number
  ) => ReactNode
}

const defaultGetToolsMessage = (
  toolCount: number,
  toolNames: string[],
  isAnyToolInProgress: boolean,
  totalDuration?: number
) => {
  const toolsText = toolCount === 1 ? "1 tool" : `${toolCount} tools`
  const namesText = toolNames.join(", ")
  const durationText = totalDuration ? ` · ${totalDuration}s` : ""

  if (isAnyToolInProgress) {
    return <Shimmer duration={1}>{`Using ${toolsText} · ${namesText}`}</Shimmer>
  }

  return (
    <span>
      Used {toolsText} · {namesText}
      {durationText}
    </span>
  )
}

export const ToolCallsContainerTrigger = memo(
  ({
    className,
    children,
    toolNames = [],
    isAnyToolInProgress = false,
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
            {getToolsMessage(toolCount, toolNames, isAnyToolInProgress, totalDuration)}
            <ChevronRightIcon
              className={cn("size-4 transition-transform", isOpen ? "rotate-90" : "rotate-0")}
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

ToolCallsContainer.displayName = "ToolCallsContainer"
ToolCallsContainerTrigger.displayName = "ToolCallsContainerTrigger"
ToolCallsContainerContent.displayName = "ToolCallsContainerContent"
