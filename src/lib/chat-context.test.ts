import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type ContextUsage, emptyContextState } from "../../shared/context"

const invoke = vi.hoisted(() => vi.fn())
const select = vi.hoisted(() => vi.fn())
vi.mock("@tauri-apps/api/core", () => ({ invoke }))
vi.mock("./database", () => ({ getDatabase: async () => ({ select }) }))

import {
  type ContextInspectionSnapshot,
  commitChatContext,
  estimateMissingChatUsage,
  getContextErrorKey,
  loadChatContext
} from "./chat-context"

describe("desktop context persistence", () => {
  beforeEach(() => {
    invoke.mockReset()
    select.mockReset()
  })

  it("serializes checkpoint transactions and snapshots mutable caller state", async () => {
    let release: (() => void) | undefined
    invoke
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            release = resolve
          })
      )
      .mockResolvedValueOnce(undefined)
    const state = emptyContextState()
    const first = commitChatContext("queue", [], [], state)
    state.events.push({
      type: "temporal",
      id: "date",
      beforeMessageId: "u",
      date: "2026-08-26",
      timeZone: "UTC"
    })
    const second = commitChatContext("queue", [], [], state)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    expect(invoke.mock.calls[0][1].payload.contextState.events).toEqual([])
    release?.()
    await Promise.all([first, second])
    expect(invoke.mock.calls[1][1].payload.contextState.events).toHaveLength(1)
  })

  it("loads independent events and usage without substituting messages", async () => {
    select
      .mockResolvedValueOnce([
        {
          content_json: JSON.stringify({
            type: "temporal",
            id: "date",
            beforeMessageId: "u",
            date: "2026-08-26",
            timeZone: "UTC"
          })
        }
      ])
      .mockResolvedValueOnce([{ content_json: "null" }])
    const state = await loadChatContext("load")
    expect(state.events).toHaveLength(1)
    expect(state.usage).toBeUndefined()
    expect(select.mock.calls.every(call => !call[0].includes("FROM messages"))).toBe(true)
  })

  it.each([
    undefined,
    { systemTokens: 100, toolsTokens: 200, messageTokens: 300 }
  ])("loads legacy and current context composition from JSON", async breakdown => {
    const usage: ContextUsage = {
      tokens: 600,
      contextWindow: 128000,
      source: "estimated",
      prefixHash: "prefix",
      requestFingerprint: "request",
      entryCount: 2,
      breakdown
    }
    select
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ content_json: JSON.stringify(usage) }])
    expect((await loadChatContext("composition")).usage).toEqual(usage)
  })
})

describe("user-facing context errors", () => {
  it.each([
    ["COMPACTION_FAILED: Summary was interrupted or truncated", "failed"],
    ["CONTEXT_TOO_LARGE: The retained conversation cannot fit", "tooLarge"],
    ["CONVERSATION_BUSY", "busy"],
    ["API_KEY_NOT_CONFIGURED", undefined]
  ])("maps %s without exposing the internal diagnostic", (message, expected) => {
    expect(getContextErrorKey(message)).toBe(expected)
  })
})

describe("missing context usage inspection", () => {
  const usage: ContextUsage = {
    tokens: 1200,
    modelId: "gpt-5.3-chat-latest",
    contextWindow: 128000,
    source: "estimated",
    prefixHash: "source",
    entryCount: 1,
    requestFingerprint: "request",
    breakdown: { systemTokens: 300, toolsTokens: 400, messageTokens: 500 }
  }
  const snapshot = (): ContextInspectionSnapshot => ({
    chatId: "old-chat",
    messages: [
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Old reply" }],
        metadata: { totalUsage: { inputTokens: 900000, totalTokens: 1000000 } }
      }
    ],
    contextState: emptyContextState(),
    hydrated: true,
    compacting: false,
    status: "ready",
    headers: { "X-Model-Id": "gpt-5.3-chat-latest" }
  })
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    invoke.mockReset()
    select.mockReset()
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ usage })))
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("estimates legacy history without using accumulated billing tokens or writing to storage", async () => {
    const source = snapshot()
    const original = structuredClone(source)
    const result = await estimateMissingChatUsage(
      "http://localhost/api/chat",
      () => source,
      new AbortController().signal
    )
    expect(result?.tokens).toBe(1200)
    expect(result?.breakdown).toEqual(usage.breakdown)
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost/api/chat/context-usage")
    expect(source).toEqual(original)
    expect(invoke).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it("backfills a legacy total that has no composition", async () => {
    const source = snapshot()
    source.contextState.usage = { ...usage, breakdown: undefined }
    const result = await estimateMissingChatUsage(
      "/api/chat",
      () => source,
      new AbortController().signal
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result?.breakdown).toEqual(usage.breakdown)
  })

  it("does not inspect empty, busy, or complete usage snapshots", async () => {
    const source = snapshot()
    source.contextState.usage = { ...usage, source: "estimated" }
    await estimateMissingChatUsage("/api/chat", () => source, new AbortController().signal)
    source.contextState = emptyContextState()
    source.status = "streaming"
    await estimateMissingChatUsage("/api/chat", () => source, new AbortController().signal)
    source.status = "ready"
    source.messages = []
    await estimateMissingChatUsage("/api/chat", () => source, new AbortController().signal)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not apply an older sidecar response that still lacks composition", async () => {
    fetchMock
      .mockReset()
      .mockResolvedValue(
        new Response(JSON.stringify({ usage: { ...usage, breakdown: undefined } }))
      )
    const source = snapshot()
    source.contextState.usage = { ...usage, breakdown: undefined }
    expect(
      await estimateMissingChatUsage("/api/chat", () => source, new AbortController().signal)
    ).toBeUndefined()
  })

  it.each([
    "messages",
    "state",
    "model",
    "status"
  ])("discards an estimate when %s changes during inspection", async change => {
    let source = snapshot()
    let finish: ((response: Response) => void) | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    const result = estimateMissingChatUsage("/api/chat", () => source, new AbortController().signal)
    if (change === "messages") {
      source = { ...source, messages: [...source.messages] }
    }
    if (change === "state") {
      source = { ...source, contextState: emptyContextState() }
    }
    if (change === "model") {
      source = { ...source, headers: { "X-Model-Id": "another-model" } }
    }
    if (change === "status") {
      source = { ...source, status: "submitted" }
    }
    finish?.(new Response(JSON.stringify({ usage })))
    expect(await result).toBeUndefined()
  })

  it("does not apply a response after the inspection is cancelled", async () => {
    const source = snapshot()
    const abort = new AbortController()
    const result = estimateMissingChatUsage("/api/chat", () => source, abort.signal)
    abort.abort()
    expect(await result).toBeUndefined()
  })
})
