import type { LucideIcon } from "lucide-react"
import { BadgeInfoIcon, CheckIcon, ChevronDownIcon } from "lucide-react"
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
import { useAutofocusSelectedDropdownItem } from "@/hooks/use-autofocus-selected-dropdown-item"
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
   * Optional helper text shown in the panel header info tooltip.
   */
  panelDescription?: string
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

function InfoTooltipIcon({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground">
          <BadgeInfoIcon className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}

const ToolButton = ({
  icon: Icon,
  label,
  tooltip,
  enabled,
  onEnabledChange,
  collapsed = false,
  modes,
  panelDescription,
  selectedMode,
  onModeChange,
  className,
  variant
}: ToolButtonProps) => {
  const [open, setOpen] = useState(false)
  const [openTooltip] = useDropdownTooltip(open)
  const { scopeId: autofocusScope } = useAutofocusSelectedDropdownItem(open, selectedMode)

  if (!modes?.length || !onModeChange) {
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

  const selectedModeLabel =
    enabled && selectedMode ? modes.find(m => m.value === selectedMode)?.label : undefined
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
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex min-w-0 items-center gap-1.5 pr-3">
            <div className="text-sm font-medium text-muted-foreground">{label}</div>
            {panelDescription && <InfoTooltipIcon content={panelDescription} />}
          </div>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </div>

        <DropdownMenuGroup>
          <DropdownMenuSeparator />

          {modes.map(mode => {
            const ModeIcon = mode.icon
            const isSelected = selectedMode === mode.value
            return (
              <DropdownMenuItem
                key={mode.value}
                onClick={() => onModeChange(mode.value)}
                className="group px-2 py-2.5"
                data-autofocus-scope={autofocusScope}
                data-item-value={mode.value}
              >
                <div className="flex w-full items-center gap-2">
                  {ModeIcon && (
                    <ModeIcon className="size-4 shrink-0 group-hover:text-brand-green transition-colors" />
                  )}
                  <span className="flex items-center flex-1 text-left font-medium gap-1.5">
                    {mode.label}
                    {mode.description && <InfoTooltipIcon content={mode.description} />}
                    {mode.badge && (
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 text-[9px] font-normal",
                          "rounded-md text-brand-green bg-brand-green-light"
                        )}
                      >
                        {mode.badge}
                      </span>
                    )}
                  </span>

                  <span className="ml-2 w-4 shrink-0">
                    {isSelected && <CheckIcon className="size-4 text-brand-green" />}
                  </span>
                </div>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { ToolButton, type ToolButtonProps, type ToolMode }
