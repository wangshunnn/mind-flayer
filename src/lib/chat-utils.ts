import type { UIMessage } from "ai"
import type { ChatId, MessageRow, StoredMessage } from "@/types/chat"

/**
 * Convert UIMessage to StoredMessage
 */
export function uiMessageToStored(message: UIMessage, chatId: ChatId): StoredMessage {
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
  const maxLength = 20
  const trimmed = firstMessage.trim()

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.substring(0, maxLength)}...`
}
