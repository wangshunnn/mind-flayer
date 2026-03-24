import { type MouseEvent as ReactMouseEvent, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ChatMessageTimelineItemRefs {
  current: Array<HTMLButtonElement | null> | null
}

export interface ChatMessageTimelineAnchor {
  id: string
  preview: string
}

interface ChatMessageTimelineProps {
  activeIndex: number
  anchors: ChatMessageTimelineAnchor[]
  onSelect: (index: number) => void
  itemRefs?: ChatMessageTimelineItemRefs
}

function ChatMessageTimeline({
  activeIndex,
  anchors,
  onSelect,
  itemRefs
}: ChatMessageTimelineProps) {
  const { t } = useTranslation("chat")
  const preventTimelineSelection = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
  }

  useEffect(() => {
    const items = itemRefs?.current
    if (!items || activeIndex < 0) {
      return
    }

    const activeItem = items[activeIndex]
    if (typeof activeItem?.scrollIntoView !== "function") {
      return
    }

    activeItem.scrollIntoView({
      block: "nearest"
    })
  }, [activeIndex, itemRefs])

  if (anchors.length === 0) {
    return null
  }

  return (
    <nav
      aria-label={t("timeline.label")}
      className="pointer-events-none absolute inset-y-0 right-2 z-20 flex items-center"
      data-testid="chat-message-timeline"
      onMouseDownCapture={preventTimelineSelection}
    >
      <div className="pointer-events-auto flex max-h-[min(48vh,24rem)] flex-col items-end gap-1 overflow-y-auto pr-0.5 select-none">
        {anchors.map((anchor, index) => {
          const isActive = activeIndex === index
          const anchorLabel = anchor.preview || t("timeline.jumpToMessage", { index: index + 1 })

          return (
            <Tooltip disableHoverableContent={true} key={anchor.id}>
              <TooltipTrigger asChild>
                <button
                  aria-label={anchorLabel}
                  className={cn(
                    "cursor-pointer rounded-full bg-muted-foreground/32 transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? "h-0.5 w-4 bg-muted-foreground/90"
                      : "h-0.5 w-2 hover:w-3 hover:bg-muted-foreground/90 bg-muted-foreground/48"
                  )}
                  data-active={isActive}
                  data-testid={`chat-message-timeline-anchor-${index}`}
                  onClick={() => onSelect(index)}
                  ref={node => {
                    if (!itemRefs) {
                      return
                    }
                    itemRefs.current ??= []
                    itemRefs.current[index] = node
                  }}
                  type="button"
                />
              </TooltipTrigger>
              <TooltipContent side="left">{anchorLabel}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </nav>
  )
}

export { ChatMessageTimeline }
