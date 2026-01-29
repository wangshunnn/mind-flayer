/** biome-ignore-all lint/suspicious/noExplicitAny: <any> */
import type { UIMessage } from "ai"
import { describe, expect, it, vi } from "vitest"
import { processMessages } from "../message-processing"

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

describe("processMessages", () => {
  it("should handle simple user message", async () => {
    const messages: UIMessage[] = [createMockMessage("user", "Hello, can you help me?")]

    const result = await processMessages(messages)

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it("should handle conversation with user and assistant messages", async () => {
    const messages: UIMessage[] = [
      createMockMessage("user", "What is 2+2?"),
      createMockMessage("assistant", "The answer is 4."),
      createMockMessage("user", "What about 3+3?")
    ]

    const result = await processMessages(messages)

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it("should handle empty messages array", async () => {
    const messages: UIMessage[] = []

    const result = await processMessages(messages)

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })

  it("should call convertToModelMessages with correct options", async () => {
    const { convertToModelMessages } = await import("ai")
    const messages: UIMessage[] = [createMockMessage("user", "Test message")]
    const tools = {} as any

    await processMessages(messages, tools)

    expect(convertToModelMessages).toHaveBeenCalledWith(messages, {
      tools,
      ignoreIncompleteToolCalls: true
    })
  })

  it("should work with empty tools object", async () => {
    const messages: UIMessage[] = [createMockMessage("user", "Test")]

    const result = await processMessages(messages, {})

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })
})
