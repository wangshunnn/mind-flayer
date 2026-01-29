import { beforeEach, describe, expect, it, vi } from "vitest"
import { ToolService } from "../tool-service"

// Mock the tool registry
vi.mock("../../tools", () => ({
  toolRegistry: {
    get: vi.fn((name: string) => ({
      name,
      createInstance: vi.fn((apiKey: string) => ({
        description: `Mock ${name}`,
        apiKey
      }))
    }))
  }
}))

describe("ToolService", () => {
  let service: ToolService

  beforeEach(() => {
    service = new ToolService()
  })

  describe("updateToolConfig", () => {
    it("should update tool configuration", () => {
      service.updateToolConfig("webSearch", "test-api-key")

      expect(service.hasToolInstance("webSearch")).toBe(true)
    })

    it("should replace existing tool instance", () => {
      service.updateToolConfig("webSearch", "old-key")
      service.updateToolConfig("webSearch", "new-key")

      expect(service.hasToolInstance("webSearch")).toBe(true)
    })
  })

  describe("getRequestTools", () => {
    it("should return empty object when web search is disabled", () => {
      const tools = service.getRequestTools({ useWebSearch: false })

      expect(tools).toEqual({})
    })

    it("should return web search tool when enabled and available", () => {
      service.updateToolConfig("webSearch", "test-key")

      const tools = service.getRequestTools({ useWebSearch: true })

      expect(tools).toHaveProperty("webSearch")
      expect(tools.webSearch).toBeDefined()
    })

    it("should initialize web search when requested but not available", () => {
      const consoleSpy = vi.spyOn(console, "warn")

      const tools = service.getRequestTools({ useWebSearch: true })

      expect(tools).toHaveProperty("webSearch")
      expect(tools.webSearch).toBeDefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Web search requested but instance not available; initializing with empty API key"
        )
      )

      consoleSpy.mockRestore()
    })
  })

  describe("hasToolInstance", () => {
    it("should return false for non-existent tool", () => {
      expect(service.hasToolInstance("webSearch")).toBe(false)
    })

    it("should return true for configured tool", () => {
      service.updateToolConfig("webSearch", "test-key")

      expect(service.hasToolInstance("webSearch")).toBe(true)
    })
  })
})
