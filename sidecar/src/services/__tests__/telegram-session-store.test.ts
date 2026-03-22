import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  FileTelegramSessionStore,
  type TelegramSessionStoreSnapshot
} from "../telegram-session-store"

describe("FileTelegramSessionStore", () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop()
      if (!tempDir) {
        continue
      }

      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it("saves and reloads session snapshots", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-store-"))
    tempDirs.push(tempDir)

    const store = new FileTelegramSessionStore(join(tempDir, "telegram-sessions.json"))
    const snapshot: TelegramSessionStoreSnapshot = {
      sessions: [
        {
          sessionKey: "telegram:1001:session-a",
          chatId: "1001",
          startedAt: 10,
          updatedAt: 20,
          messages: [
            {
              id: "message-1",
              role: "user",
              parts: [{ type: "text", text: "hello" }]
            }
          ]
        }
      ],
      activeSessionKeyByChatId: {
        "1001": "telegram:1001:session-a"
      }
    }

    await store.save(snapshot)
    const loaded = await store.load()

    expect(loaded).toEqual(snapshot)
  })

  it("falls back to an empty snapshot when the file is invalid", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-store-"))
    tempDirs.push(tempDir)

    const filePath = join(tempDir, "telegram-sessions.json")
    await writeFile(filePath, "{not-json", "utf8")

    const store = new FileTelegramSessionStore(filePath)
    const loaded = await store.load()

    expect(loaded).toEqual({
      sessions: [],
      activeSessionKeyByChatId: {}
    })
  })

  it("falls back to an empty snapshot when persisted messages have an invalid shape", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-store-"))
    tempDirs.push(tempDir)

    const filePath = join(tempDir, "telegram-sessions.json")
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        sessions: [
          {
            sessionKey: "telegram:1001:session-a",
            chatId: "1001",
            startedAt: 10,
            updatedAt: 20,
            messages: [{}]
          }
        ],
        activeSessionKeyByChatId: {
          "1001": "telegram:1001:session-a"
        }
      }),
      "utf8"
    )

    const store = new FileTelegramSessionStore(filePath)
    const loaded = await store.load()

    expect(loaded).toEqual({
      sessions: [],
      activeSessionKeyByChatId: {}
    })
  })
})
