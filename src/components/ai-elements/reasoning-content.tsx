import type { ComponentProps } from "react"
import { memo } from "react"
import { Streamdown } from "streamdown"
import { cn } from "@/lib/utils"

type ReasoningCodeProps = ComponentProps<"code"> & {
  "data-block"?: string
  node?: unknown
}

const ReasoningPlainTextCode = memo(
  ({ children, className, node: _node, "data-block": dataBlock, ...props }: ReasoningCodeProps) => {
    if (dataBlock) {
      return (
        <code
          className={cn(
            "block whitespace-pre-wrap wrap-break-word text-inherit font-[inherit]",
            className
          )}
          data-streamdown="thinking-plain-text-block"
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <code
        className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-sm", className)}
        data-streamdown="inline-code"
        {...props}
      >
        {children}
      </code>
    )
  }
)

const REASONING_STREAMDOWN_COMPONENTS = {
  img: () => null,
  code: ReasoningPlainTextCode
} satisfies NonNullable<ComponentProps<typeof Streamdown>["components"]>
const REASONING_STREAMDOWN_CONTROLS = { table: false } as const
const REASONING_STREAMDOWN_LINK_SAFETY = { enabled: false } as const

export type ReasoningPartContentProps = ComponentProps<"div"> & {
  children: string
  streaming?: boolean
}

export const ReasoningPartContent = memo(
  ({ className, children, streaming = false, ...props }: ReasoningPartContentProps) => {
    return (
      <div className={cn("text-muted-foreground pr-4 text-xs", className)} {...props}>
        <Streamdown
          controls={REASONING_STREAMDOWN_CONTROLS}
          linkSafety={REASONING_STREAMDOWN_LINK_SAFETY}
          className="streamdown-thinking-process space-y-1"
          components={REASONING_STREAMDOWN_COMPONENTS}
          isAnimating={streaming}
          mode={streaming ? "streaming" : "static"}
        >
          {children}
        </Streamdown>
      </div>
    )
  }
)

ReasoningPlainTextCode.displayName = "ReasoningPlainTextCode"
ReasoningPartContent.displayName = "ReasoningPartContent"
