import type { UIMessage } from "ai"

/**
 * Chat conversation interface
 */
export interface Chat {
  id: string
  title: string
  created_at: number // Unix timestamp in milliseconds
  updated_at: number // Unix timestamp in milliseconds
}

/**
 * Stored message interface (for database)
 */
export interface StoredMessage {
  id: string
  chat_id: string
  role: "user" | "assistant" | "system"
  content_json: string // JSON stringified UIMessage
  created_at: number // Unix timestamp in milliseconds
}

/**
 * Database chat row interface
 */
export interface ChatRow {
  id: string
  title: string
  created_at: number
  updated_at: number
}

/**
 * Database message row interface
 */
export interface MessageRow {
  id: string
  chat_id: string
  role: string
  content_json: string
  created_at: number
}

/**
 * Convert UIMessage to StoredMessage
 */
export function uiMessageToStored(message: UIMessage, chatId: string): StoredMessage {
  return {
    id: message.id,
    chat_id: chatId,
    role: message.role as "user" | "assistant" | "system",
    content_json: JSON.stringify(message),
    created_at: Date.now()
  }
}

/**
 * Convert StoredMessage to UIMessage
 */
export function storedMessageToUI(stored: MessageRow): UIMessage {
  return JSON.parse(stored.content_json) as UIMessage
}

/**
 * Generate chat title from first user message
 */
export function generateChatTitle(firstMessage: string): string {
  const maxLength = 30
  const trimmed = firstMessage.trim()

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.substring(0, maxLength)}...`
}
