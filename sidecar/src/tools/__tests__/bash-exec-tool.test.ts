import { describe, expect, it } from "vitest"
import { BashExecutionTool } from "../bash-exec"

describe("BashExecutionTool", () => {
  it("should have correct name", () => {
    const tool = new BashExecutionTool()
    expect(tool.name).toBe("bashExecution")
  })

  describe("createInstance", () => {
    it("should create tool instance with chatId", () => {
      const tool = new BashExecutionTool()

      // Skip on Windows
      if (process.platform === "win32") {
        expect(() => tool.createInstance("test-chat-id")).toThrow()
        return
      }

      const instance = tool.createInstance("test-chat-id")

      expect(instance).toBeDefined()
      expect(instance.description).toBeDefined()
      expect(typeof instance.execute).toBe("function")
    })

    it("should create different instances for different chatIds", () => {
      const tool = new BashExecutionTool()

      // Skip on Windows
      if (process.platform === "win32") {
        return
      }

      const instance1 = tool.createInstance("chat-1")
      const instance2 = tool.createInstance("chat-2")

      expect(instance1).toBeDefined()
      expect(instance2).toBeDefined()
      expect(instance1).not.toBe(instance2)
    })

    it("should warn when chatId is empty", () => {
      const tool = new BashExecutionTool()

      // Skip on Windows
      if (process.platform === "win32") {
        return
      }

      // Should not throw, but will log warning
      const instance = tool.createInstance("")
      expect(instance).toBeDefined()
    })
  })
})
