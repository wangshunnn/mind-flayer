import { DialogClose } from "@radix-ui/react-dialog"
import { Search } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { SidebarGroup, SidebarGroupContent, SidebarMenuButton } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function SearchChat() {
  const { t } = useTranslation("common")

  return (
    <Dialog>
      <SidebarGroup>
        <SidebarGroupContent className="flex items-center gap-2">
          <DialogTrigger asChild className="flex-1">
            <div>
              <Label htmlFor="search" className="sr-only">
                {t("sidebar.search")}
              </Label>
              <SidebarMenuButton
                className={cn(
                  "cursor-pointer bg-sidebar-search hover:bg-sidebar-search-hover w-full",
                  "text-sidebar-search-foreground hover:text-sidebar-search-foreground",
                  "border-[0.5px] border-sidebar-search-border"
                )}
              >
                <Search />
                <span>{t("sidebar.search")}</span>
              </SidebarMenuButton>
            </div>
          </DialogTrigger>
        </SidebarGroupContent>
      </SidebarGroup>

      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>{t("sidebar.searchChat")}</DialogTitle>
          <DialogDescription>{t("sidebar.comingSoon")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
