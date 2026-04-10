import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type SettingActionType = "save" | "clear"
export type SettingActionStatus = "idle" | "submitting" | "success" | "error"

export interface SettingActionFeedback {
  action: SettingActionType | null
  status: SettingActionStatus
}

interface SettingLabelProps {
  children: React.ReactNode
}

export function SettingLabel({ children }: SettingLabelProps) {
  return (
    <div data-tauri-drag-region className="text-sm text-muted-foreground ml-1 mb-2 cursor-default">
      {children}
    </div>
  )
}

interface SettingGroupProps {
  children: React.ReactNode
}

export function SettingGroup({ children }: SettingGroupProps) {
  return (
    <div className="w-full space-y-0 px-4 bg-setting-background-highlight rounded-md">
      {children}
    </div>
  )
}

interface SettingActionButtonContentProps {
  label: string
  showCheckIcon: boolean
  iconClassName?: string
}

export function SettingActionButtonContent({
  label,
  showCheckIcon,
  iconClassName
}: SettingActionButtonContentProps) {
  if (!showCheckIcon) {
    return label
  }

  return (
    <span className="relative inline-flex items-center justify-center">
      <span aria-hidden="true" className="invisible">
        {label}
      </span>
      <CheckIcon className={cn("absolute size-4 text-current", iconClassName)} />
      <span className="sr-only">{label}</span>
    </span>
  )
}
