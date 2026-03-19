import { beforeEach, describe, expect, it, vi } from "vitest"

const streamTextMock = vi.fn()
const processMessagesMock = vi.fn()
const discoverSkillsSafelyMock = vi.fn()
const buildSystemPromptMock = vi.fn()

vi.mock("ai", () => ({
  InvalidToolInputError: {
    isInstance: () => false
  },
  NoSuchToolError: {
    isInstance: () => false
  },
  stepCountIs: vi.fn((value: number) => value),
  streamText: (...args: unknown[]) => streamTextMock(...args)
}))

vi.mock("../../utils/message-processor", () => ({
  processMessages: (...args: unknown[]) => processMessagesMock(...args)
}))

vi.mock("../../skills/catalog", async importOriginal => {
  const actual = await importOriginal<typeof import("../../skills/catalog")>()
  return {
    ...actual,
    discoverSkillsSafely: (...args: unknown[]) => discoverSkillsSafelyMock(...args)
  }
})

vi.mock("../../utils/system-prompt-builder", async importOriginal => {
  const actual = await importOriginal<typeof import("../../utils/system-prompt-builder")>()
  return {
    ...actual,
    buildSystemPrompt: (...args: unknown[]) => buildSystemPromptMock(...args)
  }
})

import { createStreamResponse } from "../stream-handler"

describe("createStreamResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    discoverSkillsSafelyMock.mockResolvedValue([])
    processMessagesMock.mockResolvedValue([{ role: "user", parts: [] }])
    buildSystemPromptMock.mockReturnValue("system prompt")
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => "stream-response")
    })
  })

  it("uses safe skill discovery for stream requests", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    discoverSkillsSafelyMock.mockResolvedValueOnce([
      {
        id: "bundled:reader",
        name: "reader",
        source: "bundled",
        description: "Read files",
        location: "~/skills/builtin/reader/SKILL.md"
      },
      {
        id: "user:writer",
        name: "writer",
        source: "user",
        description: "Write files",
        location: "~/skills/user/writer/SKILL.md"
      }
    ])

    const response = await createStreamResponse({
      model: {} as never,
      modelProvider: "minimax",
      modelProviderLabel: "MiniMax",
      modelId: "model-a",
      modelLabel: "MiniMax-M2.5",
      messages: [{ role: "user", parts: [] }] as never,
      tools: {},
      toolChoice: "auto" as never,
      abortSignal: new AbortController().signal,
      reasoningEnabled: true,
      reasoningEffort: "default",
      disabledSkillIds: ["user:writer"]
    })

    expect(response).toBe("stream-response")
    expect(buildSystemPromptMock).toHaveBeenCalledWith({
      modelProvider: "minimax",
      modelProviderLabel: "MiniMax",
      modelId: "model-a",
      modelLabel: "MiniMax-M2.5",
      skills: [
        {
          id: "bundled:reader",
          name: "reader",
          source: "bundled",
          description: "Read files",
          location: "~/skills/builtin/reader/SKILL.md"
        }
      ]
    })
    expect(streamTextMock).toHaveBeenCalled()
    expect(discoverSkillsSafelyMock).toHaveBeenCalledWith("stream request")
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })

  it("passes providerOptions to streamText for supported anthropic models", async () => {
    await createStreamResponse({
      model: {} as never,
      modelProvider: "anthropic",
      modelId: "claude-sonnet-4-5-20251022",
      messages: [{ role: "user", parts: [] }] as never,
      tools: {},
      toolChoice: "auto" as never,
      abortSignal: new AbortController().signal,
      reasoningEnabled: true,
      reasoningEffort: "high"
    })

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          anthropic: {
            thinking: {
              type: "adaptive"
            },
            effort: "high"
          }
        }
      })
    )
  })

  it("omits providerOptions for unsupported models", async () => {
    await createStreamResponse({
      model: {} as never,
      modelProvider: "openai",
      modelId: "gpt-4",
      messages: [{ role: "user", parts: [] }] as never,
      tools: {},
      toolChoice: "auto" as never,
      abortSignal: new AbortController().signal,
      reasoningEnabled: true,
      reasoningEffort: "xhigh"
    })

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: undefined
      })
    )
  })

  it("includes provider and model labels in streamed message metadata", async () => {
    const toUIMessageStreamResponseMock = vi.fn((_: unknown) => "stream-response")
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: toUIMessageStreamResponseMock
    })

    await createStreamResponse({
      model: {} as never,
      modelProvider: "minimax",
      modelProviderLabel: "MiniMax",
      modelId: "model-a",
      modelLabel: "MiniMax-M2.5",
      messages: [{ role: "user", parts: [] }] as never,
      tools: {},
      toolChoice: "auto" as never,
      abortSignal: new AbortController().signal,
      reasoningEnabled: true,
      reasoningEffort: "default"
    })

    expect(toUIMessageStreamResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messageMetadata: expect.any(Function)
      })
    )

    const streamResponseOptions = toUIMessageStreamResponseMock.mock.calls[0]?.[0]

    expect(streamResponseOptions).toBeDefined()
    if (!streamResponseOptions) {
      return
    }

    const typedStreamResponseOptions = streamResponseOptions as unknown as {
      messageMetadata: (value: {
        part: { type: "start" | "finish"; totalUsage?: unknown }
      }) => unknown
    }

    expect(typedStreamResponseOptions.messageMetadata({ part: { type: "start" } })).toMatchObject({
      createdAt: expect.any(Number),
      modelProvider: "minimax",
      modelProviderLabel: "MiniMax",
      modelId: "model-a",
      modelLabel: "MiniMax-M2.5"
    })
  })

  it("records first and last timing-relevant chunk timestamps in finish metadata", async () => {
    let currentTime = 1_000
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime)
    const toUIMessageStreamResponseMock = vi.fn((_: unknown) => "stream-response")
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: toUIMessageStreamResponseMock
    })

    await createStreamResponse({
      model: {} as never,
      modelProvider: "openai",
      modelId: "gpt-5",
      messages: [{ role: "user", parts: [] }] as never,
      tools: {},
      toolChoice: "auto" as never,
      abortSignal: new AbortController().signal,
      reasoningEnabled: false,
      reasoningEffort: "default"
    })

    const streamTextOptions = streamTextMock.mock.calls[0]?.[0] as {
      onChunk?: (event: { chunk: { type: string } }) => void | Promise<void>
    }
    const streamResponseOptions = toUIMessageStreamResponseMock.mock.calls[0]?.[0] as {
      messageMetadata: (value: {
        part: { type: "start" | "finish"; totalUsage?: unknown }
      }) => Record<string, unknown>
    }

    currentTime = 1_250
    await streamTextOptions.onChunk?.({ chunk: { type: "reasoning-delta" } })
    currentTime = 1_400
    await streamTextOptions.onChunk?.({ chunk: { type: "text-delta" } })
    currentTime = 2_300
    await streamTextOptions.onChunk?.({ chunk: { type: "text-delta" } })

    expect(streamResponseOptions.messageMetadata({ part: { type: "start" } })).toMatchObject({
      createdAt: 1_000
    })
    expect(
      streamResponseOptions.messageMetadata({
        part: {
          type: "finish",
          totalUsage: { outputTokens: 42 }
        }
      })
    ).toMatchObject({
      firstTokenAt: 1_250,
      lastTokenAt: 2_300,
      totalUsage: { outputTokens: 42 }
    })

    dateNowSpy.mockRestore()
  })

  it("keeps finish timing metadata empty when no timing-relevant chunk arrives", async () => {
    let currentTime = 5_000
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime)
    const toUIMessageStreamResponseMock = vi.fn((_: unknown) => "stream-response")
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: toUIMessageStreamResponseMock
    })

    await createStreamResponse({
      model: {} as never,
      modelProvider: "openai",
      modelId: "gpt-5",
      messages: [{ role: "user", parts: [] }] as never,
      tools: {},
      toolChoice: "auto" as never,
      abortSignal: new AbortController().signal,
      reasoningEnabled: false,
      reasoningEffort: "default"
    })

    const streamTextOptions = streamTextMock.mock.calls[0]?.[0] as {
      onChunk?: (event: { chunk: { type: string } }) => void | Promise<void>
    }
    const streamResponseOptions = toUIMessageStreamResponseMock.mock.calls[0]?.[0] as {
      messageMetadata: (value: {
        part: { type: "start" | "finish"; totalUsage?: unknown }
      }) => Record<string, unknown>
    }

    currentTime = 5_500
    await streamTextOptions.onChunk?.({ chunk: { type: "source" } })

    expect(
      streamResponseOptions.messageMetadata({
        part: {
          type: "finish",
          totalUsage: { outputTokens: 0 }
        }
      })
    ).toEqual({
      totalUsage: { outputTokens: 0 },
      modelProvider: "openai",
      modelId: "gpt-5",
      modelProviderLabel: undefined,
      modelLabel: undefined
    })

    dateNowSpy.mockRestore()
  })
})
