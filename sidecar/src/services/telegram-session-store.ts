import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import type { UIMessage } from "ai"
import { z } from "zod"

const APP_SUPPORT_DIR_ENV_KEY = "MINDFLAYER_APP_SUPPORT_DIR"
const CHANNELS_DIR_NAME = "channels"
const TELEGRAM_SESSIONS_FILE_NAME = "telegram-sessions.json"
const TELEGRAM_SESSION_STORE_VERSION = 1

const persistedTextPartSchema = z
  .object({
    type: z.literal("text"),
    text: z.string()
  })
  .passthrough()

const persistedMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant"]),
    parts: z.array(persistedTextPartSchema).min(1),
    metadata: z.object({}).passthrough().optional()
  })
  .passthrough()

const persistedTelegramSessionSchema = z.object({
  sessionKey: z.string().min(1),
  chatId: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  messages: z
    .array(persistedMessageSchema)
    .transform(messages => messages as unknown as UIMessage[])
})

const persistedTelegramSessionStateSchema = z.object({
  version: z.literal(TELEGRAM_SESSION_STORE_VERSION),
  sessions: z.array(persistedTelegramSessionSchema),
  activeSessionKeyByChatId: z.record(z.string(), z.string())
})

export interface PersistedTelegramSession {
  sessionKey: string
  chatId: string
  startedAt: number
  updatedAt: number
  messages: UIMessage[]
}

export interface TelegramSessionStoreSnapshot {
  sessions: PersistedTelegramSession[]
  activeSessionKeyByChatId: Record<string, string>
}

export interface TelegramSessionStore {
  load(): Promise<TelegramSessionStoreSnapshot>
  save(snapshot: TelegramSessionStoreSnapshot): Promise<void>
}

const EMPTY_SNAPSHOT: TelegramSessionStoreSnapshot = {
  sessions: [],
  activeSessionKeyByChatId: {}
}

function cloneSnapshot(snapshot: TelegramSessionStoreSnapshot): TelegramSessionStoreSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as TelegramSessionStoreSnapshot
}

function normalizeSnapshot(snapshot: TelegramSessionStoreSnapshot): TelegramSessionStoreSnapshot {
  const sessionsByKey = new Map<string, PersistedTelegramSession>()

  for (const session of snapshot.sessions) {
    sessionsByKey.set(session.sessionKey, {
      sessionKey: session.sessionKey,
      chatId: session.chatId,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      messages: JSON.parse(JSON.stringify(session.messages)) as UIMessage[]
    })
  }

  const activeSessionKeyByChatId = Object.fromEntries(
    Object.entries(snapshot.activeSessionKeyByChatId).filter(([, sessionKey]) =>
      sessionsByKey.has(sessionKey)
    )
  )

  return {
    sessions: [...sessionsByKey.values()],
    activeSessionKeyByChatId
  }
}

export class FileTelegramSessionStore implements TelegramSessionStore {
  private saveChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<TelegramSessionStoreSnapshot> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as unknown
      const result = persistedTelegramSessionStateSchema.safeParse(parsed)

      if (!result.success) {
        console.warn(
          `[TelegramSessionStore] Invalid persisted state at '${this.filePath}', starting with an empty store.`
        )
        return cloneSnapshot(EMPTY_SNAPSHOT)
      }

      return normalizeSnapshot({
        sessions: result.data.sessions,
        activeSessionKeyByChatId: result.data.activeSessionKeyByChatId
      })
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException | undefined)?.code
      if (errorCode === "ENOENT") {
        return cloneSnapshot(EMPTY_SNAPSHOT)
      }

      if (error instanceof SyntaxError) {
        console.warn(
          `[TelegramSessionStore] Failed to parse persisted state from '${this.filePath}', starting with an empty store.`
        )
        return cloneSnapshot(EMPTY_SNAPSHOT)
      }

      console.error(
        `[TelegramSessionStore] Failed to load persisted state from '${this.filePath}': ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      throw error
    }
  }

  save(snapshot: TelegramSessionStoreSnapshot): Promise<void> {
    const nextSnapshot = normalizeSnapshot(cloneSnapshot(snapshot))

    const writeTask = this.saveChain
      .catch(() => undefined)
      .then(async () => {
        await this.writeSnapshot(nextSnapshot)
      })

    this.saveChain = writeTask
    return writeTask
  }

  private async writeSnapshot(snapshot: TelegramSessionStoreSnapshot): Promise<void> {
    const directoryPath = dirname(this.filePath)
    await mkdir(directoryPath, { recursive: true })

    const tempPath = `${this.filePath}.${randomUUID()}.tmp`
    const payload = JSON.stringify(
      {
        version: TELEGRAM_SESSION_STORE_VERSION,
        sessions: snapshot.sessions,
        activeSessionKeyByChatId: snapshot.activeSessionKeyByChatId
      },
      null,
      2
    )

    await writeFile(tempPath, payload, "utf8")
    await rename(tempPath, this.filePath)
  }
}

export function createTelegramSessionStoreFromEnv(): TelegramSessionStore | null {
  const appSupportDir = process.env[APP_SUPPORT_DIR_ENV_KEY]
  if (!appSupportDir) {
    return null
  }

  const filePath = resolve(join(appSupportDir, CHANNELS_DIR_NAME, TELEGRAM_SESSIONS_FILE_NAME))
  return new FileTelegramSessionStore(filePath)
}
