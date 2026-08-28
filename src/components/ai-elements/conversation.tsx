import { ChevronDownIcon } from "lucide-react"
import type { ComponentProps, Ref } from "react"
import { createContext, useCallback, useContext, useImperativeHandle } from "react"
import { Button } from "@/components/ui/button"
import {
  type ConversationScrollController,
  useConversationScroll
} from "@/hooks/use-conversation-scroll"
import { cn } from "@/lib/utils"

const ConversationScrollContext = createContext<ConversationScrollController | null>(null)

export type ConversationProps = ComponentProps<"div"> & {
  contextRef?: Ref<ConversationScrollController>
  resetKey?: string | number | null
}

export const Conversation = ({ className, contextRef, resetKey, ...props }: ConversationProps) => {
  const controller = useConversationScroll(resetKey)
  useImperativeHandle(contextRef, () => controller, [controller])

  return (
    <ConversationScrollContext.Provider value={controller}>
      <div
        className={cn("relative flex-1 overflow-y-hidden", className)}
        data-slot="conversation"
        role="log"
        {...props}
      />
    </ConversationScrollContext.Provider>
  )
}

export type ConversationContentProps = ComponentProps<"div"> & {
  scrollClassName?: string
}

export const ConversationContent = ({
  className,
  scrollClassName,
  ...props
}: ConversationContentProps) => {
  const { contentRef, scrollRef } = useConversationScrollContext()

  return (
    <div
      className={cn(
        "h-full w-full overflow-y-auto overflow-x-hidden [overflow-anchor:none]",
        scrollClassName
      )}
      data-slot="conversation-scroll"
      ref={scrollRef}
      style={{ scrollbarGutter: "stable both-edges" }}
    >
      <div
        className={cn("flex flex-col gap-0 px-5 pb-5 items-center", className)}
        data-slot="conversation-content"
        ref={contentRef}
        {...props}
      />
    </div>
  )
}

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </>
    )}
  </div>
)

export type ConversationScrollButtonProps = ComponentProps<typeof Button>

export function useConversationScrollContext(): ConversationScrollController {
  const context = useContext(ConversationScrollContext)
  if (!context) {
    throw new Error("useConversationScrollContext must be used within Conversation")
  }
  return context
}

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useConversationScrollContext()

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom("smooth")
  }, [scrollToBottom])

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full",
          "bg-chat-input-bg hover:bg-chat-input-hover-bg",
          "drop-shadow-[0_4px_15px_rgba(0,0,0,0.12)] hover:drop-shadow-[0_4px_15px_rgba(0,0,0,0.2)]",
          "dark:bg-chat-input-bg dark:hover:bg-chat-input-hover-bg",
          "dark:drop-shadow-[0_4px_15px_rgba(255,255,255,0.12)] dark:hover:drop-shadow-[0_4px_15px_rgba(255,255,255,0.2)]",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon-sm"
        type="button"
        variant="outline"
        {...props}
      >
        <ChevronDownIcon className="size-5" />
      </Button>
    )
  )
}
