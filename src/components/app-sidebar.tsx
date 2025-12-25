import { BookmarkCheck } from "lucide-react"
import type * as React from "react"
import { NavChats } from "@/components/nav-chats"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import { SearchChat } from "./ui/sidebar-search"

const data = {
  user: {
    name: "Mind Flayer"
    // avatar: "/tauri.svg"
  },
  navMain: [
    {
      title: "Mind Flayer",
      url: "#",
      icon: BookmarkCheck
    },
    {
      title: "All Collections",
      url: "#",
      icon: BookmarkCheck
    }
  ],
  chats: [
    {
      name: "history chat 1",
      url: "#"
    },
    {
      name: "history chat 2",
      url: "#"
    },
    {
      name: "history chat 3",
      url: "#"
    }
  ]
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SearchChat />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavChats chats={data.chats} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
