import type * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      enterKeyHint="enter"
      spellCheck="false"
      className={cn(
        "border-input flex field-sizing-content min-h-16 w-full rounded-md border",
        "bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm",
        "transition-[color,box-shadow]",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        "dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
