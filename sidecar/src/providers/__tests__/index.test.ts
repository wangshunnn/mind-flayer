import { describe, expect, it } from "vitest"
import { providerRegistry } from "../index"

describe("providerRegistry built-in providers", () => {
  it("registers minimax, openai, and anthropic", () => {
    const providerNames = providerRegistry.list()

    expect(providerNames).toContain("minimax")
    expect(providerNames).toContain("openai")
    expect(providerNames).toContain("anthropic")
  })
})
