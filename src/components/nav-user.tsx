import { CirclePlus, Settings, User } from "lucide-react"
import { SiderbarDarkModeToggle } from "@/components/nav-top"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function NavUser({
  user
}: {
  user: {
    name: string
    avatar?: string
  }
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={cn(
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                "px-1"
              )}
            >
              <Avatar className="rounded-full size-8">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="bg-linear-120 from-indigo-300 to-teal-300 font-medium">
                  {user.name
                    .split(" ")
                    .slice(0, 2)
                    .map(n => n.charAt(0))
                    .join("")
                    .toUpperCase()}
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
              <DropdownMenuItem>
                <User />
                My Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CirclePlus />
                Create Team
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem className="p-0 font-light cursor-pointer">
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
