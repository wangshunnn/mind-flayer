import { MessageSquarePlus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { CommandShortcut } from "@/components/ui/command"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"
import { useShortcutDisplay } from "@/hooks/use-shortcut-config"
import { ShortcutAction } from "@/types/settings"

export function NavMain({ onNewChat }: { onNewChat?: () => void }) {
  const { t } = useTranslation("common")
  const shortcutKeys = useShortcutDisplay(ShortcutAction.NEW_CHAT)

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild onClick={onNewChat}>
            <div>
              <MessageSquarePlus className="size-4! opacity-80" />
              <span>{t("nav.newChat")}</span>
            </div>
          </SidebarMenuButton>

          <SidebarMenuBadge>
            <CommandShortcut className="text-muted-foreground/60">
              {shortcutKeys.join("")}
            </CommandShortcut>
          </SidebarMenuBadge>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
