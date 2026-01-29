import { describe, expect, it } from "vitest"
import { WebSearchTool } from "../web-search"

describe("WebSearchTool", () => {
  it("should have correct name", () => {
    const tool = new WebSearchTool()
    expect(tool.name).toBe("webSearch")
  })

  describe("createInstance", () => {
    it("should create tool instance with API key", () => {
      const tool = new WebSearchTool()
      const instance = tool.createInstance("test-api-key")

      expect(instance).toBeDefined()
      expect(instance.description).toBeDefined()
      expect(typeof instance.execute).toBe("function")
    })

    it("should create tool instance with empty API key", () => {
      const tool = new WebSearchTool()
      const instance = tool.createInstance("")

      expect(instance).toBeDefined()
    })

    it("should create different instances for different API keys", () => {
      const tool = new WebSearchTool()
      const instance1 = tool.createInstance("key1")
      const instance2 = tool.createInstance("key2")

      expect(instance1).toBeDefined()
      expect(instance2).toBeDefined()
      expect(instance1).not.toBe(instance2)
    })
  })
})
