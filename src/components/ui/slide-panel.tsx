import * as React from "react"
import { SIDEBAR_WIDTH_COMPACT } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface SlidePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: "left" | "right"
  width?: string
}

export function SlidePanel({
  open,
  onOpenChange,
  side = "left",
  width = SIDEBAR_WIDTH_COMPACT,
  className,
  children,
  ...props
}: SlidePanelProps) {
  const [isVisible, setIsVisible] = React.useState(false)
  const [shouldAnimate, setShouldAnimate] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setIsVisible(true)
      // Use single RAF to wait for DOM update, then trigger animation
      requestAnimationFrame(() => {
        setShouldAnimate(true)
      })
    } else {
      setShouldAnimate(false)
    }
  }, [open])

  const handleTransitionEnd = () => {
    if (!open) {
      setIsVisible(false)
    }
  }

  if (!isVisible && !open) {
    return null
  }

  return (
    <div
      style={{ width }}
      className={cn(
        "bg-sidebar-impact text-sidebar-foreground fixed inset-y-0 z-50 flex flex-col transition-transform duration-300 ease-out",
        "m-1.5 rounded-sm border-none outline-[0.5px] outline-black/10 shadow-[12px_12px_36px_0_rgba(0,0,0,0.15)]",
        side === "left" && ["left-0", shouldAnimate ? "translate-x-0" : "-translate-x-full"],
        side === "right" && ["right-0", shouldAnimate ? "translate-x-0" : "translate-x-full"],
        className
      )}
      onTransitionEnd={handleTransitionEnd}
      {...props}
    >
      {children}
    </div>
  )
}
