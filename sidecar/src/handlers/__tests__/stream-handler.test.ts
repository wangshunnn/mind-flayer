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

vi.mock("../../skills/catalog", () => ({
  discoverSkillsSafely: (...args: unknown[]) => discoverSkillsSafelyMock(...args)
}))

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
    discoverSkillsSafelyMock.mockResolvedValueOnce([])

    const response = await createStreamResponse({
      model: {} as never,
      modelProvider: "minimax",
      modelId: "model-a",
      messages: [{ role: "user", parts: [] }] as never,
      tools: {},
      toolChoice: "auto" as never,
      abortSignal: new AbortController().signal
    })

    expect(response).toBe("stream-response")
    expect(buildSystemPromptMock).toHaveBeenCalledWith({
      modelProvider: "minimax",
      modelId: "model-a",
      skills: []
    })
    expect(streamTextMock).toHaveBeenCalled()
    expect(discoverSkillsSafelyMock).toHaveBeenCalledWith("stream request")
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })
})
