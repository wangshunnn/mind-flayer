import { beforeEach, describe, expect, it } from "vitest"
import type { ITool } from "../base-tool"
import { ToolRegistry } from "../registry"

// Mock tool for testing
class MockTool implements ITool {
  readonly name = "mock-tool"

  createInstance(apiKey: string) {
    return {
      description: "Mock tool",
      parameters: {} as unknown,
      execute: async () => ({ apiKey })
    }
  }
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  describe("register", () => {
    it("should register a tool successfully", () => {
      const tool = new MockTool()

      registry.register(tool)

      expect(registry.has("mock-tool")).toBe(true)
    })

    it("should warn when registering duplicate tool", () => {
      const tool1 = new MockTool()
      const tool2 = new MockTool()

      registry.register(tool1)
      registry.register(tool2) // Should warn but not throw

      expect(registry.has("mock-tool")).toBe(true)
    })

    it("should throw error if registered after initialization", () => {
      const tool = new MockTool()
      registry.register(tool)

      // Access get() to initialize the registry
      registry.get("mock-tool")

      const tool2 = new MockTool()
      expect(() => {
        registry.register(tool2)
      }).toThrow(/after registry initialization/)
    })
  })

  describe("get", () => {
    it("should retrieve registered tool", () => {
      const tool = new MockTool()
      registry.register(tool)

      const retrieved = registry.get("mock-tool")

      expect(retrieved).toBe(tool)
      expect(retrieved.name).toBe("mock-tool")
    })

    it("should throw error for unregistered tool", () => {
      expect(() => {
        registry.get("non-existent")
      }).toThrow(/Tool 'non-existent' not found/)
    })

    it("should lock registry on first get call", () => {
      const tool1 = new MockTool()
      registry.register(tool1)

      registry.get("mock-tool")

      const tool2 = new MockTool()
      expect(() => {
        registry.register(tool2)
      }).toThrow(/after registry initialization/)
    })
  })

  describe("has", () => {
    it("should return true for registered tool", () => {
      const tool = new MockTool()
      registry.register(tool)

      expect(registry.has("mock-tool")).toBe(true)
    })

    it("should return false for unregistered tool", () => {
      expect(registry.has("non-existent")).toBe(false)
    })
  })

  describe("list", () => {
    it("should return empty array when no tools registered", () => {
      expect(registry.list()).toEqual([])
    })

    it("should return all registered tool names", () => {
      class Tool1 implements ITool {
        readonly name = "tool1"
        createInstance() {
          return null
        }
      }

      class Tool2 implements ITool {
        readonly name = "tool2"
        createInstance() {
          return null
        }
      }

      registry.register(new Tool1())
      registry.register(new Tool2())

      const names = registry.list()

      expect(names).toContain("tool1")
      expect(names).toContain("tool2")
      expect(names).toHaveLength(2)
    })
  })
})
