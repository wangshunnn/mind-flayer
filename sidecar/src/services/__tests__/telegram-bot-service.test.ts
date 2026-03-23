import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const streamTextMock = vi.fn()
const compactMessagesMock = vi.fn()
const buildSystemPromptMock = vi.fn()
const discoverSkillsSafelyMock = vi.fn()
const buildToolChoiceMock = vi.fn()

vi.mock("ai", () => ({
  stepCountIs: vi.fn((value: number) => value),
  streamText: (...args: unknown[]) => streamTextMock(...args)
}))

vi.mock("../../utils/message-compaction", () => ({
  compactMessages: (...args: unknown[]) => compactMessagesMock(...args)
}))

vi.mock("../../utils/system-prompt-builder", async importOriginal => {
  const actual = await importOriginal<typeof import("../../utils/system-prompt-builder")>()
  return {
    ...actual,
    buildSystemPrompt: (...args: unknown[]) => buildSystemPromptMock(...args)
  }
})

vi.mock("../../skills/catalog", async importOriginal => {
  const actual = await importOriginal<typeof import("../../skills/catalog")>()
  return {
    ...actual,
    discoverSkillsSafely: (...args: unknown[]) => discoverSkillsSafelyMock(...args)
  }
})

vi.mock("../../utils/tool-choice", () => ({
  buildToolChoice: (...args: unknown[]) => buildToolChoiceMock(...args)
}))

import { ConflictError } from "../../utils/http-errors"
import * as telegramMediaMessageModule from "../../utils/telegram-media-message"
import { toTelegramHtml } from "../../utils/telegram-rich-text"
import { ChannelRuntimeConfigService } from "../channel-runtime-config-service"
import { TelegramBotService } from "../telegram-bot-service"
import { FileTelegramSessionStore } from "../telegram-session-store"

function createTextStream(text: string): AsyncIterable<string> {
  return (async function* () {
    yield text
  })()
}

function createDelayedTextStream(delayMs: number, text: string): AsyncIterable<string> {
  return (async function* () {
    await new Promise<void>(resolve => {
      setTimeout(resolve, delayMs)
    })
    yield text
  })()
}

const telegramApiSuccess = (result: unknown = { message_id: 1 }) =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        ok: true,
        result
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  )

const telegramApiFailure = (status: number, description: string) =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        ok: false,
        description
      }),
      {
        status,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  )

function getMockCallBody(call: readonly unknown[] | undefined): unknown {
  if (!call || call.length < 2) {
    return undefined
  }

  const options = call[1]
  if (!options || typeof options !== "object") {
    return undefined
  }

  return (options as { body?: unknown }).body
}

function parseMockCallJsonBody<T>(call: readonly unknown[] | undefined): T {
  const body = getMockCallBody(call)
  if (typeof body !== "string") {
    throw new Error("Expected JSON body string in fetch mock call")
  }

  return JSON.parse(body) as T
}

function findSessionSummaryByChatId(service: TelegramBotService, chatId: string) {
  return service.listSessions().find(session => session.chatId === chatId)
}

describe("TelegramBotService", () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()

    compactMessagesMock.mockImplementation(async (messages: unknown) => messages)
    buildSystemPromptMock.mockReturnValue("system prompt")
    discoverSkillsSafelyMock.mockResolvedValue([])
    buildToolChoiceMock.mockReturnValue("auto")
  })

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop()
      if (!tempDir) {
        continue
      }

      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it("queues whitelist request from callback and supports decision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => telegramApiSuccess(true))
    )

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: []
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleCallbackQuery: (
          botToken: string,
          apiBaseUrl: string,
          callback: unknown
        ) => Promise<void>
      }
    ).handleCallbackQuery("token", "https://api.telegram.org", {
      id: "callback-1",
      data: "mf_join_request_v1",
      from: {
        id: 42,
        is_bot: false,
        username: "tester",
        first_name: "Test"
      },
      message: {
        message_id: 1,
        chat: {
          id: 42,
          type: "private"
        },
        text: "please approve"
      }
    })

    const requests = service.listWhitelistRequests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.requestId).toBe("42")

    const decided = await service.decideWhitelistRequest("42", "approve")
    expect(decided?.requestId).toBe("42")
    expect(service.listWhitelistRequests()).toHaveLength(0)
  })

  it("sends whitelist join button for unauthorized private message", async () => {
    const fetchMock = vi.fn((url: string) => {
      void url
      return telegramApiSuccess(true)
    })
    vi.stubGlobal("fetch", fetchMock)

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn(() => ({ apiKey: "tg-token", baseUrl: "https://api.telegram.org" }))
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: []
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 100,
      chat: {
        id: 99,
        type: "private"
      },
      from: {
        id: 99,
        is_bot: false
      },
      text: "hello"
    })

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, { body?: string } | undefined]
    const firstCallBody = JSON.parse(String(firstCall?.[1]?.body)) as {
      reply_markup?: { inline_keyboard?: Array<Array<{ callback_data?: string }>> }
    }

    expect(firstCallBody.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data).toBe(
      "mf_join_request_v1"
    )
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/sendChatAction"))).toBe(
      false
    )
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it("uses latest unauthorized user message as whitelist request preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => telegramApiSuccess(true))
    )

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: []
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 88,
      chat: {
        id: 42,
        type: "private"
      },
      from: {
        id: 42,
        is_bot: false
      },
      text: "please approve me"
    })

    await (
      service as unknown as {
        handleCallbackQuery: (
          botToken: string,
          apiBaseUrl: string,
          callback: unknown
        ) => Promise<void>
      }
    ).handleCallbackQuery("token", "https://api.telegram.org", {
      id: "callback-2",
      data: "mf_join_request_v1",
      from: {
        id: 42,
        is_bot: false
      },
      message: {
        message_id: 89,
        chat: {
          id: 42,
          type: "private"
        },
        text: "You are not authorized yet. Request access below."
      }
    })

    const requests = service.listWhitelistRequests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.lastMessagePreview).toBe("please approve me")
  })

  it("starts typing immediately after reply eligibility", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendChatAction")) {
        return telegramApiSuccess(true)
      }
      if (url.includes("/sendMessageDraft")) {
        return telegramApiSuccess(true)
      }
      return telegramApiSuccess({ message_id: 31 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Assistant reply")
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["3001"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 120,
      chat: {
        id: 3001,
        type: "private"
      },
      from: {
        id: 3001,
        is_bot: false
      },
      text: "hello"
    })

    const getActionFromCall = (call: readonly unknown[]) => {
      const options = call[1]
      if (!options || typeof options !== "object") {
        return null
      }
      const body = (options as { body?: unknown }).body
      if (typeof body !== "string") {
        return null
      }
      return (JSON.parse(body) as { action?: string }).action ?? null
    }

    const typingIndex = fetchMock.mock.calls.findIndex(call => {
      const url = String(call[0])
      return url.includes("/sendChatAction") && getActionFromCall(call) === "typing"
    })
    const draftIndex = fetchMock.mock.calls.findIndex(call =>
      String(call[0]).includes("/sendMessageDraft")
    )

    expect(typingIndex).toBeGreaterThanOrEqual(0)
    expect(draftIndex).toBeGreaterThanOrEqual(0)
    expect(typingIndex).toBeLessThan(draftIndex)
  })

  it("processes whitelisted messages and stores session history", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 7 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Assistant reply")
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["1001"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 100,
      chat: {
        id: 1001,
        type: "private"
      },
      from: {
        id: 1001,
        is_bot: false
      },
      text: "hello"
    })

    expect(buildSystemPromptMock).toHaveBeenCalledWith({
      modelProvider: "minimax",
      modelProviderLabel: "MiniMax",
      modelId: "model-a",
      modelLabel: "MiniMax-M2.5",
      channel: "telegram",
      skills: []
    })

    const sessions = service.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.sessionKey).toMatch(/^telegram:1001:/)
    expect(sessions[0]?.sessionId).toBeTruthy()
    expect(sessions[0]?.isActive).toBe(true)
    expect(sessions[0]?.startedAt).toBeGreaterThan(0)
    expect(sessions[0]?.firstMessagePreview).toBe("hello")

    const storedMessages = service.getSessionMessages(String(sessions[0]?.sessionKey))
    expect(storedMessages).toHaveLength(2)
    expect(storedMessages?.[1]?.role).toBe("assistant")

    // sendMessageDraft failed once (404) then fallback to final sendMessage only
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/sendMessageDraft"))).toBe(
      true
    )
  })

  it("creates a fresh active session for /new without storing the command", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 91 })
    })
    vi.stubGlobal("fetch", fetchMock)

    let streamCallCount = 0
    streamTextMock.mockImplementation(() => {
      streamCallCount += 1
      return {
        textStream: createTextStream(`Assistant reply ${streamCallCount}`)
      }
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["4001"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 201,
      chat: {
        id: 4001,
        type: "private"
      },
      from: {
        id: 4001,
        is_bot: false
      },
      text: "hello"
    })

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 202,
      chat: {
        id: 4001,
        type: "private"
      },
      from: {
        id: 4001,
        is_bot: false
      },
      text: "/new"
    })

    const sessionsAfterNew = service.listSessions()
    const freshSession = sessionsAfterNew.find(session => session.messageCount === 0)
    const originalSession = sessionsAfterNew.find(session => session.messageCount === 2)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(sessionsAfterNew).toHaveLength(2)
    expect(freshSession?.chatId).toBe("4001")
    expect(freshSession?.isActive).toBe(true)
    expect(originalSession?.chatId).toBe("4001")
    expect(originalSession?.isActive).toBe(false)
    expect(originalSession?.firstMessagePreview).toBe("hello")
    expect(
      service
        .getSessionMessages(String(freshSession?.sessionKey))
        ?.map(message => message.parts.map(part => ("text" in part ? part.text : "")).join(""))
    ).toEqual([])

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 203,
      chat: {
        id: 4001,
        type: "private"
      },
      from: {
        id: 4001,
        is_bot: false
      },
      text: "hello again"
    })

    const sessionsAfterSecondReply = service.listSessions()
    const latestSession = sessionsAfterSecondReply.find(session =>
      session.lastMessagePreview.includes("Assistant reply 2")
    )
    const firstSession = sessionsAfterSecondReply.find(session =>
      session.lastMessagePreview.includes("Assistant reply 1")
    )
    expect(sessionsAfterSecondReply).toHaveLength(2)
    expect(latestSession?.messageCount).toBe(2)
    expect(latestSession?.isActive).toBe(true)
    expect(latestSession?.firstMessagePreview).toBe("hello again")
    expect(firstSession?.messageCount).toBe(2)
    expect(firstSession?.isActive).toBe(false)
    expect(firstSession?.firstMessagePreview).toBe("hello")

    const firstSessionMessages = service.getSessionMessages(String(firstSession?.sessionKey))
    const secondSessionMessages = service.getSessionMessages(String(latestSession?.sessionKey))

    expect(firstSessionMessages?.[0]?.parts[0]).toMatchObject({ type: "text", text: "hello" })
    expect(secondSessionMessages?.[0]?.parts[0]).toMatchObject({
      type: "text",
      text: "hello again"
    })
    expect(
      firstSessionMessages?.some(message =>
        message.parts.some(part => "text" in part && part.text.includes("/new"))
      )
    ).toBe(false)
  })

  it("sends a fallback error reply when creating the first session fails to persist", async () => {
    const fetchMock = vi.fn(() => telegramApiSuccess({ message_id: 51 }))
    vi.stubGlobal("fetch", fetchMock)

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }
    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["4101"]
        }
      }
    })
    const sessionStore = {
      load: vi.fn().mockResolvedValue({
        sessions: [],
        activeSessionKeyByChatId: {}
      }),
      save: vi.fn().mockRejectedValue(new Error("persist failed"))
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore as never
    )
    await service.initialize()

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 211,
      chat: {
        id: 4101,
        type: "private"
      },
      from: {
        id: 4101,
        is_bot: false
      },
      text: "hello"
    })

    const sendMessageCalls = (fetchMock.mock.calls as readonly unknown[][]).filter(call =>
      String(call.at(0)).endsWith("/sendMessage")
    )
    expect(sendMessageCalls).toHaveLength(1)
    const [sendMessageCall] = sendMessageCalls
    expect(sendMessageCall).toBeDefined()
    expect(
      parseMockCallJsonBody<{ text: string }>(sendMessageCall as readonly unknown[]).text
    ).toBe("Error: Failed to generate response. Please try again.")
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(service.listSessions()).toHaveLength(0)
  })

  it("sends a fallback error reply when updating the active session fails to persist", async () => {
    const fetchMock = vi.fn(() => telegramApiSuccess({ message_id: 52 }))
    vi.stubGlobal("fetch", fetchMock)

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }
    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["4102"]
        }
      }
    })

    const existingSessionKey = "telegram:4102:session-a"
    const initialMessages = [
      {
        id: "message-1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "existing" }]
      }
    ]
    const sessionStore = {
      load: vi.fn().mockResolvedValue({
        sessions: [
          {
            sessionKey: existingSessionKey,
            chatId: "4102",
            startedAt: 10,
            updatedAt: 20,
            messages: initialMessages
          }
        ],
        activeSessionKeyByChatId: {
          "4102": existingSessionKey
        }
      }),
      save: vi.fn().mockRejectedValue(new Error("persist failed"))
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore as never
    )
    await service.initialize()

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 212,
      chat: {
        id: 4102,
        type: "private"
      },
      from: {
        id: 4102,
        is_bot: false
      },
      text: "hello again"
    })

    const sendMessageCalls = (fetchMock.mock.calls as readonly unknown[][]).filter(call =>
      String(call.at(0)).endsWith("/sendMessage")
    )
    expect(sendMessageCalls).toHaveLength(1)
    const [sendMessageCall] = sendMessageCalls
    expect(sendMessageCall).toBeDefined()
    expect(
      parseMockCallJsonBody<{ text: string }>(sendMessageCall as readonly unknown[]).text
    ).toBe("Error: Failed to generate response. Please try again.")
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(service.getSessionMessages(existingSessionKey)).toEqual(initialMessages)
  })

  it("sends a fallback error reply when /new fails to persist the new session", async () => {
    const fetchMock = vi.fn(() => telegramApiSuccess({ message_id: 53 }))
    vi.stubGlobal("fetch", fetchMock)

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }
    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["4103"]
        }
      }
    })
    const sessionStore = {
      load: vi.fn().mockResolvedValue({
        sessions: [],
        activeSessionKeyByChatId: {}
      }),
      save: vi.fn().mockRejectedValue(new Error("persist failed"))
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore as never
    )
    await service.initialize()

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 213,
      chat: {
        id: 4103,
        type: "private"
      },
      from: {
        id: 4103,
        is_bot: false
      },
      text: "/new"
    })

    const sendMessageCalls = (fetchMock.mock.calls as readonly unknown[][]).filter(call =>
      String(call.at(0)).endsWith("/sendMessage")
    )
    expect(sendMessageCalls).toHaveLength(1)
    const [sendMessageCall] = sendMessageCalls
    expect(sendMessageCall).toBeDefined()
    expect(
      parseMockCallJsonBody<{ text: string }>(sendMessageCall as readonly unknown[]).text
    ).toBe("Error: Failed to start a new session. Please try again.")
    expect(service.listSessions()).toHaveLength(0)
  })

  it("persists full session history without truncation and restores it on startup", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-store-"))
    tempDirs.push(tempDir)

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 71 })
    })
    vi.stubGlobal("fetch", fetchMock)

    let streamCallCount = 0
    streamTextMock.mockImplementation(() => {
      streamCallCount += 1
      return {
        textStream: createTextStream(`Assistant reply ${streamCallCount}`)
      }
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["5001"]
        }
      }
    })

    const sessionStore = new FileTelegramSessionStore(join(tempDir, "telegram-sessions.json"))
    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore
    )
    await service.initialize()

    const handleIncomingMessage = service as unknown as {
      handleIncomingMessage: (
        botToken: string,
        apiBaseUrl: string,
        message: unknown
      ) => Promise<void>
    }

    for (let index = 1; index <= 21; index += 1) {
      await handleIncomingMessage.handleIncomingMessage("token", "https://api.telegram.org", {
        message_id: index,
        chat: {
          id: 5001,
          type: "private"
        },
        from: {
          id: 5001,
          is_bot: false
        },
        text: `hello ${index}`
      })
    }

    const sessions = service.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.messageCount).toBe(42)

    const storedMessages = service.getSessionMessages(String(sessions[0]?.sessionKey))
    expect(storedMessages).toHaveLength(42)
    expect(storedMessages?.[0]?.parts[0]).toMatchObject({ type: "text", text: "hello 1" })
    expect(storedMessages?.[41]?.parts[0]).toMatchObject({
      type: "text",
      text: "Assistant reply 21"
    })

    const restoredService = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore
    )
    await restoredService.initialize()

    const restoredSessions = restoredService.listSessions()
    expect(restoredSessions).toHaveLength(1)
    expect(restoredSessions[0]?.messageCount).toBe(42)

    const restoredMessages = restoredService.getSessionMessages(
      String(restoredSessions[0]?.sessionKey)
    )
    expect(restoredMessages).toHaveLength(42)
    expect(restoredMessages?.[0]?.parts[0]).toMatchObject({ type: "text", text: "hello 1" })
    expect(restoredMessages?.[41]?.parts[0]).toMatchObject({
      type: "text",
      text: "Assistant reply 21"
    })
  })

  it("restores archived and active sessions and persists archived session deletion", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-telegram-store-"))
    tempDirs.push(tempDir)

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 91 })
    })
    vi.stubGlobal("fetch", fetchMock)

    let streamCallCount = 0
    streamTextMock.mockImplementation(() => {
      streamCallCount += 1
      return {
        textStream: createTextStream(`Assistant reply ${streamCallCount}`)
      }
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["6001"]
        }
      }
    })

    const sessionStore = new FileTelegramSessionStore(join(tempDir, "telegram-sessions.json"))
    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore
    )
    await service.initialize()

    const handleIncomingMessage = service as unknown as {
      handleIncomingMessage: (
        botToken: string,
        apiBaseUrl: string,
        message: unknown
      ) => Promise<void>
    }

    await handleIncomingMessage.handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 301,
      chat: {
        id: 6001,
        type: "private"
      },
      from: {
        id: 6001,
        is_bot: false
      },
      text: "hello"
    })
    await handleIncomingMessage.handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 302,
      chat: {
        id: 6001,
        type: "private"
      },
      from: {
        id: 6001,
        is_bot: false
      },
      text: "/new"
    })
    await handleIncomingMessage.handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 303,
      chat: {
        id: 6001,
        type: "private"
      },
      from: {
        id: 6001,
        is_bot: false
      },
      text: "hello again"
    })

    const restoredService = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore
    )
    await restoredService.initialize()

    const restoredSessions = restoredService.listSessions()
    expect(restoredSessions).toHaveLength(2)

    const activeSession = restoredSessions.find(session => session.isActive)
    const archivedSession = restoredSessions.find(session => !session.isActive)

    expect(activeSession?.firstMessagePreview).toBe("hello again")
    expect(archivedSession?.firstMessagePreview).toBe("hello")

    await expect(
      restoredService.deleteSession(String(activeSession?.sessionKey))
    ).rejects.toBeInstanceOf(ConflictError)

    await restoredService.deleteSession(String(archivedSession?.sessionKey))

    const afterDeleteService = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore
    )
    await afterDeleteService.initialize()

    const sessionsAfterDelete = afterDeleteService.listSessions()
    expect(sessionsAfterDelete).toHaveLength(1)
    expect(sessionsAfterDelete[0]?.sessionKey).toBe(activeSession?.sessionKey)
    expect(sessionsAfterDelete[0]?.isActive).toBe(true)
  })

  it("rolls back in-memory session mutations when persistence fails", async () => {
    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["7001"]
        }
      }
    })

    const initialSessionKey = "telegram:7001:session-a"
    const initialMessages = [
      {
        id: "message-1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "hello" }]
      }
    ]
    const sessionStore = {
      load: vi.fn().mockResolvedValue({
        sessions: [
          {
            sessionKey: initialSessionKey,
            chatId: "7001",
            startedAt: 10,
            updatedAt: 20,
            messages: initialMessages
          }
        ],
        activeSessionKeyByChatId: {}
      }),
      save: vi
        .fn()
        .mockRejectedValueOnce(new Error("delete failed"))
        .mockRejectedValueOnce(new Error("update failed"))
        .mockRejectedValueOnce(new Error("create failed"))
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore as never
    )
    await service.initialize()

    await expect(service.deleteSession(initialSessionKey)).rejects.toThrow("delete failed")
    expect(service.listSessions()).toHaveLength(1)
    expect(service.getSessionMessages(initialSessionKey)).toEqual(initialMessages)

    await expect(
      (
        service as unknown as {
          setSessionMessages: (
            sessionKey: string,
            messages: typeof initialMessages
          ) => Promise<void>
        }
      ).setSessionMessages(initialSessionKey, [
        {
          id: "message-2",
          role: "user",
          parts: [{ type: "text", text: "changed" }]
        }
      ])
    ).rejects.toThrow("update failed")
    expect(service.getSessionMessages(initialSessionKey)).toEqual(initialMessages)

    await expect(
      (service as unknown as { createSession: (chatId: string) => Promise<string> }).createSession(
        "7002"
      )
    ).rejects.toThrow("create failed")
    expect(service.listSessions()).toHaveLength(1)
    expect(findSessionSummaryByChatId(service, "7002")).toBeUndefined()
  })

  it("serializes persisted session mutations so a failed earlier save cannot clobber a later update", async () => {
    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["7001"]
        }
      }
    })

    const initialSessionKey = "telegram:7001:session-a"
    const initialMessages = [
      {
        id: "message-1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "hello" }]
      }
    ]
    const changedMessagesOne = [
      {
        id: "message-2",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "first change" }]
      }
    ]
    const changedMessagesTwo = [
      {
        id: "message-3",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "second change" }]
      }
    ]

    let rejectFirstSave: ((error: Error) => void) | null = null
    const sessionStore = {
      load: vi.fn().mockResolvedValue({
        sessions: [
          {
            sessionKey: initialSessionKey,
            chatId: "7001",
            startedAt: 10,
            updatedAt: 20,
            messages: initialMessages
          }
        ],
        activeSessionKeyByChatId: {
          "7001": initialSessionKey
        }
      }),
      save: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((_, reject) => {
              rejectFirstSave = error => reject(error)
            })
        )
        .mockResolvedValueOnce(undefined)
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore as never
    )
    await service.initialize()

    const firstUpdatePromise = (
      service as unknown as {
        setSessionMessages: (
          sessionKey: string,
          messages: typeof changedMessagesOne
        ) => Promise<void>
      }
    ).setSessionMessages(initialSessionKey, changedMessagesOne)

    const secondUpdatePromise = (
      service as unknown as {
        setSessionMessages: (
          sessionKey: string,
          messages: typeof changedMessagesTwo
        ) => Promise<void>
      }
    ).setSessionMessages(initialSessionKey, changedMessagesTwo)

    for (let index = 0; index < 5 && !rejectFirstSave; index += 1) {
      await Promise.resolve()
    }

    const rejectPendingSave = rejectFirstSave

    if (typeof rejectPendingSave !== "function") {
      throw new Error("Expected first save to be pending")
    }

    ;(rejectPendingSave as (error: Error) => void)(new Error("first failed"))

    await expect(firstUpdatePromise).rejects.toThrow("first failed")
    await expect(secondUpdatePromise).resolves.toBeUndefined()

    expect(sessionStore.save).toHaveBeenCalledTimes(2)
    expect(service.getSessionMessages(initialSessionKey)).toEqual(changedMessagesTwo)
  })

  it("ignores restored active-session mappings that point to another chat", async () => {
    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }
    const runtimeConfigService = new ChannelRuntimeConfigService()
    const mismatchedSessionKey = "telegram:6002:session-a"
    const sessionStore = {
      load: vi.fn().mockResolvedValue({
        sessions: [
          {
            sessionKey: mismatchedSessionKey,
            chatId: "6002",
            startedAt: 10,
            updatedAt: 20,
            messages: [
              {
                id: "message-1",
                role: "user",
                parts: [{ type: "text", text: "other chat history" }]
              }
            ]
          }
        ],
        activeSessionKeyByChatId: {
          "6001": mismatchedSessionKey
        }
      }),
      save: vi.fn().mockResolvedValue(undefined)
    }

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService,
      sessionStore as never
    )
    await service.initialize()

    expect(service.listSessions()[0]?.isActive).toBe(false)

    const nextSessionKey = await (
      service as unknown as {
        getOrCreateActiveSessionKey: (chatId: string) => Promise<string>
      }
    ).getOrCreateActiveSessionKey("6001")

    expect(nextSessionKey).not.toBe(mismatchedSessionKey)
    expect(
      service.listSessions().find(session => session.sessionKey === mismatchedSessionKey)?.isActive
    ).toBe(false)
    expect(
      service.listSessions().find(session => session.sessionKey === nextSessionKey)?.chatId
    ).toBe("6001")
    expect(
      service.listSessions().find(session => session.sessionKey === nextSessionKey)?.isActive
    ).toBe(true)
  })

  it("stores assistant usage metadata on messages and session summaries", async () => {
    let currentTime = 1_000
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime)
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 111 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const usage = {
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150
    }

    streamTextMock.mockImplementation(
      (options: {
        onChunk?: (event: { chunk: { type: string } }) => void | Promise<void>
        onFinish?: (event: { totalUsage: unknown }) => void
      }) => {
        currentTime = 1_350
        void options.onChunk?.({ chunk: { type: "text-delta" } })
        currentTime = 2_100
        void options.onChunk?.({ chunk: { type: "text-delta" } })
        options.onFinish?.({ totalUsage: usage })
        return {
          textStream: createTextStream("Assistant reply")
        }
      }
    )

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["5001"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 301,
      chat: {
        id: 5001,
        type: "private"
      },
      from: {
        id: 5001,
        is_bot: false
      },
      text: "hello"
    })

    const session = findSessionSummaryByChatId(service, "5001")
    expect(session).toMatchObject({
      chatId: "5001",
      isActive: true,
      firstMessagePreview: "hello",
      latestAssistantUsage: usage,
      latestModelProvider: "minimax",
      latestModelProviderLabel: "MiniMax",
      latestModelId: "model-a",
      latestModelLabel: "MiniMax-M2.5"
    })

    const storedMessages = service.getSessionMessages(String(session?.sessionKey))
    expect(storedMessages?.[1]?.metadata).toMatchObject({
      createdAt: 1_000,
      firstTokenAt: 1_350,
      lastTokenAt: 2_100,
      totalUsage: usage,
      modelProvider: "minimax",
      modelProviderLabel: "MiniMax",
      modelId: "model-a",
      modelLabel: "MiniMax-M2.5"
    })
    expect(
      (storedMessages?.[1]?.metadata as { createdAt?: number } | undefined)?.createdAt
    ).toBeGreaterThan(0)

    dateNowSpy.mockRestore()
  })

  it("syncs Telegram commands when the runtime starts", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/deleteWebhook")) {
        return telegramApiSuccess(true)
      }
      if (url.includes("/setMyCommands")) {
        return telegramApiSuccess(true)
      }
      if (url.includes("/getUpdates")) {
        return telegramApiSuccess([])
      }
      return telegramApiSuccess(true)
    })
    vi.stubGlobal("fetch", fetchMock)

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["6001"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await service.refresh()
    await service.stop()

    const setMyCommandsCall = fetchMock.mock.calls.find(call =>
      String(call[0]).includes("/setMyCommands")
    )
    expect(setMyCommandsCall).toBeDefined()
    expect(
      parseMockCallJsonBody<{ commands: Array<{ command: string; description: string }> }>(
        setMyCommandsCall as readonly unknown[] | undefined
      )
    ).toEqual({
      commands: [
        {
          command: "new",
          description: "Start a new conversation"
        }
      ]
    })
  })

  it("uses safe skill discovery when handling Telegram messages", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 8 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    streamTextMock.mockReturnValue({
      textStream: createTextStream("Assistant reply")
    })
    discoverSkillsSafelyMock.mockResolvedValueOnce([])

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["1003"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 101,
      chat: {
        id: 1003,
        type: "private"
      },
      from: {
        id: 1003,
        is_bot: false
      },
      text: "hello"
    })

    expect(buildSystemPromptMock).toHaveBeenCalledWith({
      modelProvider: "minimax",
      modelProviderLabel: "MiniMax",
      modelId: "model-a",
      modelLabel: "MiniMax-M2.5",
      channel: "telegram",
      skills: []
    })
    expect(discoverSkillsSafelyMock).toHaveBeenCalledWith("Telegram request")
    expect(streamTextMock).toHaveBeenCalled()
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })

  it("filters disabled skills before building the Telegram system prompt", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 19 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Assistant reply")
    })
    discoverSkillsSafelyMock.mockResolvedValueOnce([
      {
        id: "bundled:reader",
        name: "reader",
        source: "bundled",
        description: "Bundled reader",
        location: "~/skills/builtin/reader/SKILL.md"
      },
      {
        id: "user:writer",
        name: "writer",
        source: "user",
        description: "User writer",
        location: "~/skills/user/writer/SKILL.md"
      }
    ])

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: {
        provider: "minimax",
        providerLabel: "MiniMax",
        modelId: "model-a",
        modelLabel: "MiniMax-M2.5"
      },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["1004"]
        }
      },
      disabledSkills: ["user:writer"]
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 102,
      chat: {
        id: 1004,
        type: "private"
      },
      from: {
        id: 1004,
        is_bot: false
      },
      text: "hello"
    })

    expect(buildSystemPromptMock).toHaveBeenCalledWith({
      modelProvider: "minimax",
      modelProviderLabel: "MiniMax",
      modelId: "model-a",
      modelLabel: "MiniMax-M2.5",
      channel: "telegram",
      skills: [
        {
          id: "bundled:reader",
          name: "reader",
          source: "bundled",
          description: "Bundled reader",
          location: "~/skills/builtin/reader/SKILL.md"
        }
      ]
    })
  })

  it("sends converted text with HTML parse_mode", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return Promise.resolve(new Response("method not found", { status: 404 }))
      }
      return telegramApiSuccess({ message_id: 18 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream(
        '# 一级标题\n<h2 class="title">二级标题</h2>\n这是 **加粗**\n- 第一项'
      )
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["1002"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 101,
      chat: {
        id: 1002,
        type: "private"
      },
      from: {
        id: 1002,
        is_bot: false
      },
      text: "hello"
    })

    const sendMessageCall = fetchMock.mock.calls.find(call =>
      String(call[0]).endsWith("/sendMessage")
    )
    expect(sendMessageCall).toBeDefined()

    const body = parseMockCallJsonBody<{
      parse_mode?: string
      text?: string
    }>(sendMessageCall as readonly unknown[] | undefined)

    expect(body.parse_mode).toBe("HTML")
    expect(body.text).toBe("<b>一级标题</b>\n<b>二级标题</b>\n这是 <b>加粗</b>\n• 第一项")
  })

  it("sends draft_id when calling sendMessageDraft", async () => {
    const fetchMock = vi.fn((url: string, _options?: { body?: unknown }) => {
      if (url.includes("/sendMessageDraft")) {
        return telegramApiSuccess(true)
      }
      return telegramApiSuccess({ message_id: 9 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Draft body")
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["2001"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 110,
      chat: {
        id: 2001,
        type: "private"
      },
      from: {
        id: 2001,
        is_bot: false
      },
      text: "hello"
    })

    const draftCall = fetchMock.mock.calls.find(call =>
      String(call[0]).includes("/sendMessageDraft")
    )
    expect(draftCall).toBeDefined()

    const secondArg = draftCall?.[1]
    const body =
      secondArg && typeof secondArg === "object" && secondArg.body instanceof URLSearchParams
        ? secondArg.body
        : null

    expect(body?.get("chat_id")).toBe("2001")
    expect(Number(body?.get("draft_id")) > 0).toBe(true)
    expect(body?.get("text")).toBe("Draft body")
  })

  it("maps media uploads to expected chat actions", async () => {
    const transformSpy = vi
      .spyOn(telegramMediaMessageModule, "transformTelegramMediaMessage")
      .mockResolvedValue({
        sanitizedText: "Media attached",
        uploads: [
          {
            kind: "photo",
            data: Buffer.from([1]),
            filename: "photo.png",
            mimeType: "image/png",
            caption: "**photo**"
          },
          {
            kind: "video",
            data: Buffer.from([2]),
            filename: "video.mp4",
            mimeType: "video/mp4",
            caption: "video"
          },
          {
            kind: "audio",
            data: Buffer.from([3]),
            filename: "voice.ogg",
            mimeType: "audio/ogg",
            caption: "voice"
          },
          {
            kind: "document",
            data: Buffer.from([4]),
            filename: "report.txt",
            mimeType: "text/plain",
            caption: "document"
          }
        ],
        warnings: []
      })

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendChatAction")) {
        return telegramApiSuccess(true)
      }
      if (url.includes("/sendMessageDraft")) {
        return telegramApiSuccess(true)
      }
      return telegramApiSuccess({ message_id: 52 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Assistant reply")
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["3002"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 130,
      chat: {
        id: 3002,
        type: "private"
      },
      from: {
        id: 3002,
        is_bot: false
      },
      text: "hello"
    })

    const getActionFromCall = (call: readonly unknown[]) => {
      const options = call[1]
      if (!options || typeof options !== "object") {
        return null
      }
      const body = (options as { body?: unknown }).body
      if (typeof body !== "string") {
        return null
      }
      return (JSON.parse(body) as { action?: string }).action ?? null
    }

    const getActionIndex = (action: string) =>
      fetchMock.mock.calls.findIndex(call => {
        const url = String(call[0])
        return url.includes("/sendChatAction") && getActionFromCall(call) === action
      })

    const sendPhotoIndex = fetchMock.mock.calls.findIndex(call =>
      String(call[0]).includes("/sendPhoto")
    )
    const sendVideoIndex = fetchMock.mock.calls.findIndex(call =>
      String(call[0]).includes("/sendVideo")
    )
    const sendAudioIndex = fetchMock.mock.calls.findIndex(call =>
      String(call[0]).includes("/sendAudio")
    )
    const sendDocumentIndex = fetchMock.mock.calls.findIndex(call =>
      String(call[0]).includes("/sendDocument")
    )

    const photoActionIndex = getActionIndex("upload_photo")
    const videoActionIndex = getActionIndex("upload_video")
    const voiceActionIndex = getActionIndex("upload_voice")
    const documentActionIndex = getActionIndex("upload_document")

    expect(photoActionIndex).toBeGreaterThanOrEqual(0)
    expect(videoActionIndex).toBeGreaterThanOrEqual(0)
    expect(voiceActionIndex).toBeGreaterThanOrEqual(0)
    expect(documentActionIndex).toBeGreaterThanOrEqual(0)

    expect(photoActionIndex).toBeLessThan(sendPhotoIndex)
    expect(videoActionIndex).toBeLessThan(sendVideoIndex)
    expect(voiceActionIndex).toBeLessThan(sendAudioIndex)
    expect(documentActionIndex).toBeLessThan(sendDocumentIndex)

    const photoCall = fetchMock.mock.calls[sendPhotoIndex]
    const photoBody = getMockCallBody(photoCall as readonly unknown[] | undefined)
    expect(photoBody instanceof FormData).toBe(true)
    expect((photoBody as FormData).get("parse_mode")).toBe("HTML")
    expect((photoBody as FormData).get("caption")).toBe("<b>photo</b>")

    transformSpy.mockRestore()
  })

  it("retries sendMessage without parse_mode when Telegram returns parse entity error", async () => {
    let sendMessageCallCount = 0
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendMessageDraft")) {
        return telegramApiSuccess(true)
      }

      if (url.endsWith("/sendMessage")) {
        sendMessageCallCount += 1
        if (sendMessageCallCount === 1) {
          return telegramApiFailure(
            400,
            'Bad Request: can\'t parse entities: Unsupported start tag "bad"'
          )
        }
      }

      return telegramApiSuccess({ message_id: 71 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("**bad** message")
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["3005"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 151,
      chat: {
        id: 3005,
        type: "private"
      },
      from: {
        id: 3005,
        is_bot: false
      },
      text: "hello"
    })

    const sendMessageCalls = fetchMock.mock.calls.filter(call =>
      String(call[0]).endsWith("/sendMessage")
    )
    expect(sendMessageCalls).toHaveLength(2)

    const firstBody = parseMockCallJsonBody<{
      parse_mode?: string
      text?: string
    }>(sendMessageCalls[0] as readonly unknown[] | undefined)
    const secondBody = parseMockCallJsonBody<{
      parse_mode?: string
      text?: string
    }>(sendMessageCalls[1] as readonly unknown[] | undefined)

    expect(firstBody.parse_mode).toBe("HTML")
    expect(firstBody.text).toBe(toTelegramHtml("**bad** message"))
    expect(secondBody.parse_mode).toBeUndefined()
    expect(secondBody.text).toBe("**bad** message")
  })

  it("continues final reply when sendChatAction fails", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/sendChatAction")) {
        return Promise.resolve(new Response("chat action failed", { status: 500 }))
      }
      if (url.includes("/sendMessageDraft")) {
        return telegramApiSuccess(true)
      }
      return telegramApiSuccess({ message_id: 68 })
    })
    vi.stubGlobal("fetch", fetchMock)

    streamTextMock.mockReturnValue({
      textStream: createTextStream("Assistant reply")
    })

    const providerService = {
      hasConfig: vi.fn(() => true),
      createModel: vi.fn(() => ({})),
      getConfig: vi.fn((provider: string) => {
        if (provider === "telegram") {
          return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
        }
        return { apiKey: "model-key" }
      })
    }
    const toolService = {
      getRequestTools: vi.fn(() => ({}))
    }

    const runtimeConfigService = new ChannelRuntimeConfigService()
    runtimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["3003"]
        }
      }
    })

    const service = new TelegramBotService(
      providerService as never,
      toolService as never,
      runtimeConfigService
    )

    await (
      service as unknown as {
        handleIncomingMessage: (
          botToken: string,
          apiBaseUrl: string,
          message: unknown
        ) => Promise<void>
      }
    ).handleIncomingMessage("token", "https://api.telegram.org", {
      message_id: 140,
      chat: {
        id: 3003,
        type: "private"
      },
      from: {
        id: 3003,
        is_bot: false
      },
      text: "hello"
    })

    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/sendChatAction"))).toBe(
      true
    )
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/sendMessage"))).toBe(true)

    const session = findSessionSummaryByChatId(service, "3003")
    const storedMessages = service.getSessionMessages(String(session?.sessionKey))
    expect(storedMessages).toHaveLength(2)
    expect(storedMessages?.[1]?.role).toBe("assistant")
  })

  it("stops chat action heartbeat after completion", async () => {
    vi.useFakeTimers()

    try {
      const fetchMock = vi.fn((url: string) => {
        if (url.includes("/sendMessageDraft")) {
          return telegramApiSuccess(true)
        }
        return telegramApiSuccess({ message_id: 79 })
      })
      vi.stubGlobal("fetch", fetchMock)

      streamTextMock.mockReturnValue({
        textStream: createDelayedTextStream(9000, "Assistant reply")
      })

      const providerService = {
        hasConfig: vi.fn(() => true),
        createModel: vi.fn(() => ({})),
        getConfig: vi.fn((provider: string) => {
          if (provider === "telegram") {
            return { apiKey: "tg-token", baseUrl: "https://api.telegram.org" }
          }
          return { apiKey: "model-key" }
        })
      }
      const toolService = {
        getRequestTools: vi.fn(() => ({}))
      }

      const runtimeConfigService = new ChannelRuntimeConfigService()
      runtimeConfigService.update({
        selectedModel: { provider: "minimax", modelId: "model-a" },
        channels: {
          telegram: {
            enabled: true,
            allowedUserIds: ["3004"]
          }
        }
      })

      const service = new TelegramBotService(
        providerService as never,
        toolService as never,
        runtimeConfigService
      )

      const handlePromise = (
        service as unknown as {
          handleIncomingMessage: (
            botToken: string,
            apiBaseUrl: string,
            message: unknown
          ) => Promise<void>
        }
      ).handleIncomingMessage("token", "https://api.telegram.org", {
        message_id: 150,
        chat: {
          id: 3004,
          type: "private"
        },
        from: {
          id: 3004,
          is_bot: false
        },
        text: "hello"
      })

      await vi.advanceTimersByTimeAsync(8500)
      const duringCount = fetchMock.mock.calls.filter(call =>
        String(call[0]).includes("/sendChatAction")
      ).length
      expect(duringCount).toBeGreaterThanOrEqual(3)

      await vi.advanceTimersByTimeAsync(1000)
      await handlePromise

      const countAfterCompletion = fetchMock.mock.calls.filter(call =>
        String(call[0]).includes("/sendChatAction")
      ).length

      await vi.advanceTimersByTimeAsync(12000)
      const countAfterWait = fetchMock.mock.calls.filter(call =>
        String(call[0]).includes("/sendChatAction")
      ).length

      expect(countAfterWait).toBe(countAfterCompletion)
    } finally {
      vi.useRealTimers()
    }
  })
})
