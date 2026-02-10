import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
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

const createNewChatToken = () => globalThis.crypto.randomUUID()

export default function Page() {
  const {
    chats,
    activeChatId,
    switchChat,
    deleteChat,
    createChat,
    loadMessages,
    saveChatAllMessages
  } = useChatStorage()
  const [newChatToken, setNewChatToken] = useState(createNewChatToken)
  const [unreadChatIds, setUnreadChatIds] = useState<Set<ChatId>>(new Set())
  const activeChatIdRef = useRef(activeChatId)
  const newChatTokenRef = useRef(newChatToken)

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    newChatTokenRef.current = newChatToken
  }, [newChatToken])

  const handleNewChat = useCallback(() => {
    switchChat(null)
    setNewChatToken(createNewChatToken())
  }, [switchChat])

  const handleChatClick = useCallback(
    (chatId: ChatId) => {
      setUnreadChatIds(prev => {
        if (!prev.has(chatId)) {
          return prev
        }
        const next = new Set(prev)
        next.delete(chatId)
        return next
      })
      switchChat(chatId)
    },
    [switchChat]
  )

  const handleChatUnread = useCallback((chatId: ChatId) => {
    setUnreadChatIds(prev => {
      if (prev.has(chatId)) {
        return prev
      }
      const next = new Set(prev)
      next.add(chatId)
      return next
    })
  }, [])

  const handleRequestActivateChat = useCallback(
    (chatId: ChatId, tokenAtSend: string) => {
      if (activeChatIdRef.current === null && newChatTokenRef.current === tokenAtSend) {
        switchChat(chatId)
      }
    },
    [switchChat]
  )

  useEffect(() => {
    if (!activeChatId) {
      return
    }
    setUnreadChatIds(prev => {
      if (!prev.has(activeChatId)) {
        return prev
      }
      const next = new Set(prev)
      next.delete(activeChatId)
      return next
    })
  }, [activeChatId])

  useEffect(() => {
    const chatIds = new Set(chats.map(chat => chat.id))
    setUnreadChatIds(prev => {
      let changed = false
      const next = new Set<ChatId>()
      for (const chatId of prev) {
        if (chatIds.has(chatId)) {
          next.add(chatId)
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [chats])

  // Handle search history shortcut (Cmd+F)
  const handleSearchHistory = useCallback(() => {
    // TODO: Implement search history functionality
    // For now, show a toast notification
    toast.info("Coming soon")
  }, [])

  // Register local shortcuts
  useLocalShortcut(ShortcutAction.NEW_CHAT, handleNewChat)
  useLocalShortcut(ShortcutAction.OPEN_SETTINGS, handleOpenSettings)
  useLocalShortcut(ShortcutAction.SEARCH_HISTORY, handleSearchHistory)

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      {/* Left sidebar */}
      <AppSidebar
        chats={chats}
        activeChatId={activeChatId}
        unreadChatIds={unreadChatIds}
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
        <AppChat
          activeChatId={activeChatId}
          chats={chats}
          newChatToken={newChatToken}
          createChat={createChat}
          loadMessages={loadMessages}
          saveChatAllMessages={saveChatAllMessages}
          onRequestActivateChat={handleRequestActivateChat}
          onChatUnread={handleChatUnread}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
