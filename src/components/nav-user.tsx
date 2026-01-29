import { GhostIcon, Settings, User } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SiderbarDarkModeToggle } from "@/components/nav-top"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import { Kbd, KbdGroup } from "./ui/kbd"

export function NavUser({
  user
}: {
  user: {
    name: string
    avatar?: string
  }
}) {
  const { t } = useTranslation("common")

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={cn(
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                "px-1 group/is-nav-user"
              )}
            >
              <Avatar className="rounded-full size-8 transition-transform group-hover/is-nav-user:rotate-12">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="bg-sidebar-accent">
                  <GhostIcon className="size-4 text-purple-600" />
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-normal">{user.name}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <SiderbarDarkModeToggle />

          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-40 rounded-lg"
            side="top"
            align="center"
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem disabled>
                <User />
                {t("nav.myAccount")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSettingsWindow(SettingsSection.GENERAL)}>
                <Settings />
                {t("nav.settings")}
                <DropdownMenuShortcut>
                  <KbdGroup>
                    <Kbd>⌘</Kbd>
                    <Kbd>,</Kbd>
                  </KbdGroup>
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem className="p-0 cursor-pointer">
              <div className="flex items-center gap-2 px-1.5 py-1.5 text-left text-sm">
                <Avatar className="rounded-full size-5">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="bg-linear-120 from-indigo-300 to-teal-300"></AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate">{user.name}</span>
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
