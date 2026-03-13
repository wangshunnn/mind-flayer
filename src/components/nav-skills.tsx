import { WandSparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"

interface NavSkillsProps {
  isActive: boolean
  onClick: () => void
}

export function NavSkills({ isActive, onClick }: NavSkillsProps) {
  const { t } = useTranslation("common")

  return (
    <SidebarGroup className="pt-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={isActive} onClick={onClick}>
            <WandSparklesIcon className="size-4! opacity-80" />
            <span>{t("nav.skills")}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
