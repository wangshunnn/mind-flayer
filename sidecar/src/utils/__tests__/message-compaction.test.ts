/** biome-ignore-all lint/suspicious/noExplicitAny: <any> */
import type { UIMessage } from "ai"
import { describe, expect, it, vi } from "vitest"
import { compactMessages, findWindowSplitIndex } from "../message-compaction"

/**
 * Helper function to create mock UIMessage with correct AI SDK 6.x structure.
 * Messages use parts-based format instead of content field.
 */
function createMockMessage(role: "user" | "assistant", text: string): UIMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role,
    parts: [{ type: "text", text }],
    ...(role === "assistant" ? { metadata: { createdAt: Date.now() } } : {})
  } as UIMessage
}

// Mock the AI SDK functions to isolate our logic
vi.mock("ai", async () => {
  const actual = await vi.importActual("ai")
  return {
    ...actual,
    convertToModelMessages: vi.fn(async (messages: UIMessage[]) => messages),
    pruneMessages: vi.fn((options: { messages: UIMessage[] }) => options.messages)
  }
})

describe("findWindowSplitIndex", () => {
  it("should return 0 when messages count is within window", () => {
    const messages = [
      createMockMessage("user", "Q1"),
      createMockMessage("assistant", "A1"),
      createMockMessage("user", "Q2")
    ]
    expect(findWindowSplitIndex(messages, 3)).toBe(0)
  })

  it("should return the index of the Nth user message from the end", () => {
    const messages = [
      createMockMessage("user", "Q1"),
      createMockMessage("assistant", "A1"),
      createMockMessage("user", "Q2"),
      createMockMessage("assistant", "A2"),
      createMockMessage("user", "Q3"),
      createMockMessage("assistant", "A3"),
      createMockMessage("user", "Q4")
    ]
    // windowSize=2: keep last 2 user msgs (Q3 at index 4, Q4 at index 6)
    expect(findWindowSplitIndex(messages, 2)).toBe(4)
  })

  it("should return 0 for empty messages", () => {
    expect(findWindowSplitIndex([], 3)).toBe(0)
  })

  it("should return 0 when there are fewer user messages than window size", () => {
    const messages = [createMockMessage("user", "Q1"), createMockMessage("assistant", "A1")]
    expect(findWindowSplitIndex(messages, 3)).toBe(0)
  })

  it("should correctly count only user messages, ignoring assistant messages", () => {
    const messages = [
      createMockMessage("user", "Q1"),
      createMockMessage("assistant", "A1"),
      createMockMessage("assistant", "A1-followup"),
      createMockMessage("user", "Q2"),
      createMockMessage("assistant", "A2"),
      createMockMessage("user", "Q3"),
      createMockMessage("assistant", "A3"),
      createMockMessage("user", "Q4")
    ]
    // windowSize=3: last 3 user msgs are Q2(3), Q3(5), Q4(7) → split at index 3
    expect(findWindowSplitIndex(messages, 3)).toBe(3)
  })
})

describe("compactMessages", () => {
  it("should handle simple user message", async () => {
    const messages: UIMessage[] = [createMockMessage("user", "Hello, can you help me?")]

    const result = await compactMessages(messages)

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it("should handle conversation with user and assistant messages", async () => {
    const messages: UIMessage[] = [
      createMockMessage("user", "What is 2+2?"),
      createMockMessage("assistant", "The answer is 4."),
      createMockMessage("user", "What about 3+3?")
    ]

    const result = await compactMessages(messages)

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it("should handle empty messages array", async () => {
    const messages: UIMessage[] = []

    const result = await compactMessages(messages)

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it("should call convertToModelMessages with correct options", async () => {
    const { convertToModelMessages } = await import("ai")
    const messages: UIMessage[] = [createMockMessage("user", "Test message")]
    const tools = {} as any

    await compactMessages(messages, tools)

    expect(convertToModelMessages).toHaveBeenCalledWith(messages, {
      tools,
      ignoreIncompleteToolCalls: true
    })
  })

  it("should work with empty tools object", async () => {
    const messages: UIMessage[] = [createMockMessage("user", "Test")]

    const result = await compactMessages(messages, {})

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it("should prune older messages when conversation exceeds window size", async () => {
    const { pruneMessages } = await import("ai")
    const messages: UIMessage[] = [
      createMockMessage("user", "Q1"),
      createMockMessage("assistant", "A1"),
      createMockMessage("user", "Q2"),
      createMockMessage("assistant", "A2"),
      createMockMessage("user", "Q3"),
      createMockMessage("assistant", "A3"),
      createMockMessage("user", "Q4")
    ]

    await compactMessages(messages, {}, 2)

    // pruneMessages should be called for the older segment
    expect(pruneMessages).toHaveBeenCalledWith({
      messages: expect.any(Array),
      reasoning: "all",
      toolCalls: "all",
      emptyMessages: "remove"
    })
  })

  it("should not call pruneMessages when within window size", async () => {
    const { pruneMessages } = await import("ai")
    vi.mocked(pruneMessages).mockClear()

    const messages: UIMessage[] = [
      createMockMessage("user", "Q1"),
      createMockMessage("assistant", "A1"),
      createMockMessage("user", "Q2")
    ]

    await compactMessages(messages, {}, 3)

    expect(pruneMessages).not.toHaveBeenCalled()
  })

  it("should accept custom window size", async () => {
    const messages: UIMessage[] = [
      createMockMessage("user", "Q1"),
      createMockMessage("assistant", "A1"),
      createMockMessage("user", "Q2"),
      createMockMessage("assistant", "A2"),
      createMockMessage("user", "Q3")
    ]

    const result = await compactMessages(messages, {}, 1)

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })
})
