import { useControllableState } from "@radix-ui/react-use-controllable-state"
import {
  type DynamicToolUIPart,
  getToolName,
  isReasoningUIPart,
  isToolUIPart,
  type ReasoningUIPart,
  type ToolUIPart
} from "ai"
import {
  BrainIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleIcon,
  CircleXIcon,
  GlobeIcon,
  Loader2Icon,
  WrenchIcon
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useContext, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Streamdown } from "streamdown"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useThinkingConstants, useToolConstants } from "@/lib/constants"
import { cn } from "@/lib/utils"
import {
  getToolInputMeta,
  getToolResultText,
  isToolUIPartInProgress,
  isWebSearchToolUIPart
} from "~/src/lib/tool-helpers"

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

const DefaultThinkingMessage = ({
  isStreaming,
  totalDuration
}: {
  isStreaming: boolean
  totalDuration?: number
}) => {
  const { thinking, thoughtForSeconds, thoughtForFewSeconds } = useThinkingConstants()

  if (isStreaming || totalDuration === 0) {
    return <Shimmer duration={1}>{thinking}</Shimmer>
  }
  if (totalDuration === undefined) {
    return <p>{thoughtForFewSeconds}</p>
  }
  return <p>{thoughtForSeconds(totalDuration)}</p>
}

export const ThinkingProcessTrigger = memo(
  ({ className, children, getThinkingMessage, ...props }: ThinkingProcessTriggerProps) => {
    const { isStreaming, isOpen, totalDuration } = useThinkingProcess()

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        {children ??
          (getThinkingMessage ? (
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
          ) : (
            <>
              <BrainIcon className="size-4" />
              <DefaultThinkingMessage isStreaming={isStreaming} totalDuration={totalDuration} />
              <ChevronRightIcon
                className={cn(
                  "size-3.5 transition-transform opacity-50",
                  isOpen ? "rotate-90" : "rotate-0"
                )}
              />
            </>
          ))}
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

export type ReasoningPartProps = ComponentProps<"div"> & {
  partSource: ReasoningUIPart | ToolUIPart | DynamicToolUIPart
  /** isChatStreaming indicates if the message is still streaming, not been manually stopped */
  isChatStreaming: boolean
}

export const ReasoningPart = memo(
  ({
    className,
    partSource: part,
    isChatStreaming = false,
    children,
    ...props
  }: ReasoningPartProps) => {
    return (
      <div className={cn("relative my-0", className)} {...props}>
        <ReasoningPartHeader partSource={part} isChatStreaming={isChatStreaming} />
        <div
          className={cn(
            "relative pl-6 py-1",
            "before:absolute before:left-1.5 before:top-0 before:h-full before:w-0.5 before:rounded-full",
            "before:bg-muted-foreground/20"
          )}
        >
          {isToolUIPart(part) ? (
            <ReasoningPartToolContent part={part} isChatStreaming={isChatStreaming} />
          ) : (
            <ReasoningPartContent>{part.text || ""}</ReasoningPartContent>
          )}
        </div>
      </div>
    )
  }
)

const ReasoningPartToolContent = memo(
  ({
    part,
    isChatStreaming = false
  }: {
    part: ToolUIPart | DynamicToolUIPart
    isChatStreaming?: boolean
  }) => {
    const { toolRunning, toolDone } = useThinkingConstants()
    // Determine if tool is in progress
    const isToolInProgress = isChatStreaming && isToolUIPart(part) && isToolUIPartInProgress(part)
    const toolConstants = useToolConstants()
    const toolInputMeta = getToolInputMeta(part)
    const toolResult = getToolResultText(part, toolConstants)

    return (
      <div className="text-muted-foreground text-xs">
        <div className="mb-2.5 text-sm">{toolInputMeta?.content || ""}</div>
        {isToolInProgress ? (
          <div className="flex items-center gap-1.5">
            <Loader2Icon className="size-3 animate-spin" />
            <span>{toolResult || toolRunning}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {part.state === "output-available" && <CircleCheckIcon className="size-3" />}
            {part.state === "output-error" && <CircleXIcon className="size-3" />}
            <span>{toolResult || toolDone}</span>
          </div>
        )}
      </div>
    )
  }
)

export const ReasoningPartHeader = memo(
  ({ className, partSource: part, isChatStreaming = false, ...props }: ReasoningPartProps) => {
    const { names } = useToolConstants()
    const { t } = useTranslation("chat")
    const isWebSearchTool = isToolUIPart(part) && isWebSearchToolUIPart(part)

    const getIcon = () => {
      if (isWebSearchTool) {
        return <GlobeIcon className="ml-px size-3" />
      }
      if (isToolUIPart(part)) {
        return <WrenchIcon className="ml-px size-3" />
      }
      return <CircleIcon className="ml-1 size-1.5 text-muted-foreground/80 fill-current" />
    }

    const getLabel = () => {
      if (isReasoningUIPart(part)) {
        return t("message.reasoning")
      }
      if (isWebSearchTool) {
        return names.webSearch
      }
      if (isToolUIPart(part)) {
        return getToolName(part) || t("message.usingTool")
      }
      return t("message.usingTool")
    }

    const isStreaming =
      isChatStreaming &&
      ((isReasoningUIPart(part) && part.state === "streaming") ||
        (isToolUIPart(part) && isToolUIPartInProgress(part)))

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
        {isStreaming ? <Shimmer duration={1}>{getLabel()}</Shimmer> : <span>{getLabel()}</span>}
      </div>
    )
  }
)

export type ReasoningPartContentProps = ComponentProps<"div"> & {
  children: string
}

export const ReasoningPartContent = memo(
  ({ className, children, ...props }: ReasoningPartContentProps) => (
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
  ({ className, stepCount, ...props }: ThinkingProcessCompletionProps) => {
    const { done } = useThinkingConstants()
    const { t } = useTranslation("chat")

    return (
      <div className={cn("relative my-0", className)} {...props}>
        <div
          className={cn("flex items-center gap-2 text-xs text-muted-foreground", "relative my-2")}
        >
          <CircleCheckIcon className="ml-px size-3" />
          <span>{stepCount ? t("message.doneInSteps", { count: stepCount }) : done}</span>
        </div>
      </div>
    )
  }
)

ThinkingProcess.displayName = "ThinkingProcess"
ThinkingProcessTrigger.displayName = "ThinkingProcessTrigger"
ThinkingProcessContent.displayName = "ThinkingProcessContent"
ReasoningPart.displayName = "ReasoningPart"
ReasoningPartHeader.displayName = "ReasoningPartHeader"
ReasoningPartContent.displayName = "ReasoningPartContent"
ThinkingProcessCompletion.displayName = "ThinkingProcessCompletion"
