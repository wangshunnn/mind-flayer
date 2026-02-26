export type ChatId = string
export type MessageId = string

/**
 * Chat conversation interface
 */
export interface Chat {
  id: ChatId
  title: string
  created_at: number // Unix timestamp in milliseconds
  updated_at: number // Unix timestamp in milliseconds
}

/**
 * Stored message interface (for database)
 */
export interface StoredMessage {
  id: MessageId
  chat_id: ChatId
  role: "user" | "assistant" | "system"
  content_json: string // JSON stringified UIMessage
  created_at: number // Unix timestamp in milliseconds
}

/**
 * Database chat row interface
 */
export interface ChatRow {
  id: ChatId
  title: string
  created_at: number
  updated_at: number
}

/**
 * Database message row interface
 */
export interface MessageRow {
  id: MessageId
  chat_id: ChatId
  role: string
  content_json: string
  created_at: number
}
