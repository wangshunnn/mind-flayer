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
        thinking: {
          type: "adaptive"
        },
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

  it("returns MiniMax adaptive thinking for M3 when reasoning is on", () => {
    expect(
      buildProviderOptions({
        modelProvider: "minimax",
        modelId: "MiniMax-M3",
        reasoningEnabled: true,
        reasoningEffort: "xhigh"
      })
    ).toEqual({
      minimax: {
        thinking: {
          type: "adaptive"
        }
      }
    })
  })

  it("returns MiniMax disabled thinking for M3 when reasoning is off", () => {
    expect(
      buildProviderOptions({
        modelProvider: "minimax",
        modelId: "MiniMax-M3",
        reasoningEnabled: false,
        reasoningEffort: "high"
      })
    ).toEqual({
      minimax: {
        thinking: {
          type: "disabled"
        }
      }
    })
  })

  it("does not pass MiniMax thinking controls for M2.7 because it cannot be disabled", () => {
    expect(
      buildProviderOptions({
        modelProvider: "minimax",
        modelId: "MiniMax-M2.7",
        reasoningEnabled: false,
        reasoningEffort: "high"
      })
    ).toBeUndefined()
  })

  it("falls back to undefined for unsupported models", () => {
    expect(
      buildProviderOptions({
        modelProvider: "openai",
        modelId: "gpt-4",
        reasoningEnabled: true,
        reasoningEffort: "xhigh"
      })
    ).toBeUndefined()
  })

  it("returns adaptive thinking for anthropic default effort", () => {
    expect(
      buildProviderOptions({
        modelProvider: "anthropic",
        modelId: "claude-sonnet-4-6",
        reasoningEnabled: true,
        reasoningEffort: "default"
      })
    ).toEqual({
      anthropic: {
        thinking: {
          type: "adaptive"
        }
      }
    })
  })

  it("returns deepseek thinking enabled for v4 models", () => {
    expect(
      buildProviderOptions({
        modelProvider: "deepseek",
        modelId: "deepseek-v4-pro",
        reasoningEnabled: true,
        reasoningEffort: "xhigh"
      })
    ).toEqual({
      deepseek: {
        thinking: {
          type: "enabled"
        }
      }
    })
  })

  it("returns deepseek thinking disabled when reasoning is off", () => {
    expect(
      buildProviderOptions({
        modelProvider: "deepseek",
        modelId: "deepseek-v4-flash",
        reasoningEnabled: false,
        reasoningEffort: "high"
      })
    ).toEqual({
      deepseek: {
        thinking: {
          type: "disabled"
        }
      }
    })
  })

  it("does not pass deepseek reasoning effort until the AI SDK provider supports it", () => {
    expect(
      buildProviderOptions({
        modelProvider: "deepseek",
        modelId: "deepseek-v4-flash",
        reasoningEnabled: true,
        reasoningEffort: "low"
      })
    ).toEqual({
      deepseek: {
        thinking: {
          type: "enabled"
        }
      }
    })
  })
})
