import { describe, expect, it } from "vitest"
import type { ProviderConfig } from "../../type"
import { AnthropicProvider } from "../anthropic-provider"

describe("AnthropicProvider", () => {
  it("should have correct name", () => {
    const provider = new AnthropicProvider()
    expect(provider.name).toBe("anthropic")
  })

  describe("createModel", () => {
    it("should create model with API key", () => {
      const provider = new AnthropicProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }

      const model = provider.createModel("claude-sonnet-4-5-20251022", config)

      expect(model).toBeDefined()
    })

    it("should use custom base URL if provided", () => {
      const provider = new AnthropicProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://custom.api.com/v1"
      }

      const model = provider.createModel("claude-sonnet-4-5-20251022", config)

      expect(model).toBeDefined()
    })

    it("should use default base URL if not provided", () => {
      const provider = new AnthropicProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }

      const model = provider.createModel("claude-sonnet-4-5-20251022", config)

      expect(model).toBeDefined()
    })
  })
})
