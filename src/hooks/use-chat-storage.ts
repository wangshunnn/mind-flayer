import type { UIMessage } from "ai"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useState } from "react"
import {
  createChatEntry,
  deleteChatEntry,
  readChatMessages,
  readIndex,
  updateChatEntry,
  writeChatMessages
} from "@/lib/chat-fs"
import { getSidecarUrl } from "@/lib/sidecar-client"
import type { Chat, ChatId } from "@/types/chat"

/**
 * Hook for managing chat storage with JSONL files via Tauri fs plugin.
 */
export function useChatStorage() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<ChatId | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Load all chats from index file
   */
  const loadChats = useCallback(async () => {
    try {
      console.log("[ChatStorage] Loading chats...")
      const result = await readIndex()
      console.log("[ChatStorage] Loaded chats:", result.length)
      setChats(result)
      setError(null)
    } catch (err) {
      console.error("[ChatStorage] Failed to load chats:", err)
      setError(err instanceof Error ? err : new Error("Failed to load chats"))
    }
  }, [])

  /**
   * Create a new chat
   */
  const createChat = useCallback(
    async (title?: string, options?: { activate?: boolean }): Promise<ChatId> => {
      try {
        console.log("[ChatStorage] Creating new chat...", title)
        const now = Date.now()
        const shouldActivate = options?.activate ?? true
        const newChat: Chat = {
          id: nanoid(),
          title: title || "New Chat",
          created_at: now,
          updated_at: now
        }

        await createChatEntry(newChat)

        console.log("[ChatStorage] Chat created:", newChat.id)
        await loadChats()
        if (shouldActivate) {
          setActiveChatId(newChat.id)
        }
        setError(null)
        return newChat.id
      } catch (err) {
        console.error("Failed to create chat:", err)
        const error = err instanceof Error ? err : new Error("Failed to create chat")
        setError(error)
        throw error
      }
    },
    [loadChats]
  )

  /**
   * Update chat title
   */
  const updateChatTitle = useCallback(
    async (chatId: string, title: string): Promise<void> => {
      try {
        const now = Date.now()
        await updateChatEntry(chatId, { title, updated_at: now })
        await loadChats()
        setError(null)
      } catch (err) {
        console.error("Failed to update chat title:", err)
        const error = err instanceof Error ? err : new Error("Failed to update chat title")
        setError(error)
        throw error
      }
    },
    [loadChats]
  )

  /**
   * Delete a chat and all its messages
   */
  const deleteChat = useCallback(
    async (chatId: string): Promise<void> => {
      try {
        await deleteChatEntry(chatId)

        // Clean up bash execution workspace via sidecar
        try {
          const cleanupUrl = await getSidecarUrl("/api/cleanup-workspace")
          await fetch(cleanupUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId })
          })
        } catch (cleanupErr) {
          console.warn("[ChatStorage] Failed to cleanup workspace:", cleanupErr)
        }

        await loadChats()

        if (activeChatId === chatId) {
          setActiveChatId(null)
        }
        setError(null)
      } catch (err) {
        console.error("Failed to delete chat:", err)
        const error = err instanceof Error ? err : new Error("Failed to delete chat")
        setError(error)
        throw error
      }
    },
    [activeChatId, loadChats]
  )

  /**
   * Save all messages for a chat (replaces existing)
   */
  const saveChatAllMessages = useCallback(
    async (chatId: string, messages: UIMessage[], _isNewChat = false): Promise<void> => {
      try {
        console.log("[ChatStorage] Saving messages:", messages.length)
        await writeChatMessages(chatId, messages)
        await updateChatEntry(chatId, { updated_at: Date.now() })
        await loadChats()
        setError(null)
      } catch (err) {
        console.error("Failed to save messages:", err)
        const error = err instanceof Error ? err : new Error("Failed to save messages")
        setError(error)
        throw error
      }
    },
    [loadChats]
  )

  /**
   * Insert only new messages for a chat (incremental save).
   * For JSONL, we load existing, merge, then rewrite the file.
   */
  const insertChatNewMessages = useCallback(
    async (chatId: string, newMessages: UIMessage[], _totalMessageCount: number): Promise<void> => {
      try {
        if (newMessages.length === 0) {
          return
        }

        console.log("[ChatStorage] Inserting new messages:", newMessages.length)
        const existing = await readChatMessages(chatId)
        const existingIds = new Set(existing.map(m => m.id))
        const toAppend = newMessages.filter(m => !existingIds.has(m.id))

        if (toAppend.length > 0) {
          await writeChatMessages(chatId, [...existing, ...toAppend])
        }

        await updateChatEntry(chatId, { updated_at: Date.now() })
        await loadChats()
        setError(null)
      } catch (err) {
        console.error("Failed to insert new messages:", err)
        const error = err instanceof Error ? err : new Error("Failed to insert new messages")
        setError(error)
        throw error
      }
    },
    [loadChats]
  )

  /**
   * Load messages for a chat
   */
  const loadMessages = useCallback(async (chatId: string): Promise<UIMessage[]> => {
    try {
      const messages = await readChatMessages(chatId)
      console.log("[ChatStorage] Loaded messages:", chatId, messages.length)
      setError(null)
      return messages
    } catch (err) {
      console.error("Failed to load messages:", err)
      const error = err instanceof Error ? err : new Error("Failed to load messages")
      setError(error)
      throw error
    }
  }, [])

  /**
   * Switch to a different chat
   */
  const switchChat = useCallback((chatId: ChatId | null) => {
    setActiveChatId(chatId)
  }, [])

  /**
   * Initialize - load chats on mount
   */
  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      try {
        await loadChats()
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [loadChats])

  return {
    chats,
    activeChatId,
    error,
    isLoading,
    createChat,
    deleteChat,
    updateChatTitle,
    saveChatAllMessages,
    insertChatNewMessages,
    loadMessages,
    switchChat,
    loadChats
  }
}
