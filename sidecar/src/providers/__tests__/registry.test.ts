import type { LanguageModel } from "ai"
import { beforeEach, describe, expect, it } from "vitest"
import type { ProviderConfig } from "../../type"
import type { IProvider } from "../base"
import { ProviderRegistry } from "../registry"

// Mock provider for testing
class MockProvider implements IProvider {
  readonly name = "mock-provider"

  createModel(modelId: string, _config: ProviderConfig): LanguageModel {
    // Return a minimal mock that satisfies the LanguageModel type
    // In real code, this would be created by a provider like createMinimax()
    return {
      specificationVersion: "v3",
      modelId: `${this.name}/${modelId}`,
      provider: this.name,
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error("Not implemented")
      },
      doStream: async () => {
        throw new Error("Not implemented")
      }
    } as LanguageModel
  }
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry

  beforeEach(() => {
    registry = new ProviderRegistry()
  })

  describe("register", () => {
    it("should register a provider successfully", () => {
      const provider = new MockProvider()

      registry.register(provider)

      expect(registry.has("mock-provider")).toBe(true)
    })

    it("should warn when registering duplicate provider", () => {
      const provider1 = new MockProvider()
      const provider2 = new MockProvider()

      registry.register(provider1)
      registry.register(provider2) // Should warn but not throw

      expect(registry.has("mock-provider")).toBe(true)
    })

    it("should throw error if registered after initialization", () => {
      const provider = new MockProvider()
      registry.register(provider)

      // Access get() to initialize the registry
      registry.get("mock-provider")

      const provider2 = new MockProvider()
      expect(() => {
        registry.register(provider2)
      }).toThrow(/after registry initialization/)
    })
  })

  describe("get", () => {
    it("should retrieve registered provider", () => {
      const provider = new MockProvider()
      registry.register(provider)

      const retrieved = registry.get("mock-provider")

      expect(retrieved).toBe(provider)
      expect(retrieved.name).toBe("mock-provider")
    })

    it("should throw error for unregistered provider", () => {
      expect(() => {
        registry.get("non-existent")
      }).toThrow(/Provider 'non-existent' not found/)
    })

    it("should lock registry on first get call", () => {
      const provider1 = new MockProvider()
      registry.register(provider1)

      registry.get("mock-provider")

      const provider2 = new MockProvider()
      expect(() => {
        registry.register(provider2)
      }).toThrow(/after registry initialization/)
    })
  })

  describe("has", () => {
    it("should return true for registered provider", () => {
      const provider = new MockProvider()
      registry.register(provider)

      expect(registry.has("mock-provider")).toBe(true)
    })

    it("should return false for unregistered provider", () => {
      expect(registry.has("non-existent")).toBe(false)
    })
  })

  describe("list", () => {
    it("should return empty array when no providers registered", () => {
      expect(registry.list()).toEqual([])
    })

    it("should return all registered provider names", () => {
      class Provider1 implements IProvider {
        readonly name = "provider1"
        createModel(): LanguageModel {
          return null as unknown as LanguageModel
        }
      }

      class Provider2 implements IProvider {
        readonly name = "provider2"
        createModel(): LanguageModel {
          return null as unknown as LanguageModel
        }
      }

      registry.register(new Provider1())
      registry.register(new Provider2())

      const names = registry.list()

      expect(names).toContain("provider1")
      expect(names).toContain("provider2")
      expect(names).toHaveLength(2)
    })
  })
})
