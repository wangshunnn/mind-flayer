import { describe, expect, it } from "vitest"
import { providerRegistry } from "../index"

describe("providerRegistry built-in providers", () => {
  it("registers minimax, openai, anthropic, deepseek, and zhipu", () => {
    const providerNames = providerRegistry.list()

    expect(providerNames).toContain("minimax")
    expect(providerNames).toContain("openai")
    expect(providerNames).toContain("anthropic")
    expect(providerNames).toContain("deepseek")
    expect(providerNames).toContain("zhipu")
  })
})
