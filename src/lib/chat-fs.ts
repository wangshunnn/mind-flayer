/**
 * JSONL-based chat storage utilities using Tauri fs plugin.
 *
 * Layout (all under BaseDirectory.AppData):
 *   chats/index.json        – JSON array of Chat metadata, sorted by updated_at DESC
 *   chats/{chatId}.jsonl    – one UIMessage JSON object per line
 */

import type { UIMessage } from "ai"
import { BaseDirectory, exists, mkdir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs"
import type { Chat, ChatId } from "@/types/chat"

const CHATS_DIR = "chats"
const INDEX_FILE = "chats/index.json"

async function ensureChatsDir(): Promise<void> {
  const dirExists = await exists(CHATS_DIR, { baseDir: BaseDirectory.AppData })
  if (!dirExists) {
    await mkdir(CHATS_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
  }
}

/** Read the chat index (sorted by updated_at DESC). Returns [] if file missing. */
export async function readIndex(): Promise<Chat[]> {
  await ensureChatsDir()
  const fileExists = await exists(INDEX_FILE, { baseDir: BaseDirectory.AppData })
  if (!fileExists) {
    return []
  }
  const text = await readTextFile(INDEX_FILE, { baseDir: BaseDirectory.AppData })
  return JSON.parse(text) as Chat[]
}

/** Persist the chat index (caller is responsible for sort order). */
async function writeIndex(chats: Chat[]): Promise<void> {
  await ensureChatsDir()
  await writeTextFile(INDEX_FILE, JSON.stringify(chats), { baseDir: BaseDirectory.AppData })
}

/** Create a new chat entry in the index. */
export async function createChatEntry(chat: Chat): Promise<void> {
  const chats = await readIndex()
  chats.unshift(chat) // newest first
  await writeIndex(chats)
}

/** Update an existing chat entry (title / updated_at). */
export async function updateChatEntry(chatId: ChatId, updates: Partial<Chat>): Promise<void> {
  const chats = await readIndex()
  const idx = chats.findIndex(c => c.id === chatId)
  if (idx === -1) return
  chats[idx] = { ...chats[idx], ...updates }
  // Re-sort by updated_at DESC
  chats.sort((a, b) => b.updated_at - a.updated_at)
  await writeIndex(chats)
}

/** Remove a chat from the index and delete its message file. */
export async function deleteChatEntry(chatId: ChatId): Promise<void> {
  const chats = await readIndex()
  const filtered = chats.filter(c => c.id !== chatId)
  await writeIndex(filtered)

  const msgFile = `${CHATS_DIR}/${chatId}.jsonl`
  const fileExists = await exists(msgFile, { baseDir: BaseDirectory.AppData })
  if (fileExists) {
    await remove(msgFile, { baseDir: BaseDirectory.AppData })
  }
}

/** Write all messages for a chat (replaces existing file). */
export async function writeChatMessages(chatId: ChatId, messages: UIMessage[]): Promise<void> {
  await ensureChatsDir()
  const lines = messages.map(m => JSON.stringify(m)).join("\n")
  await writeTextFile(`${CHATS_DIR}/${chatId}.jsonl`, lines, { baseDir: BaseDirectory.AppData })
}

/** Read all messages for a chat. Returns [] if file missing. */
export async function readChatMessages(chatId: ChatId): Promise<UIMessage[]> {
  await ensureChatsDir()
  const msgFile = `${CHATS_DIR}/${chatId}.jsonl`
  const fileExists = await exists(msgFile, { baseDir: BaseDirectory.AppData })
  if (!fileExists) {
    return []
  }
  const text = await readTextFile(msgFile, { baseDir: BaseDirectory.AppData })
  if (!text.trim()) return []
  return text
    .split("\n")
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as UIMessage)
}
