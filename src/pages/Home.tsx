import { useCallback } from "react"
import { AppChat } from "@/components/app-chat"
import { AppSidebar } from "@/components/app-sidebar"
import { NewChatTrigger } from "@/components/nav-top"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useChatStorage } from "@/hooks/use-chat-storage"
import { useLocalShortcut } from "@/hooks/use-local-shortcut"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import type { ChatId } from "@/types/chat"
import { ShortcutAction } from "@/types/settings"

// Handle open settings shortcut (Cmd+,)
const handleOpenSettings = () => {
  openSettingsWindow(SettingsSection.GENERAL)
}

export default function Page() {
  const { chats, activeChatId, switchChat, loadChats, deleteChat } = useChatStorage()

  const handleNewChat = useCallback(() => {
    switchChat(null)
  }, [switchChat])

  const handleChatClick = (chatId: ChatId) => {
    switchChat(chatId)
  }

  const handleChatCreated = async (chatId: ChatId) => {
    await loadChats()
    switchChat(chatId)
  }

  // Register local shortcuts
  useLocalShortcut(ShortcutAction.NEW_CHAT, handleNewChat)
  useLocalShortcut(ShortcutAction.OPEN_SETTINGS, handleOpenSettings)

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
      <div data-tauri-drag-region className="z-50 h-12 fixed top-0 left-0 right-0"></div>

      {/* Top buttons */}
      <div
        data-tauri-drag-region
        className="z-50 pt-1.5 h-12 fixed left-24 flex items-center justify-center pointer-events-auto gap-2"
      >
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
