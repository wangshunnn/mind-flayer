import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ConfigUpdateMessage, ProviderConfig } from "../../type"
import { ProviderService } from "../provider-service"

// Mock the provider registry
vi.mock("../../providers", () => ({
  providerRegistry: {
    get: vi.fn((name: string) => ({
      name,
      createModel: vi.fn((modelId: string, config: ProviderConfig) => ({
        modelId,
        provider: name,
        config
      }))
    }))
  }
}))

describe("ProviderService", () => {
  let service: ProviderService

  beforeEach(() => {
    service = new ProviderService()
  })

  describe("getConfig", () => {
    it("should return undefined for unconfigured provider", () => {
      const config = service.getConfig("minimax")
      expect(config).toBeUndefined()
    })

    it("should return config after update", () => {
      const message: ConfigUpdateMessage = {
        type: "config_update",
        configs: {
          minimax: { apiKey: "test-key" }
        }
      }

      service.updateConfigs(message)
      const config = service.getConfig("minimax")

      expect(config).toEqual({ apiKey: "test-key" })
    })
  })

  describe("hasConfig", () => {
    it("should return false for unconfigured provider", () => {
      expect(service.hasConfig("minimax")).toBe(false)
    })

    it("should return true for configured provider", () => {
      const message: ConfigUpdateMessage = {
        type: "config_update",
        configs: {
          minimax: { apiKey: "test-key" }
        }
      }

      service.updateConfigs(message)

      expect(service.hasConfig("minimax")).toBe(true)
    })
  })

  describe("updateConfigs", () => {
    it("should update single provider config", () => {
      const message: ConfigUpdateMessage = {
        type: "config_update",
        configs: {
          minimax: { apiKey: "test-key", baseUrl: "https://custom.com" }
        }
      }

      service.updateConfigs(message)

      expect(service.getConfig("minimax")).toEqual({
        apiKey: "test-key",
        baseUrl: "https://custom.com"
      })
    })

    it("should update multiple provider configs", () => {
      const message: ConfigUpdateMessage = {
        type: "config_update",
        configs: {
          minimax: { apiKey: "minimax-key" },
          parallel: { apiKey: "parallel-key" }
        }
      }

      service.updateConfigs(message)

      expect(service.hasConfig("minimax")).toBe(true)
      expect(service.hasConfig("parallel")).toBe(true)
    })

    it("should clear old configs when updating", () => {
      const message1: ConfigUpdateMessage = {
        type: "config_update",
        configs: {
          minimax: { apiKey: "old-key" }
        }
      }

      const message2: ConfigUpdateMessage = {
        type: "config_update",
        configs: {
          parallel: { apiKey: "new-key" }
        }
      }

      service.updateConfigs(message1)
      expect(service.hasConfig("minimax")).toBe(true)

      service.updateConfigs(message2)
      expect(service.hasConfig("minimax")).toBe(false)
      expect(service.hasConfig("parallel")).toBe(true)
    })
  })

  describe("createModel", () => {
    it("should throw error if provider not configured", () => {
      expect(() => {
        service.createModel("minimax", "abab6.5s-chat")
      }).toThrow(/Provider 'minimax' is not configured/)
    })

    it("should create model with configured provider", () => {
      const message: ConfigUpdateMessage = {
        type: "config_update",
        configs: {
          minimax: { apiKey: "test-key" }
        }
      }

      service.updateConfigs(message)
      const model = service.createModel("minimax", "abab6.5s-chat")

      expect(model).toBeDefined()
    })

    it("should pass config to provider plugin", () => {
      const config: ProviderConfig = {
        apiKey: "test-key",
        baseUrl: "https://custom.com"
      }

      const message: ConfigUpdateMessage = {
        type: "config_update",
        configs: {
          minimax: config
        }
      }

      service.updateConfigs(message)
      const model = service.createModel("minimax", "test-model")

      expect(model).toBeDefined()
      expect(typeof model).toBe("object")
    })
  })
})
