import type * as React from "react"
import { toast } from "sonner"
import { NavChats } from "@/components/nav-chats"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import { SearchChat } from "@/components/ui/sidebar-search"
import type { Chat, ChatId } from "@/types/chat"

const data = {
  user: {
    name: "Mind Flayer",
    avatar: ""
  }
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  chats: Chat[]
  onChatClick: (chatId: ChatId) => void
  onDeleteChat: (chatId: ChatId) => Promise<void>
  activeChatId?: ChatId | null
  onNewChat?: () => void
}

export function AppSidebar({
  chats,
  activeChatId,
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
        <NavMain onNewChat={onNewChat} />
        <NavChats
          chats={chats}
          activeChatId={activeChatId}
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
