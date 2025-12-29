import { MessageSquarePlus, Moon, Sun } from "lucide-react"
import type * as React from "react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function NewChatTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-sidebar="trigger"
          data-slot="sidebar-trigger"
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            className
          )}
          {...props}
        >
          <MessageSquarePlus className="cursor-pointer size-4.5" />
          <span className="sr-only">New Chat</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>New Chat</TooltipContent>
    </Tooltip>
  )
}

function DarkModeToggle({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { theme, setTheme } = useTheme()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-sidebar="trigger"
          data-slot="sidebar-trigger"
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            className
          )}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          {...props}
        >
          <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
          <span className="sr-only">Toggle Dark Mode</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Toggle Dark Mode</TooltipContent>
    </Tooltip>
  )
}

export { DarkModeToggle, NewChatTrigger }
