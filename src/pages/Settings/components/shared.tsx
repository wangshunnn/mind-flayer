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
