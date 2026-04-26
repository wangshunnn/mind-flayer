import {
  type ChatAddToolApproveResponseFunction,
  type DynamicToolUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type ReasoningUIPart,
  type ToolUIPart,
  type UIMessage
} from "ai"
import { BrainIcon, ChevronRightIcon, TimerIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { ReasoningPartContent } from "@/components/ai-elements/thinking-process"
import { formatToolCallDuration } from "@/components/ai-elements/tool-call"
import { ToolCallTimelineItem } from "@/components/ai-elements/tool-calls-container"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useThinkingConstants } from "@/lib/constants"
import { cn } from "@/lib/utils"

export type AssistantActivityPart = (ReasoningUIPart | ToolUIPart | DynamicToolUIPart) & {
  partIndex: number
}

export type AssistantMessageSegment =
  | {
      type: "text"
      text: string
      startPartIndex: number
    }
  | {
      type: "activity"
      parts: AssistantActivityPart[]
      startPartIndex: number
    }

export type AssistantActivityTimelineProps = ComponentProps<"div"> & {
  parts: AssistantActivityPart[]
  thinkingDuration?: number
  reasoningDurations?: Record<string, number>
  fallbackThinkingDurationPartIndex?: number
  toolDurations?: Record<string, number>
  onToolApprovalResponse: ChatAddToolApproveResponseFunction
}

const PREVIEW_LENGTH = 96

function getReasoningPreview(text: string): string {
  const normalizedText = text.replace(/\s+/g, " ").trim()
  if (!normalizedText) {
    return ""
  }

  const characters = Array.from(normalizedText)
  if (characters.length <= PREVIEW_LENGTH) {
    return normalizedText
  }

  return `${characters.slice(0, PREVIEW_LENGTH).join("")}...`
}

export function buildAssistantMessageSegments(
  parts: UIMessage["parts"]
): AssistantMessageSegment[] {
  const segments: AssistantMessageSegment[] = []
  let textParts: string[] = []
  let textStartPartIndex = -1
  let activityParts: AssistantActivityPart[] = []

  const flushText = () => {
    if (textParts.length === 0) {
      return
    }

    const text = textParts.join("")
    if (text.length > 0) {
      segments.push({
        type: "text",
        text,
        startPartIndex: textStartPartIndex
      })
    }

    textParts = []
    textStartPartIndex = -1
  }

  const flushActivity = () => {
    if (activityParts.length === 0) {
      return
    }

    segments.push({
      type: "activity",
      parts: activityParts,
      startPartIndex: activityParts[0].partIndex
    })
    activityParts = []
  }

  parts.forEach((part, partIndex) => {
    if (isTextUIPart(part)) {
      flushActivity()
      if (textStartPartIndex === -1) {
        textStartPartIndex = partIndex
      }
      textParts.push(part.text)
      return
    }

    if (isReasoningUIPart(part) || isToolUIPart(part)) {
      flushText()
      activityParts.push({ ...part, partIndex })
      return
    }
  })

  flushText()
  flushActivity()

  return segments
}

type ReasoningActivityRowProps = {
  part: ReasoningUIPart & { partIndex: number }
  duration?: number
}

const ReasoningActivityRow = memo(({ part, duration }: ReasoningActivityRowProps) => {
  const { t } = useTranslation("chat")
  const { thinking } = useThinkingConstants()
  const [isOpen, setIsOpen] = useState(false)
  const content = part.text ?? ""
  const preview = getReasoningPreview(content)
  const hasDetails = content.trim().length > 0
  const durationLabel = duration !== undefined ? formatToolCallDuration(duration) : null

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen)
  }

  const labelText = part.state === "streaming" ? thinking : t("message.reasoning")
  let label: ReactNode = labelText

  if (part.state === "streaming") {
    label = <Shimmer duration={1}>{thinking}</Shimmer>
  }

  return (
    <Collapsible
      className="not-prose rounded-md text-muted-foreground"
      onOpenChange={handleOpenChange}
      open={isOpen}
    >
      <CollapsibleTrigger
        aria-label={`${isOpen ? t("activity.collapse") : t("activity.expand")}: ${labelText}${
          durationLabel ? `, ${durationLabel}` : ""
        }`}
        className={cn(
          "group/activity-row flex min-h-7 w-full items-center gap-2 rounded-md pl-0 pr-1 py-1",
          "text-muted-foreground text-xs transition-colors",
          "hover:bg-muted/40 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        )}
        disabled={!hasDetails}
      >
        <BrainIcon className="size-3 shrink-0 transition-colors" />
        <span className="shrink-0">{label}</span>
        {preview ? (
          <span
            className="min-w-0 max-w-72 truncate text-muted-foreground/70 sm:max-w-80 md:max-w-96"
            data-reasoning-preview="true"
          >
            {preview}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {durationLabel ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/90"
              data-activity-duration="true"
            >
              <TimerIcon className="size-3" />
              {durationLabel}
            </span>
          ) : null}
          <ChevronRightIcon
            className={cn(
              "size-3.5 transition-all",
              isOpen
                ? "rotate-90 opacity-70"
                : "rotate-0 opacity-0 group-hover/activity-row:opacity-60 group-focus-visible/activity-row:opacity-70"
            )}
            data-activity-chevron="true"
          />
        </div>
      </CollapsibleTrigger>
      {hasDetails ? (
        <CollapsibleContent
          className={cn(
            "relative mt-1 rounded-md bg-muted/70 px-2 py-2 text-xs leading-normal",
            "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
            "text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
          )}
        >
          <ReasoningPartContent className="pr-0">{content}</ReasoningPartContent>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
})

export const AssistantActivityTimeline = memo(
  ({
    className,
    parts,
    thinkingDuration,
    reasoningDurations,
    fallbackThinkingDurationPartIndex,
    toolDurations,
    onToolApprovalResponse,
    ...props
  }: AssistantActivityTimelineProps) => {
    if (parts.length === 0) {
      return null
    }

    const fallbackReasoningPartIndex =
      fallbackThinkingDurationPartIndex ?? parts.find(isReasoningUIPart)?.partIndex

    return (
      <div className={cn("not-prose mb-1 space-y-0.5", className)} {...props}>
        {parts.map(part => {
          if (isToolUIPart(part)) {
            return (
              <ToolCallTimelineItem
                duration={toolDurations?.[part.toolCallId]}
                key={`${part.type}-${part.toolCallId}-${part.partIndex}`}
                onToolApprovalResponse={onToolApprovalResponse}
                part={part}
              />
            )
          }

          if (isReasoningUIPart(part)) {
            return (
              <ReasoningActivityRow
                duration={
                  reasoningDurations?.[String(part.partIndex)] ??
                  (part.state !== "streaming" && part.partIndex === fallbackReasoningPartIndex
                    ? thinkingDuration
                    : undefined)
                }
                key={`${part.type}-${part.partIndex}`}
                part={part}
              />
            )
          }

          return null
        })}
      </div>
    )
  }
)

ReasoningActivityRow.displayName = "ReasoningActivityRow"
AssistantActivityTimeline.displayName = "AssistantActivityTimeline"
