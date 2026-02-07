import type * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { NavChats } from "@/components/nav-chats"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import { SearchChat } from "@/components/ui/sidebar-search"
import type { Chat, ChatId } from "@/types/chat"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  chats: Chat[]
  onChatClick: (chatId: ChatId) => void
  onDeleteChat: (chatId: ChatId) => Promise<void>
  activeChatId?: ChatId | null
  onNewChat?: () => void
  onSearchHistory: () => void
}

export function AppSidebar({
  chats,
  activeChatId,
  onChatClick,
  onNewChat,
  onSearchHistory,
  onDeleteChat,
  ...props
}: AppSidebarProps) {
  const { t } = useTranslation("common")

  const handleDeleteChat = async (chatId: string) => {
    try {
      await onDeleteChat(chatId)
      toast.success(t("toast.chatDeleted"))
    } catch (error) {
      console.error("Failed to delete chat:", error)
      toast.error(t("toast.error"), { description: t("toast.failedToDeleteChat") })
    }
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SearchChat onClick={onSearchHistory} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain onNewChat={onNewChat} />
        <NavChats
          chats={chats}
          activeChatId={activeChatId}
          onChatClick={onChatClick}
          onDeleteChat={handleDeleteChat}
        />
        {/* Draggable empty space below chat list */}
        <div data-tauri-drag-region className="flex-1 min-h-0" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
