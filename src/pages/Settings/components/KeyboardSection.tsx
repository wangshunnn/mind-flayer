import { Fragment } from "react"
import { useTranslation } from "react-i18next"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { useShortcutConfig } from "@/hooks/use-shortcut-config"
import { formatShortcutForDisplay } from "@/lib/shortcut-formatter"
import { ShortcutAction } from "@/types/settings"
import { SettingGroup, SettingLabel } from "./shared"

export function KeyboardSection() {
  const { t } = useTranslation("settings")
  const shortcuts = useShortcutConfig()

  const shortcutGroups = [
    {
      title: t("shortcuts.groups.general"),
      items: [
        {
          label: t("shortcuts.items.toggleMainWindow"),
          keys: formatShortcutForDisplay(shortcuts[ShortcutAction.TOGGLE_WINDOW].key)
        },
        {
          label: t("shortcuts.items.toggleSidebar"),
          keys: formatShortcutForDisplay(shortcuts[ShortcutAction.TOGGLE_SIDEBAR].key)
        },
        {
          label: t("shortcuts.items.openSettings"),
          keys: formatShortcutForDisplay(shortcuts[ShortcutAction.OPEN_SETTINGS].key)
        },
        {
          label: t("shortcuts.items.searchHistory"),
          keys: formatShortcutForDisplay(shortcuts[ShortcutAction.SEARCH_HISTORY].key)
        }
      ]
    },
    {
      title: t("shortcuts.groups.chat"),
      items: [
        {
          label: t("shortcuts.items.sendMessage"),
          keys: formatShortcutForDisplay(shortcuts[ShortcutAction.SEND_MESSAGE].key)
        },
        {
          label: t("shortcuts.items.newLine"),
          keys: formatShortcutForDisplay(shortcuts[ShortcutAction.NEW_LINE].key)
        },
        {
          label: t("shortcuts.items.newChat"),
          keys: formatShortcutForDisplay(shortcuts[ShortcutAction.NEW_CHAT].key)
        }
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
                <div className="flex items-center justify-between gap-4 py-2.5">
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
