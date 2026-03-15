import { describe, expect, it } from "vitest"
import { resolveReasoningEffort, supportsAdjustableReasoningEffort } from "@/lib/reasoning"

describe("supportsAdjustableReasoningEffort", () => {
  it("supports current anthropic claude 4.x models", () => {
    expect(supportsAdjustableReasoningEffort("anthropic", "claude-sonnet-4.6")).toBe(true)
    expect(supportsAdjustableReasoningEffort("anthropic", "claude-opus-4.6")).toBe(true)
  })

  it("supports openai reasoning-capable model families", () => {
    expect(supportsAdjustableReasoningEffort("openai", "gpt-5.4")).toBe(true)
    expect(supportsAdjustableReasoningEffort("openai", "gpt-5.2-pro")).toBe(true)
  })

  it("does not support the current legacy openai catalog", () => {
    expect(supportsAdjustableReasoningEffort("openai", "gpt-4")).toBe(false)
    expect(supportsAdjustableReasoningEffort("openai", "gpt-4-turbo")).toBe(false)
    expect(supportsAdjustableReasoningEffort("openai", "gpt-3.5-turbo")).toBe(false)
  })
})

describe("resolveReasoningEffort", () => {
  it("keeps the preferred effort when the selected model supports it", () => {
    expect(resolveReasoningEffort("anthropic", "claude-sonnet-4.6", "high")).toBe("high")
  })

  it("falls back to default when the selected model does not support adjustable effort", () => {
    expect(resolveReasoningEffort("openai", "gpt-4", "xhigh")).toBe("default")
  })
})
