import { AppChat } from "@/components/app-chat"
import { AppSidebar } from "@/components/app-sidebar"
import { NewChatTrigger } from "@/components/nav-top"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useChatStorage } from "@/hooks/use-chat-storage"
import type { ChatId } from "@/types/chat"

export default function Page() {
  const { chats, activeChatId, switchChat, loadChats, deleteChat } = useChatStorage()

  const handleChatClick = (chatId: ChatId) => {
    switchChat(chatId)
  }

  const handleNewChat = () => {
    switchChat(null)
  }

  const handleChatCreated = async (chatId: ChatId) => {
    await loadChats()
    switchChat(chatId)
  }

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      {/* Left sidebar */}
      <AppSidebar
        chats={chats}
        activeChatId={activeChatId}
        onChatClick={handleChatClick}
        onDeleteChat={deleteChat}
        onNewChat={handleNewChat}
      />

      {/* Top drag region */}
      <div data-tauri-drag-region className="z-50 fixed top-0 left-0 right-0 h-14.5"></div>

      {/* Top buttons */}
      <div className="z-50 fixed top-4 left-24 flex items-center justify-center pointer-events-auto gap-1">
        <SidebarTrigger />
        <NewChatTrigger onClick={handleNewChat} />
      </div>

      {/* Main content area */}
      <SidebarInset className="overflow-hidden">
        <AppChat activeChatId={activeChatId} onChatCreated={handleChatCreated} />
      </SidebarInset>
    </SidebarProvider>
  )
}
