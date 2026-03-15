import { describe, expect, it } from "vitest"
import { buildProviderOptions } from "../provider-options"

describe("buildProviderOptions", () => {
  it("returns anthropic effort options for supported models", () => {
    expect(
      buildProviderOptions({
        modelProvider: "anthropic",
        modelId: "claude-sonnet-4-6",
        reasoningEnabled: true,
        reasoningEffort: "xhigh"
      })
    ).toEqual({
      anthropic: {
        effort: "max"
      }
    })
  })

  it("returns anthropic disabled thinking when reasoning is off", () => {
    expect(
      buildProviderOptions({
        modelProvider: "anthropic",
        modelId: "claude-sonnet-4-6",
        reasoningEnabled: false,
        reasoningEffort: "high"
      })
    ).toEqual({
      anthropic: {
        thinking: {
          type: "disabled"
        }
      }
    })
  })

  it("returns openai reasoning effort for supported models", () => {
    expect(
      buildProviderOptions({
        modelProvider: "openai",
        modelId: "gpt-5",
        reasoningEnabled: true,
        reasoningEffort: "low"
      })
    ).toEqual({
      openai: {
        reasoningEffort: "low"
      }
    })
  })

  it("returns openai none effort when reasoning is off", () => {
    expect(
      buildProviderOptions({
        modelProvider: "openai",
        modelId: "o4-mini",
        reasoningEnabled: false,
        reasoningEffort: "high"
      })
    ).toEqual({
      openai: {
        reasoningEffort: "none"
      }
    })
  })

  it("falls back to undefined for unsupported models or default effort", () => {
    expect(
      buildProviderOptions({
        modelProvider: "openai",
        modelId: "gpt-4",
        reasoningEnabled: true,
        reasoningEffort: "xhigh"
      })
    ).toBeUndefined()

    expect(
      buildProviderOptions({
        modelProvider: "anthropic",
        modelId: "claude-sonnet-4-6",
        reasoningEnabled: true,
        reasoningEffort: "default"
      })
    ).toBeUndefined()
  })
})
