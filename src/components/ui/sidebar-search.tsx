import { Search } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SidebarGroup, SidebarGroupContent, SidebarMenuButton } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface SearchChatProps {
  onClick: () => void
}

export function SearchChat({ onClick }: SearchChatProps) {
  const { t } = useTranslation("common")

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex items-center gap-2">
        <SidebarMenuButton
          onClick={onClick}
          className={cn(
            "cursor-pointer bg-sidebar-search hover:bg-sidebar-search-hover w-full",
            "text-sidebar-search-foreground hover:text-sidebar-search-foreground",
            "border-[0.5px] border-sidebar-search-border"
          )}
        >
          <Search />
          <span>{t("sidebar.search")}</span>
        </SidebarMenuButton>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
