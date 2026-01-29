import type { LucideIcon } from "lucide-react"
import { ChevronDownIcon, CircleIcon } from "lucide-react"
import { useState } from "react"
import {
  PromptInputButton,
  type PromptInputButtonProps
} from "@/components/ai-elements/prompt-input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDropdownTooltip } from "@/hooks/use-dropdown-tooltip"
import { cn } from "@/lib/utils"

type ToolMode = {
  value: string
  label: string
  description?: string
  icon?: LucideIcon
  /**
   * Badge text to display next to the label (e.g., "Recommended", "Experimental", "New")
   */
  badge?: string
}

type ToolButtonProps = {
  /**
   * The icon to display in the button
   */
  icon: LucideIcon
  /**
   * The label text to display when not collapsed
   */
  label: string
  /**
   * The tooltip text
   */
  tooltip: string
  /**
   * Whether the tool is enabled
   */
  enabled: boolean
  /**
   * Callback when the enabled state changes
   */
  onEnabledChange: (enabled: boolean) => void
  /**
   * Whether the button should be collapsed (icon only)
   */
  collapsed?: boolean
  /**
   * Optional modes for the dropdown menu
   */
  modes?: ToolMode[]
  /**
   * The currently selected mode value
   */
  selectedMode?: string
  /**
   * Callback when the mode changes
   */
  onModeChange?: (mode: string) => void
  /**
   * Additional class name for the button
   */
  className?: string
  /**
   * Button variant override
   */
  variant?: PromptInputButtonProps["variant"]
}

/**
 * A reusable tool button component with dropdown menu for mode selection.
 * Designed to be used in the PromptInputTools area.
 */
const ToolButton = ({
  icon: Icon,
  label,
  tooltip,
  enabled,
  onEnabledChange,
  collapsed = false,
  modes,
  selectedMode,
  onModeChange,
  className,
  variant
}: ToolButtonProps) => {
  const [open, setOpen] = useState(false)
  const [openTooltip] = useDropdownTooltip(open)
  const hasDropdown = modes && modes.length > 0 && onModeChange

  if (!hasDropdown) {
    // Simple button without dropdown
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <PromptInputButton
            onClick={() => onEnabledChange(!enabled)}
            variant={variant ?? (enabled ? "selected" : "ghost")}
            collapsed={collapsed}
            className={className}
          >
            <Icon
              className="lucide-stroke-bold tool-icon-flip mb-px"
              data-enabled={enabled}
              key={`icon-${enabled}`}
            />
            {!collapsed && <span>{label}</span>}
          </PromptInputButton>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    )
  }

  // Button with dropdown
  const selectedModeLabel =
    enabled && selectedMode ? modes?.find(m => m.value === selectedMode)?.label : undefined
  const displayLabel = selectedModeLabel || label

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disableHoverableContent={true} open={openTooltip}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <PromptInputButton
              variant={variant ?? (enabled ? "selected" : "ghost")}
              collapsed={collapsed}
              className={cn("gap-1", className)}
            >
              <Icon
                className="lucide-stroke-bold tool-icon-flip mb-px"
                data-enabled={enabled}
                key={`icon-${enabled}-${selectedMode}`}
              />
              {!collapsed && <span>{displayLabel}</span>}
              {!collapsed && (
                <ChevronDownIcon
                  className={cn("size-3 transition-transform duration-300", open && "-rotate-180")}
                />
              )}
            </PromptInputButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" sideOffset={6} className="min-w-60">
        {/* Header with title and switch */}
        <div className="flex items-center justify-between px-2 py-2">
          <span className="text-sm font-medium">{label}</span>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </div>

        {/* Mode options */}
        <DropdownMenuGroup>
          <DropdownMenuSeparator />

          {modes.map(mode => {
            const ModeIcon = mode.icon
            return (
              <DropdownMenuItem
                key={mode.value}
                onClick={() => onModeChange(mode.value)}
                className={cn("group flex flex-col items-start gap-1 px-2 py-2.5")}
              >
                <div className="flex w-full items-center gap-2">
                  {ModeIcon && (
                    <ModeIcon className="size-4 shrink-0 group-hover:text-brand-green transition-colors" />
                  )}
                  <span className="flex items-center flex-1 text-left font-medium">
                    {mode.label}
                    {mode.badge && (
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 ml-2 text-[9px] font-normal",
                          "italic rounded-md text-brand-green bg-brand-green-light"
                        )}
                      >
                        {mode.badge}
                      </span>
                    )}
                  </span>

                  <span className="ml-2 w-4 shrink-0">
                    {selectedMode === mode.value && (
                      <CircleIcon className="size-2 fill-current text-brand-green" />
                    )}
                  </span>
                </div>
                {mode.description && (
                  <p className="text-[10px] text-muted-foreground pl-6">{mode.description}</p>
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { ToolButton, type ToolButtonProps, type ToolMode }
