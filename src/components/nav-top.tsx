import { Circle, MessageSquarePlus, Moon, Sun, SunMoonIcon } from "lucide-react"
import type * as React from "react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenuAction } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function NewChatTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Tooltip disableHoverableContent={true}>
      <TooltipTrigger asChild>
        <Button
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
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Tooltip disableHoverableContent={true}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            className
          )}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
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

function SiderbarDarkModeToggle({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { theme, setTheme } = useTheme()

  return (
    <Tooltip disableHoverableContent={true}>
      <TooltipTrigger asChild>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction
              className={cn(
                "size-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground top-2!",
                className
              )}
              {...props}
            >
              <Sun
                data-theme={theme}
                className={cn(
                  "absolute transition-all duration-300 scale-0 rotate-0",
                  "data-[theme=light]:scale-100 data-[theme=light]:rotate-90"
                )}
              />
              <Moon
                data-theme={theme}
                className={cn(
                  "absolute transition-all duration-300 scale-0 rotate-90",
                  "data-[theme=dark]:scale-100 data-[theme=dark]:rotate-0"
                )}
              />
              <SunMoonIcon
                data-theme={theme}
                className={cn(
                  "absolute transition-all duration-300 scale-0 rotate-90",
                  "data-[theme=system]:scale-100 data-[theme=system]:rotate-0"
                )}
              />
              <span className="sr-only">Toggle theme</span>
              <span className="sr-only">Toggle Dark Mode</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={8} className="rounded-lg">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="text-muted-foreground" />
              <span>Light</span>
              <Circle
                data-theme={theme}
                className="ml-auto size-1 fill-current hidden data-[theme=light]:block"
              />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="text-muted-foreground" />
              <span>Dark</span>
              <Circle
                data-theme={theme}
                className="ml-auto size-1 fill-current hidden data-[theme=dark]:block"
              />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <SunMoonIcon className="text-muted-foreground" />
              <span>Device</span>
              <Circle
                data-theme={theme}
                className="ml-auto size-1 fill-current hidden data-[theme=system]:block"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent>Toggle Dark Mode</TooltipContent>
    </Tooltip>
  )
}

export { DarkModeToggle, NewChatTrigger, SiderbarDarkModeToggle }
