import type { ReactNode } from "react"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface TopFloatingHeaderProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  rightSlot?: ReactNode
  rightSlotClassName?: string
}

export function TopFloatingHeader({
  children,
  className,
  contentClassName,
  rightSlot,
  rightSlotClassName
}: TopFloatingHeaderProps) {
  const { isCompact, open } = useSidebar()
  const isFullWidth = isCompact || !open

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "bg-background relative flex h-11 items-center border-b-[0.5px] pt-0",
        className
      )}
    >
      <div
        data-tauri-drag-region
        className={cn(
          "fixed left-10 z-50 flex items-center pointer-events-auto",
          isFullWidth ? "left-43" : "left-66.75",
          "transition-left duration-300 ease",
          contentClassName
        )}
      >
        {children}
      </div>

      {rightSlot && (
        <div
          data-tauri-drag-region
          className={cn(
            "absolute top-1/2 right-4 z-50 flex -translate-y-1/2 items-center pointer-events-auto",
            rightSlotClassName
          )}
        >
          {rightSlot}
        </div>
      )}
    </div>
  )
}
