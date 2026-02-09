import type { UIMessage } from "ai"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useState } from "react"
import { getDatabase } from "@/lib/database"
import { getSidecarUrl } from "@/lib/sidecar-client"
import type { Chat, ChatId, ChatRow, MessageRow } from "@/types/chat"
import { generateChatTitle, storedMessageToUI, uiMessageToStored } from "@/types/chat"

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
    async (title?: string): Promise<ChatId> => {
      try {
        console.log("[ChatStorage] Creating new chat...", title)
        const now = Date.now()
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
        setActiveChatId(newChat.id)
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
        const db = await getDatabase()
        const now = Date.now()
        await db.execute("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?", [
          title,
          now,
          chatId
        ])

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

        await db.execute("DELETE FROM messages WHERE chat_id = ?", [chatId])
        await db.execute("DELETE FROM chats WHERE id = ?", [chatId])

        // Clean up localStorage for stored message IDs
        const storageKey = `stored-messages-${chatId}`
        localStorage.removeItem(storageKey)

        // Clean up bash execution workspace via sidecar
        try {
          const cleanupUrl = await getSidecarUrl("/api/cleanup-workspace")
          await fetch(cleanupUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId })
          })
        } catch (cleanupErr) {
          // Log but don't fail the deletion if workspace cleanup fails
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
   * Save messages for a chat
   */
  const saveChatAllMessages = useCallback(
    async (chatId: string, messages: UIMessage[], isNewChat = false): Promise<void> => {
      try {
        console.log("[ChatStorage] Saving messages:", messages.length)
        messages.forEach((msg, idx) => {
          if (msg.role === "assistant" && msg.metadata) {
            console.log(`[ChatStorage] Message ${idx} metadata before save:`, msg.metadata)
          }
        })
        const db = await getDatabase()

        await db.execute("DELETE FROM messages WHERE chat_id = ?", [chatId])

        for (const message of messages) {
          const storedMessage = uiMessageToStored(message, chatId)
          await db.execute(
            "INSERT INTO messages (id, chat_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)",
            [
              storedMessage.id,
              storedMessage.chat_id,
              storedMessage.role,
              storedMessage.content_json,
              storedMessage.created_at
            ]
          )
        }

        await db.execute("UPDATE chats SET updated_at = ? WHERE id = ?", [Date.now(), chatId])

        if (isNewChat && messages[0].role === "user") {
          const firstMessageText = messages[0].parts
            .filter(part => part.type === "text")
            .map(part => ("text" in part ? part.text : ""))
            .join(" ")

          if (firstMessageText) {
            const title = generateChatTitle(firstMessageText)
            await updateChatTitle(chatId, title)
          }
        }

        await loadChats()
        setError(null)
      } catch (err) {
        console.error("Failed to save messages:", err)
        const error = err instanceof Error ? err : new Error("Failed to save messages")
        setError(error)
        throw error
      }
    },
    [loadChats, updateChatTitle]
  )

  /**
   * Insert only new messages for a chat (incremental save)
   * This is more efficient than saveMessages as it only inserts new messages
   */
  const insertChatNewMessages = useCallback(
    async (chatId: string, newMessages: UIMessage[], totalMessageCount: number): Promise<void> => {
      try {
        if (newMessages.length === 0) {
          return
        }

        console.log("[ChatStorage] Inserting new messages:", newMessages.length)
        const db = await getDatabase()

        for (const message of newMessages) {
          const storedMessage = uiMessageToStored(message, chatId)
          await db.execute(
            "INSERT OR IGNORE INTO messages (id, chat_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)",
            [
              storedMessage.id,
              storedMessage.chat_id,
              storedMessage.role,
              storedMessage.content_json,
              storedMessage.created_at
            ]
          )
        }

        await db.execute("UPDATE chats SET updated_at = ? WHERE id = ?", [Date.now(), chatId])

        if (totalMessageCount <= 2) {
          const firstUserMessage = newMessages.find(msg => msg.role === "user")
          if (firstUserMessage) {
            const firstMessageText = firstUserMessage.parts
              .filter(part => part.type === "text")
              .map(part => ("text" in part ? part.text : ""))
              .join(" ")

            if (firstMessageText) {
              const title = generateChatTitle(firstMessageText)
              await updateChatTitle(chatId, title)
            }
          }
        }

        await loadChats()
        setError(null)
      } catch (err) {
        console.error("Failed to insert new messages:", err)
        const error = err instanceof Error ? err : new Error("Failed to insert new messages")
        setError(error)
        throw error
      }
    },
    [loadChats, updateChatTitle]
  )

  /**
   * Load messages for a chat
   */
  const loadMessages = useCallback(async (chatId: string): Promise<UIMessage[]> => {
    try {
      const db = await getDatabase()
      const result = await db.select<MessageRow[]>(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC",
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
    insertChatNewMessages,
    loadMessages,
    switchChat,
    loadChats
  }
}
