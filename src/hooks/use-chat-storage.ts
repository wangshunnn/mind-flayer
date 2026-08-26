import type { UIMessage } from "ai"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useState } from "react"
import { commitChatContext } from "@/lib/chat-context"
import { storedMessageToUI } from "@/lib/chat-utils"
import { getDatabase } from "@/lib/database"
import { getSidecarUrl } from "@/lib/sidecar-client"
import type { Chat, ChatId, ChatRow, MessageRow } from "@/types/chat"

/**
 * Hook for managing chat storage with Tauri SQLite backend
 */
export function useChatStorage() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<ChatId | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Load all chats from database
   */
  const loadChats = useCallback(async () => {
    try {
      console.log("[ChatStorage] Loading chats...")
      const db = await getDatabase()
      const result = await db.select<ChatRow[]>("SELECT * FROM chats ORDER BY created_at DESC")
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

        const db = await getDatabase()
        await db.execute(
          "INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
          [newChat.id, newChat.title, newChat.created_at, newChat.updated_at]
        )

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
    async (
      chatId: string,
      title: string,
      options?: { expectedCurrentTitle?: string }
    ): Promise<void> => {
      try {
        const db = await getDatabase()
        const now = Date.now()
        if (options?.expectedCurrentTitle !== undefined) {
          await db.execute(
            "UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND title = ?",
            [title, now, chatId, options.expectedCurrentTitle]
          )
        } else {
          await db.execute("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?", [
            title,
            now,
            chatId
          ])
        }

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
        const db = await getDatabase()

        await db.execute("DELETE FROM chat_context_events WHERE chat_id = ?", [chatId])
        await db.execute("DELETE FROM chat_context_usage WHERE chat_id = ?", [chatId])
        await db.execute("DELETE FROM messages WHERE chat_id = ?", [chatId])
        await db.execute("DELETE FROM chats WHERE id = ?", [chatId])

        // Clean up localStorage for stored message IDs
        const storageKey = `stored-messages-${chatId}`
        localStorage.removeItem(storageKey)

        // Clean up bash execution sandbox via sidecar
        try {
          const cleanupUrl = await getSidecarUrl("/api/cleanup-sandbox")
          const cleanupResponse = await fetch(cleanupUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId })
          })
          if (!cleanupResponse.ok) {
            const errorDetails = (await cleanupResponse.text()).trim()
            throw new Error(
              `cleanup-sandbox failed for chat '${chatId}' with HTTP ${
                cleanupResponse.status
              }${errorDetails ? `: ${errorDetails}` : ""}`
            )
          }
        } catch (cleanupErr) {
          // Log but don't fail the deletion if sandbox cleanup fails
          console.warn("[ChatStorage] Failed to cleanup sandbox:", cleanupErr)
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
   * Save messages for a chat
   */
  const saveChatAllMessages = useCallback(
    async (chatId: string, messages: UIMessage[], _isNewChat = false): Promise<void> => {
      try {
        console.log("[ChatStorage] Saving messages:", messages.length)
        messages.forEach((msg, idx) => {
          if (msg.role === "assistant" && msg.metadata) {
            console.log(`[ChatStorage] Message ${idx} metadata before save:`, msg.metadata)
          }
        })
        await commitChatContext(
          chatId,
          messages,
          messages.map(message => message.id)
        )

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
   * Load messages for a chat
   */
  const loadMessages = useCallback(async (chatId: string): Promise<UIMessage[]> => {
    try {
      const db = await getDatabase()
      const result = await db.select<MessageRow[]>(
        "SELECT * FROM messages WHERE chat_id = ? AND active = 1 ORDER BY ordinal ASC, created_at ASC, rowid ASC",
        [chatId]
      )

      const messages = result.map(row => storedMessageToUI(row))
      console.log("[ChatStorage] Loaded messages:", chatId, messages.length, messages)

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
    loadMessages,
    switchChat,
    loadChats
  }
}
