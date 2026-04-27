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
import { BrainIcon, ChevronRightIcon, CircleAlertIcon, TimerIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { memo, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ReasoningPartContent } from "@/components/ai-elements/reasoning-content"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { formatToolCallDuration } from "@/components/ai-elements/tool-call"
import { ToolCallTimelineItem } from "@/components/ai-elements/tool-calls-container"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useThinkingConstants } from "@/lib/constants"
import { cn } from "@/lib/utils"

export type AssistantActivityPart = (ReasoningUIPart | ToolUIPart | DynamicToolUIPart) & {
  partIndex: number
}

export type AssistantFallbackPart = UIMessage["parts"][number] & {
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
  | {
      type: "fallback"
      parts: AssistantFallbackPart[]
      startPartIndex: number
    }

export type AssistantActivityTimelineProps = ComponentProps<"div"> & {
  parts: AssistantActivityPart[]
  thinkingDuration?: number
  reasoningDurations?: Record<string, number>
  fallbackThinkingDurationPartIndex?: number
  toolDurations?: Record<string, number>
  defaultOpen?: boolean
  autoOpenWhileActive?: boolean
  onToolApprovalResponse: ChatAddToolApproveResponseFunction
}

const PREVIEW_LENGTH = 96

function getPartType(part: UIMessage["parts"][number]): string {
  const type = (part as { type?: unknown }).type
  return typeof type === "string" && type.length > 0 ? type : "unknown"
}

function warnUnsupportedPart(part: UIMessage["parts"][number], warnedPartTypes: Set<string>) {
  const partType = getPartType(part)
  if (warnedPartTypes.has(partType)) {
    return
  }

  warnedPartTypes.add(partType)
  console.warn(`[AssistantActivity] Unsupported assistant message part type "${partType}"`, part)
}

function isNonRenderablePart(part: UIMessage["parts"][number]): boolean {
  return getPartType(part) === "step-start"
}

function stringifyFallbackValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  if (value == null) {
    return null
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return null
  }
}

function getFallbackPartContent(part: AssistantFallbackPart): string | null {
  const record = part as unknown as Record<string, unknown>
  const title = record.title
  const url = record.url
  const text = stringifyFallbackValue(record.text)

  if (text && text.trim().length > 0) {
    return text
  }

  if (typeof title === "string" && typeof url === "string") {
    return `${title}\n${url}`
  }

  if (typeof url === "string") {
    return url
  }

  const name = record.filename ?? record.name
  if (typeof name === "string") {
    return name
  }

  return stringifyFallbackValue(part)
}

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
  let fallbackParts: AssistantFallbackPart[] = []
  const warnedFallbackPartTypes = new Set<string>()

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

  const flushFallback = () => {
    if (fallbackParts.length === 0) {
      return
    }

    segments.push({
      type: "fallback",
      parts: fallbackParts,
      startPartIndex: fallbackParts[0].partIndex
    })
    fallbackParts = []
  }

  parts.forEach((part, partIndex) => {
    if (isTextUIPart(part)) {
      flushActivity()
      flushFallback()
      if (textStartPartIndex === -1) {
        textStartPartIndex = partIndex
      }
      textParts.push(part.text)
      return
    }

    if (isReasoningUIPart(part) || isToolUIPart(part)) {
      flushText()
      flushFallback()
      activityParts.push({ ...part, partIndex })
      return
    }

    if (isNonRenderablePart(part)) {
      return
    }

    flushText()
    flushActivity()
    warnUnsupportedPart(part, warnedFallbackPartTypes)
    fallbackParts.push({ ...part, partIndex })
  })

  flushText()
  flushActivity()
  flushFallback()

  return segments
}

export type AssistantFallbackPartsProps = ComponentProps<"div"> & {
  parts: AssistantFallbackPart[]
}

export const AssistantFallbackParts = memo(
  ({ className, parts, ...props }: AssistantFallbackPartsProps) => {
    const { t } = useTranslation("chat")

    if (parts.length === 0) {
      return null
    }

    return (
      <div
        className={cn("not-prose mb-1 space-y-1 rounded-md bg-muted/50 px-2 py-1.5", className)}
        data-assistant-fallback-parts="true"
        {...props}
      >
        {parts.map(part => {
          const partType = getPartType(part)
          const content = getFallbackPartContent(part)

          return (
            <div className="flex min-w-0 gap-2" key={`${partType}-${part.partIndex}`}>
              <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/80" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-muted-foreground text-xs">
                  {t("activity.fallbackPart", { type: partType })}
                </div>
                {content ? (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 px-2 py-1 text-[11px] text-muted-foreground/90 leading-normal">
                    {content}
                  </pre>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
)

type ReasoningActivityRowProps = {
  part: ReasoningUIPart & { partIndex: number }
  duration?: number
  defaultOpen?: boolean
  autoOpenWhileActive?: boolean
}

const ReasoningActivityRow = memo(
  ({
    part,
    duration,
    defaultOpen = false,
    autoOpenWhileActive = true
  }: ReasoningActivityRowProps) => {
    const { t } = useTranslation("chat")
    const { thinking } = useThinkingConstants()
    const [isOpen, setIsOpen] = useState(defaultOpen)
    const hasUserToggledRef = useRef(false)
    const autoOpenedWhileActiveRef = useRef(false)
    const wasStreamingRef = useRef(part.state === "streaming")
    const content = part.text ?? ""
    const preview = getReasoningPreview(content)
    const hasDetails = content.trim().length > 0
    const durationLabel = duration !== undefined ? formatToolCallDuration(duration) : null
    const isStreaming = part.state === "streaming"

    useEffect(() => {
      if (!autoOpenWhileActive || hasUserToggledRef.current) {
        wasStreamingRef.current = isStreaming
        return
      }

      if (isStreaming) {
        autoOpenedWhileActiveRef.current = true
        setIsOpen(true)
      } else if (wasStreamingRef.current && autoOpenedWhileActiveRef.current) {
        autoOpenedWhileActiveRef.current = false
        setIsOpen(false)
      }

      wasStreamingRef.current = isStreaming
    }, [autoOpenWhileActive, isStreaming])

    const handleOpenChange = (nextOpen: boolean) => {
      hasUserToggledRef.current = true
      setIsOpen(nextOpen)
    }

    const labelText = isStreaming ? thinking : t("message.reasoning")
    let label: ReactNode = labelText

    if (isStreaming) {
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
            "hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          disabled={!hasDetails}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <BrainIcon className="size-3 shrink-0 transition-colors" />
            <span className="shrink-0">{label}</span>
            {preview ? (
              <span
                className={cn(
                  "min-w-0 max-w-72 truncate text-muted-foreground/70 transition-colors",
                  "group-hover/activity-row:text-foreground",
                  "sm:max-w-80 md:max-w-96"
                )}
                data-reasoning-preview="true"
              >
                {preview}
              </span>
            ) : null}
            <ChevronRightIcon
              className={cn(
                "size-3.5 shrink-0 transition-all",
                isOpen
                  ? "rotate-90 opacity-70"
                  : "rotate-0 opacity-0 group-hover/activity-row:opacity-60 group-focus-visible/activity-row:opacity-70"
              )}
              data-activity-chevron="true"
            />
          </div>
          {durationLabel ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/90"
                data-activity-duration="true"
              >
                <TimerIcon className="size-3" />
                {durationLabel}
              </span>
            </div>
          ) : null}
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
  }
)

export const AssistantActivityTimeline = memo(
  ({
    className,
    parts,
    thinkingDuration,
    reasoningDurations,
    fallbackThinkingDurationPartIndex,
    toolDurations,
    defaultOpen,
    autoOpenWhileActive = true,
    onToolApprovalResponse,
    ...props
  }: AssistantActivityTimelineProps) => {
    if (parts.length === 0) {
      return null
    }

    return (
      <div className={cn("not-prose mb-1 space-y-0.5", className)} {...props}>
        {parts.map(part => {
          if (isToolUIPart(part)) {
            return (
              <ToolCallTimelineItem
                autoOpenWhileActive={autoOpenWhileActive}
                defaultOpen={defaultOpen}
                duration={toolDurations?.[part.toolCallId]}
                key={`${part.type}-${part.toolCallId}-${part.partIndex}`}
                onToolApprovalResponse={onToolApprovalResponse}
                part={part}
              />
            )
          }

          if (isReasoningUIPart(part)) {
            const duration =
              reasoningDurations?.[String(part.partIndex)] ??
              (part.state !== "streaming" && part.partIndex === fallbackThinkingDurationPartIndex
                ? thinkingDuration
                : undefined)

            return (
              <ReasoningActivityRow
                autoOpenWhileActive={autoOpenWhileActive}
                defaultOpen={defaultOpen}
                duration={duration}
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

AssistantFallbackParts.displayName = "AssistantFallbackParts"
ReasoningActivityRow.displayName = "ReasoningActivityRow"
AssistantActivityTimeline.displayName = "AssistantActivityTimeline"
