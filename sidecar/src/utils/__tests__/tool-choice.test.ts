import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"
import { buildToolChoice } from "../tool-choice"

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

describe("buildToolChoice", () => {
  it("should return 'auto' when web search is disabled", () => {
    const result = buildToolChoice({
      useWebSearch: false,
      webSearchMode: "auto",
      messages: []
    })

    expect(result).toBe("auto")
  })

  it("should return 'auto' when web search is enabled but mode is 'auto'", () => {
    const result = buildToolChoice({
      useWebSearch: true,
      webSearchMode: "auto",
      messages: []
    })

    expect(result).toBe("auto")
  })

  it("should return 'auto' when webSearchMode is 'always' but last message is not from user", () => {
    const messages: UIMessage[] = [
      createMockMessage("user", "hello"),
      createMockMessage("assistant", "hi there")
    ]

    const result = buildToolChoice({
      useWebSearch: true,
      webSearchMode: "always",
      messages
    })

    expect(result).toBe("auto")
  })

  it("should force webSearch tool when mode is 'always' and last message is from user", () => {
    const messages: UIMessage[] = [createMockMessage("user", "what is the weather today?")]

    const result = buildToolChoice({
      useWebSearch: true,
      webSearchMode: "always",
      messages
    })

    expect(result).toEqual({
      type: "tool",
      toolName: "webSearch"
    })
  })

  it("should force webSearch tool when mode is 'always' with multiple user messages", () => {
    const messages: UIMessage[] = [
      createMockMessage("user", "hello"),
      createMockMessage("assistant", "hi"),
      createMockMessage("user", "search for latest news")
    ]

    const result = buildToolChoice({
      useWebSearch: true,
      webSearchMode: "always",
      messages
    })

    expect(result).toEqual({
      type: "tool",
      toolName: "webSearch"
    })
  })

  it("should return 'auto' when messages array is empty", () => {
    const result = buildToolChoice({
      useWebSearch: true,
      webSearchMode: "always",
      messages: []
    })

    expect(result).toBe("auto")
  })
})
