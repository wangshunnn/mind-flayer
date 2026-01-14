import { useControllableState } from "@radix-ui/react-use-controllable-state"
import type { ToolUIPart } from "ai"
import {
  BrainIcon,
  CheckCircle2,
  CheckIcon,
  ChevronRightIcon,
  CircleIcon,
  CircleXIcon,
  GlobeIcon,
  Loader2Icon,
  WrenchIcon
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext, useEffect, useRef, useState } from "react"
import { Streamdown } from "streamdown"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { TEXT_UTILS, THINKING_CONSTANTS } from "@/lib/constants"
import { cn } from "@/lib/utils"

type ThinkingProcessContextValue = {
  isStreaming: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  totalDuration: number | undefined
}

const ThinkingProcessContext = createContext<ThinkingProcessContextValue | null>(null)

export const useThinkingProcess = () => {
  const context = useContext(ThinkingProcessContext)
  if (!context) {
    throw new Error("ThinkingProcess components must be used within ThinkingProcess")
  }
  return context
}

export type ThinkingProcessProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  totalDuration?: number
  onTotalDurationChange?: (duration: number) => void
}

const AUTO_CLOSE_DELAY = 1000

export const ThinkingProcess = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = true,
    onOpenChange,
    totalDuration: totalDurationProp,
    onTotalDurationChange,
    children,
    ...props
  }: ThinkingProcessProps) => {
    // Store the initial defaultOpen value to determine if this component should auto-close
    const initialDefaultOpen = useRef(defaultOpen)

    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange
    })

    // For totalDuration, use state directly since we need to track both prop and internal state
    const [internalDuration, setInternalDuration] = useState<number | undefined>(totalDurationProp)

    // Use prop if provided, otherwise use internal state
    const totalDuration = totalDurationProp !== undefined ? totalDurationProp : internalDuration

    const [hasAutoClosed, setHasAutoClosed] = useState(false)
    const [startTime, setStartTime] = useState<number | null>(null)

    // Track total duration when streaming starts and ends
    useEffect(() => {
      if (isStreaming) {
        if (startTime === null) {
          setStartTime(Date.now())
        }
      } else if (startTime !== null) {
        const durationMs = Date.now() - startTime
        const durationS = Math.round((durationMs / 1000) * 10) / 10
        setInternalDuration(durationS)
        onTotalDurationChange?.(durationS)
        setStartTime(null)
      }
    }, [isStreaming, startTime, onTotalDurationChange])

    // Auto-close when streaming ends (only if it was initially set to defaultOpen=true)
    useEffect(() => {
      if (initialDefaultOpen.current && !isStreaming && isOpen && !hasAutoClosed) {
        // Add a small delay before closing to allow user to see the content
        const timer = setTimeout(() => {
          setIsOpen(false)
          setHasAutoClosed(true)
        }, AUTO_CLOSE_DELAY)

        return () => clearTimeout(timer)
      }
    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed])

    const handleOpenChange = (newOpen: boolean) => {
      setIsOpen(newOpen)
    }

    return (
      <ThinkingProcessContext.Provider value={{ isStreaming, isOpen, setIsOpen, totalDuration }}>
        <Collapsible
          className={cn("not-prose mb-1", className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ThinkingProcessContext.Provider>
    )
  }
)

export type ThinkingProcessTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, totalDuration?: number) => ReactNode
}

const defaultGetThinkingMessage = (isStreaming: boolean, totalDuration?: number) => {
  if (isStreaming || totalDuration === 0) {
    return <Shimmer duration={1}>{THINKING_CONSTANTS.thinking}</Shimmer>
  }
  if (totalDuration === undefined) {
    return <p>{THINKING_CONSTANTS.thoughtForFewSeconds}</p>
  }
  return <p>{THINKING_CONSTANTS.thoughtForSeconds(totalDuration)}</p>
}

export const ThinkingProcessTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ThinkingProcessTriggerProps) => {
    const { isStreaming, isOpen, totalDuration } = useThinkingProcess()

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
            <BrainIcon className="size-4" />
            {getThinkingMessage(isStreaming, totalDuration)}
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

export type ThinkingProcessContentProps = ComponentProps<typeof CollapsibleContent>

export const ThinkingProcessContent = memo(
  ({ className, children, ...props }: ThinkingProcessContentProps) => (
    <CollapsibleContent
      className={cn(
        "relative mt-4 text-sm leading-normal",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
        "outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      {...props}
    >
      <div className="space-y-3">{children}</div>
    </CollapsibleContent>
  )
)

// Reasoning segment component for individual reasoning blocks

export type ReasoningSegmentProps = ComponentProps<"div"> & {
  isStreaming?: boolean
  segmentType?: "reasoning" | "tool-webSearch" | "tool-other"
  toolName?: string
  toolResult?: string
  toolState?: ToolUIPart["state"]
  toolDescription?: string
}

export const ReasoningSegment = memo(
  ({
    className,
    isStreaming = false,
    segmentType = "reasoning",
    toolName,
    toolResult,
    toolState,
    toolDescription,
    children,
    ...props
  }: ReasoningSegmentProps) => {
    // Determine if tool is in progress
    const isToolInProgress = Boolean(
      toolState &&
        ["input-streaming", "input-available", "approval-requested", "approval-responded"].includes(
          toolState
        )
    )

    return (
      <div className={cn("relative my-0", className)} {...props}>
        <ReasoningSegmentHeader
          segmentType={segmentType}
          toolName={toolName}
          isToolInProgress={isToolInProgress}
        />
        <div
          className={cn(
            "relative pl-6 py-1",
            "before:absolute before:left-1.5 before:top-0 before:h-full before:w-0.5 before:rounded-full",
            "before:bg-muted-foreground/20"
          )}
        >
          {segmentType.startsWith("tool-") ? (
            <div className="text-muted-foreground text-sm">
              <div className="mb-1">{toolDescription}</div>
              {isToolInProgress ? (
                <div className="flex items-center gap-1.5">
                  <Loader2Icon className="size-3 animate-spin" />
                  <span>{toolResult || THINKING_CONSTANTS.toolWorking}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  {toolState === "output-available" && <CheckIcon className="size-3" />}
                  {toolState === "output-error" && <CircleXIcon className="size-3" />}
                  <span>{toolResult || THINKING_CONSTANTS.toolDone}</span>
                </div>
              )}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    )
  }
)

export type ReasoningSegmentHeaderProps = ComponentProps<"div"> & {
  segmentType?: "reasoning" | "tool-webSearch" | "tool-other"
  toolName?: string
  isToolInProgress?: boolean
}

export const ReasoningSegmentHeader = memo(
  ({
    className,
    children,
    segmentType = "reasoning",
    toolName,
    isToolInProgress = false,
    ...props
  }: ReasoningSegmentHeaderProps) => {
    const getIcon = () => {
      if (segmentType === "tool-webSearch") {
        return <GlobeIcon className="ml-px size-3" />
      }
      if (segmentType === "tool-other") {
        return <WrenchIcon className="ml-px size-3" />
      }
      return <CircleIcon className="ml-1 size-1.5 text-muted-foreground/80 fill-current" />
    }

    const getLabel = () => {
      if (segmentType === "tool-webSearch") {
        return toolName
          ? TEXT_UTILS.getToolDisplayName(toolName)
          : TEXT_UTILS.getToolDisplayName("webSearch")
      }
      if (segmentType === "tool-other") {
        return toolName || "Tool"
      }
      return "Reasoning"
    }

    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground",
          "relative my-2",
          className
        )}
        {...props}
      >
        {getIcon()}
        {isToolInProgress ? (
          <Shimmer duration={1}>{getLabel()}</Shimmer>
        ) : (
          <span>{getLabel()}</span>
        )}
        {children}
      </div>
    )
  }
)

export type ReasoningSegmentContentProps = ComponentProps<"div"> & {
  children: string
}

export const ReasoningSegmentContent = memo(
  ({ className, children, ...props }: ReasoningSegmentContentProps) => (
    <div className={cn("text-muted-foreground pr-4 text-sm", className)} {...props}>
      <Streamdown className="streamdown-thinking-process space-y-2.5">{children}</Streamdown>
    </div>
  )
)

// Completion summary component for end of thinking process
export type ThinkingProcessCompletionProps = ComponentProps<"div"> & {
  stepCount: number
}

export const ThinkingProcessCompletion = memo(
  ({ className, stepCount, ...props }: ThinkingProcessCompletionProps) => (
    <div className={cn("relative my-0", className)} {...props}>
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", "relative my-2")}>
        <CheckCircle2 className="ml-px size-3" />
        <span>
          {THINKING_CONSTANTS.done}
          {stepCount && ` in ${stepCount} ${stepCount > 1 ? "steps" : "step"}`}
        </span>
      </div>
    </div>
  )
)

ThinkingProcess.displayName = "ThinkingProcess"
ThinkingProcessTrigger.displayName = "ThinkingProcessTrigger"
ThinkingProcessContent.displayName = "ThinkingProcessContent"
ReasoningSegment.displayName = "ReasoningSegment"
ReasoningSegmentHeader.displayName = "ReasoningSegmentHeader"
ReasoningSegmentContent.displayName = "ReasoningSegmentContent"
ThinkingProcessCompletion.displayName = "ThinkingProcessCompletion"
