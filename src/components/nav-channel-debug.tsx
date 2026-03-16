import { CableIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"

interface NavChannelDebugProps {
  isActive: boolean
  onClick: () => void
}

export function NavChannelDebug({ isActive, onClick }: NavChannelDebugProps) {
  const { t } = useTranslation("common")

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={isActive} onClick={onClick}>
            <CableIcon className="size-3.5!" />
            <span>{t("nav.channelSessions")}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
