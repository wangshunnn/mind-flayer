import { Fragment } from "react"
import { useTranslation } from "react-i18next"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { SettingGroup, SettingLabel } from "./shared"

export function KeyboardSection() {
  const { t } = useTranslation("settings")
  const shortcutGroups = [
    {
      title: t("shortcuts.groups.general"),
      items: [
        { label: t("shortcuts.items.toggleMainWindow"), keys: ["⇧", "⌥", "W"] },
        { label: t("shortcuts.items.searchHistory"), keys: ["⌘", "F"] }
      ]
    },
    {
      title: t("shortcuts.groups.chat"),
      items: [
        { label: t("shortcuts.items.sendMessage"), keys: ["↩"] },
        { label: t("shortcuts.items.newLine"), keys: ["⌘", "↩"] },
        { label: t("shortcuts.items.newChat"), keys: ["⌃", "Tab"] },
        { label: t("shortcuts.items.history"), keys: ["⌥", "↑/↓"] }
      ]
    }
  ]

  return (
    <div data-tauri-drag-region className="space-y-4 pb-8">
      {shortcutGroups.map(group => (
        <div key={group.title}>
          <SettingLabel>{group.title}</SettingLabel>
          <SettingGroup>
            {group.items.map((item, index) => (
              <Fragment key={item.label}>
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="text-base">{item.label}</div>
                  <div className="px-1 py-1.5">
                    <KbdGroup className="gap-1.5">
                      {item.keys.map((key, keyIndex) => (
                        <Fragment key={`${item.label}-${key}`}>
                          {keyIndex > 0 && <span className="text-xs text-muted-foreground">+</span>}
                          <Kbd>{key}</Kbd>
                        </Fragment>
                      ))}
                    </KbdGroup>
                  </div>
                </div>
                {index < group.items.length - 1 && <Separator />}
              </Fragment>
            ))}
          </SettingGroup>
        </div>
      ))}
    </div>
  )
}
