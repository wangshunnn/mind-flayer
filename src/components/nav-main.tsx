import { MessageSquarePlus } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"

export function NavMain({ onNewChat }: { onNewChat?: () => void }) {
  const { t } = useTranslation("common")

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild className="text-sm font-normal" onClick={onNewChat}>
            <div>
              <MessageSquarePlus className="size-4! opacity-80" />
              <span>{t("nav.newChat")}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
