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
      modelId: "model-a",
      messages: [{ role: "user", parts: [] }] as never,
      tools: {},
      toolChoice: "auto" as never,
      abortSignal: new AbortController().signal,
      disabledSkillIds: ["user:writer"]
    })

    expect(response).toBe("stream-response")
    expect(buildSystemPromptMock).toHaveBeenCalledWith({
      modelProvider: "minimax",
      modelId: "model-a",
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
})
