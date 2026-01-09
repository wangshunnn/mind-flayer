import { BookmarkCheck } from "lucide-react"
import type * as React from "react"
import { toast } from "sonner"
import { NavChats } from "@/components/nav-chats"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import { SearchChat } from "@/components/ui/sidebar-search"
import type { Chat } from "@/types/chat"

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
  ]
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  chats: Chat[]
  onChatClick: (chat: Chat) => void
  onDeleteChat: (chatId: string) => Promise<void>
  activeChat?: Chat | null
  onNewChat?: () => void
}

export function AppSidebar({
  chats,
  activeChat,
  onChatClick,
  onNewChat,
  onDeleteChat,
  ...props
}: AppSidebarProps) {
  const handleDeleteChat = async (chatId: string) => {
    try {
      await onDeleteChat(chatId)
      toast.success("Chat deleted")
    } catch (error) {
      console.error("Failed to delete chat:", error)
      toast.error("Failed to delete chat")
    }
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SearchChat />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavChats
          chats={chats}
          activeChat={activeChat}
          onChatClick={onChatClick}
          onDeleteChat={handleDeleteChat}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
