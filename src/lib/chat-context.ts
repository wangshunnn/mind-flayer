import { invoke } from "@tauri-apps/api/core"
import type { UIMessage } from "ai"
import type { ContextState, ContextUsage } from "../../shared/context"
import { contextStateSchema, contextUsageSchema, emptyContextState } from "../../shared/context"
import { getContextUsageForModel, resolveConversationContextUsage } from "./context-window-usage"
import { getDatabase } from "./database"
import type { UsageMessage } from "./session-usage"

const saves = new Map<string, Promise<void>>()

/** Translate internal failure codes at the UI boundary, keeping diagnostics out of toasts. */
export function getContextErrorKey(message: string): "failed" | "tooLarge" | "busy" | undefined {
  if (message.includes("COMPACTION_FAILED")) {
    return "failed"
  }
  if (message.includes("CONTEXT_TOO_LARGE")) {
    return "tooLarge"
  }
  if (message.includes("CONVERSATION_BUSY")) {
    return "busy"
  }
  return undefined
}

export interface ContextInspectionSnapshot {
  chatId: string
  messages: UIMessage[]
  contextState: ContextState
  status: string
  hydrated: boolean
  compacting: boolean
  headers: Record<string, string>
}

/** Read-only backfill for display. Ignore results if the conversation changed in flight. */
export async function estimateMissingChatUsage(
  api: string,
  getSnapshot: () => ContextInspectionSnapshot,
  signal: AbortSignal
): Promise<ContextUsage | undefined> {
  const source = getSnapshot()
  const idle = (snapshot: ContextInspectionSnapshot) =>
    snapshot.hydrated && !snapshot.compacting && ["ready", "error"].includes(snapshot.status)
  if (
    signal.aborted ||
    !idle(source) ||
    source.messages.length === 0 ||
    getContextUsageForModel(
      resolveConversationContextUsage(source.messages, source.contextState),
      source.headers["X-Model-Provider"],
      source.headers["X-Model-Id"]
    )?.breakdown
  ) {
    return undefined
  }
  const response = await fetch(`${api}/context-usage`, {
    method: "POST",
    headers: { ...source.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: source.chatId,
      messages: source.messages,
      contextState: source.contextState
    }),
    signal
  })
  if (!response.ok) {
    throw new Error(`Context inspection failed (${response.status})`)
  }
  const result = await response.json()
  const usage = contextUsageSchema.parse(result.usage)
  const current = getSnapshot()
  if (
    // An older sidecar cannot backfill composition; do not trigger a refetch loop.
    !usage.breakdown ||
    signal.aborted ||
    !idle(current) ||
    current.chatId !== source.chatId ||
    current.messages !== source.messages ||
    current.contextState !== source.contextState ||
    JSON.stringify(current.headers) !== JSON.stringify(source.headers)
  ) {
    return undefined
  }
  return usage
}

export function commitChatContext(
  chatId: string,
  messages: UIMessage[],
  messageIds: string[],
  contextState?: ContextState
): Promise<void> {
  const payload = structuredClone({ chatId, messages, messageIds, contextState })
  const previous = saves.get(chatId) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await getDatabase()
      await invoke("commit_chat_context", { payload })
    })
  saves.set(chatId, next)
  void next
    .finally(() => {
      if (saves.get(chatId) === next) {
        saves.delete(chatId)
      }
    })
    .catch(() => undefined)
  return next
}

export async function waitForChatCommit(chatId: string): Promise<void> {
  await saves.get(chatId)
}

export async function loadChatContext(chatId: string): Promise<ContextState> {
  await waitForChatCommit(chatId)
  const db = await getDatabase()
  const [events, usage] = await Promise.all([
    db.select<{ content_json: string }[]>(
      "SELECT content_json FROM chat_context_events WHERE chat_id = ? ORDER BY rowid",
      [chatId]
    ),
    db.select<{ content_json: string }[]>(
      "SELECT content_json FROM chat_context_usage WHERE chat_id = ?",
      [chatId]
    )
  ])
  const state = contextStateSchema.safeParse({
    ...emptyContextState(),
    events: events.map(row => JSON.parse(row.content_json)),
    usage: usage[0] ? (JSON.parse(usage[0].content_json) ?? undefined) : undefined
  })
  if (!state.success) {
    throw new Error("Invalid persisted conversation context")
  }
  return state.data
}

/** Include inactive replies: regeneration changes the view, not the incurred usage. */
export async function loadChatUsage(chatId: string): Promise<UsageMessage[]> {
  await waitForChatCommit(chatId)
  const db = await getDatabase()
  const rows = await db.select<
    { id: string; role: "user" | "assistant"; metadata: string | null; step_start_count: number }[]
  >(
    `SELECT id, role, json_extract(content_json, '$.metadata') AS metadata,
      (SELECT COUNT(*) FROM json_each(json_extract(content_json, '$.parts'))
        WHERE json_extract(value, '$.type') = 'step-start') AS step_start_count
      FROM messages WHERE chat_id = ? AND role IN ('user', 'assistant') ORDER BY created_at ASC, rowid ASC`,
    [chatId]
  )
  return rows.map(row => ({
    id: row.id,
    role: row.role,
    stepStartCount: row.step_start_count,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  }))
}
