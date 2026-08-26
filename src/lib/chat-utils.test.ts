import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"
import { storedMessageToUI, uiMessageToStored } from "@/lib/chat-utils"

describe("stored message timestamps", () => {
  it.each([
    "user",
    "assistant"
  ] as const)("preserves %s timestamps and metadata through storage", role => {
    const message: UIMessage = {
      id: "message",
      role,
      parts: [{ type: "text", text: "Hello" }],
      metadata: { createdAt: 1_000, lastTokenAt: 2_000, modelId: "test-model" }
    }

    expect(storedMessageToUI(uiMessageToStored(message, "chat"))).toEqual(message)
  })

  it("uses the original database timestamp for legacy user messages", () => {
    const stored = uiMessageToStored(
      {
        id: "user",
        role: "user",
        parts: [{ type: "text", text: "Legacy message" }],
        metadata: { custom: "preserved" }
      },
      "chat"
    )
    stored.created_at = 1_000

    expect(storedMessageToUI(stored).metadata).toEqual({ createdAt: 1_000, custom: "preserved" })
  })

  it("restores a send timestamp when legacy user metadata is absent", () => {
    const stored = uiMessageToStored({ id: "user", role: "user", parts: [] }, "chat")
    stored.created_at = 2_000

    expect(storedMessageToUI(stored).metadata).toEqual({ createdAt: 2_000 })
  })

  it("does not invent a completion time for legacy assistant messages", () => {
    const message: UIMessage = { id: "assistant", role: "assistant", parts: [] }

    expect(storedMessageToUI(uiMessageToStored(message, "chat"))).toEqual(message)
  })
})
