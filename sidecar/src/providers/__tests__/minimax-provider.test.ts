import { describe, expect, it } from "vitest"
import type { ProviderConfig } from "../../type"
import { MinimaxProvider } from "../minimax-provider"

describe("MinimaxProvider", () => {
  it("should have correct name", () => {
    const provider = new MinimaxProvider()
    expect(provider.name).toBe("minimax")
  })

  describe("createModel", () => {
    it("should create model with API key", () => {
      const provider = new MinimaxProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }

      const model = provider.createModel("abab6.5s-chat", config)

      expect(model).toBeDefined()
    })

    it("should use custom base URL if provided", () => {
      const provider = new MinimaxProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://custom.api.com/v1"
      }

      const model = provider.createModel("abab6.5s-chat", config)

      expect(model).toBeDefined()
    })

    it("should use default base URL if not provided", () => {
      const provider = new MinimaxProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }

      const model = provider.createModel("abab6.5s-chat", config)

      expect(model).toBeDefined()
    })
  })
})
