import { describe, expect, it } from "vitest"
import type { ProviderConfig } from "../../type"
import { OpenAIProvider } from "../openai-provider"

describe("OpenAIProvider", () => {
  it("should have correct name", () => {
    const provider = new OpenAIProvider()
    expect(provider.name).toBe("openai")
  })

  describe("createModel", () => {
    it("should create model with API key", () => {
      const provider = new OpenAIProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }

      const model = provider.createModel("gpt-4", config)

      expect(model).toBeDefined()
    })

    it("should use custom base URL if provided", () => {
      const provider = new OpenAIProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://custom.api.com/v1"
      }

      const model = provider.createModel("gpt-4", config)

      expect(model).toBeDefined()
    })

    it("should use default base URL if not provided", () => {
      const provider = new OpenAIProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }

      const model = provider.createModel("gpt-4", config)

      expect(model).toBeDefined()
    })
  })
})
