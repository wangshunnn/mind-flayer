import type { LanguageModelUsage, UIMessage } from "ai"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import { ConflictError, NotFoundError } from "../../utils/http-errors"
import {
  handleDeleteTelegramChannelSession,
  handleTelegramChannelSessionMessages,
  handleTelegramChannelSessions
} from "../channel-telegram-sessions"

const createTextMessage = (id: string, role: "user" | "assistant", text: string): UIMessage =>
  ({
    id,
    role,
    parts: [{ type: "text", text }]
  }) as UIMessage

const usage: LanguageModelUsage = {
  inputTokens: 100,
  outputTokens: 20,
  totalTokens: 120
} as LanguageModelUsage

describe("Telegram channel session routes", () => {
  it("returns sessions from TelegramBotService", async () => {
    const app = new Hono()
    const telegramBotService = {
      listSessions: vi.fn(() => [
        {
          sessionKey: "telegram:thread-2:session-b",
          sessionId: "session-b",
          chatId: "thread-2",
          isActive: true,
          startedAt: 150,
          updatedAt: 200,
          messageCount: 3,
          firstMessagePreview: "first",
          lastMessageRole: "assistant",
          lastMessagePreview: "latest",
          latestAssistantUsage: usage,
          latestModelProvider: "openai",
          latestModelId: "gpt-5.4"
        },
        {
          sessionKey: "telegram:thread-1:session-a",
          sessionId: "session-a",
          chatId: "thread-1",
          isActive: false,
          startedAt: 90,
          updatedAt: 100,
          messageCount: 2,
          firstMessagePreview: "hello",
          lastMessageRole: "user",
          lastMessagePreview: "hello"
        }
      ])
    }

    app.get("/api/channels/telegram/sessions", c =>
      handleTelegramChannelSessions(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/sessions")
    expect(res.status).toBe(200)

    const payload = (await res.json()) as {
      success: boolean
      sessions: Array<{
        sessionKey: string
        sessionId: string
        isActive: boolean
        startedAt: number
        updatedAt: number
        firstMessagePreview: string
        latestAssistantUsage?: LanguageModelUsage
      }>
    }

    expect(payload.success).toBe(true)
    expect(payload.sessions).toHaveLength(2)
    expect(payload.sessions[0]?.sessionKey).toBe("telegram:thread-2:session-b")
    expect(payload.sessions[0]?.sessionId).toBe("session-b")
    expect(payload.sessions[0]?.isActive).toBe(true)
    expect(payload.sessions[0]?.startedAt).toBe(150)
    expect(payload.sessions[0]?.updatedAt).toBe(200)
    expect(payload.sessions[0]?.firstMessagePreview).toBe("first")
    expect(payload.sessions[0]?.latestAssistantUsage).toEqual(usage)
  })

  it("returns 400 when sessionKey query is missing", async () => {
    const app = new Hono()
    const telegramBotService = {
      getSessionMessages: vi.fn()
    }

    app.get("/api/channels/telegram/session-messages", c =>
      handleTelegramChannelSessionMessages(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/session-messages")
    expect(res.status).toBe(400)

    const payload = (await res.json()) as { error: string; code: string }
    expect(payload.code).toBe("BAD_REQUEST")
  })

  it("returns 404 when session does not exist", async () => {
    const app = new Hono()
    const telegramBotService = {
      getSessionMessages: vi.fn(() => null)
    }

    app.get("/api/channels/telegram/session-messages", c =>
      handleTelegramChannelSessionMessages(c, telegramBotService as never)
    )

    const res = await app.request(
      "/api/channels/telegram/session-messages?sessionKey=telegram%3Amissing"
    )
    expect(res.status).toBe(404)

    const payload = (await res.json()) as { error: string; code: string }
    expect(payload.code).toBe("NOT_FOUND")
  })

  it("returns messages for an existing session", async () => {
    const app = new Hono()
    const messages = [
      createTextMessage("u1", "user", "hello"),
      createTextMessage("a1", "assistant", "world")
    ]
    const telegramBotService = {
      getSessionMessages: vi.fn(() => messages)
    }

    app.get("/api/channels/telegram/session-messages", c =>
      handleTelegramChannelSessionMessages(c, telegramBotService as never)
    )

    const res = await app.request(
      "/api/channels/telegram/session-messages?sessionKey=telegram%3Athread-1"
    )
    expect(res.status).toBe(200)

    const payload = (await res.json()) as {
      success: boolean
      sessionKey: string
      messages: UIMessage[]
    }

    expect(payload.success).toBe(true)
    expect(payload.sessionKey).toBe("telegram:thread-1")
    expect(payload.messages).toHaveLength(2)
    expect(payload.messages[1]?.role).toBe("assistant")
  })

  it("deletes an archived session", async () => {
    const app = new Hono()
    const telegramBotService = {
      deleteSession: vi.fn(async () => undefined)
    }

    app.delete("/api/channels/telegram/sessions", c =>
      handleDeleteTelegramChannelSession(c, telegramBotService as never)
    )

    const res = await app.request(
      "/api/channels/telegram/sessions?sessionKey=telegram%3Athread-1%3Asession-a",
      {
        method: "DELETE"
      }
    )

    expect(res.status).toBe(200)
    expect(telegramBotService.deleteSession).toHaveBeenCalledWith("telegram:thread-1:session-a")

    const payload = (await res.json()) as {
      success: boolean
      deletedSessionKey: string
    }

    expect(payload.success).toBe(true)
    expect(payload.deletedSessionKey).toBe("telegram:thread-1:session-a")
  })

  it("returns 404 when deleting a missing session", async () => {
    const app = new Hono()
    const telegramBotService = {
      deleteSession: vi.fn(async () => {
        throw new NotFoundError("Telegram session not found")
      })
    }

    app.delete("/api/channels/telegram/sessions", c =>
      handleDeleteTelegramChannelSession(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/sessions?sessionKey=telegram%3Amissing", {
      method: "DELETE"
    })

    expect(res.status).toBe(404)

    const payload = (await res.json()) as { error: string; code: string }
    expect(payload.code).toBe("NOT_FOUND")
  })

  it("returns 409 when deleting an active session", async () => {
    const app = new Hono()
    const telegramBotService = {
      deleteSession: vi.fn(async () => {
        throw new ConflictError("Active Telegram sessions cannot be deleted")
      })
    }

    app.delete("/api/channels/telegram/sessions", c =>
      handleDeleteTelegramChannelSession(c, telegramBotService as never)
    )

    const res = await app.request("/api/channels/telegram/sessions?sessionKey=telegram%3Aactive", {
      method: "DELETE"
    })

    expect(res.status).toBe(409)

    const payload = (await res.json()) as { error: string; code: string }
    expect(payload.code).toBe("CONFLICT")
  })
})
