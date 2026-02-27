import { describe, expect, it } from "vitest"
import { BLOCKED_COMMANDS, SAFE_COMMANDS, validateCommand } from "../validator"

describe("Command Validator", () => {
  describe("validateCommand", () => {
    it("should allow safe commands", () => {
      for (const command of SAFE_COMMANDS) {
        const result = validateCommand(command)
        expect(result.isAllowed).toBe(true)
        expect(result.requiresApproval).toBe(false)
        expect(result.reason).toBeUndefined()
      }
    })

    it("should reject blocked commands", () => {
      for (const command of BLOCKED_COMMANDS) {
        const result = validateCommand(command)
        expect(result.isAllowed).toBe(false)
        expect(result.requiresApproval).toBe(false)
        expect(result.reason).toContain("blocked by policy")
      }
    })

    it("should require approval for commands outside safe and blocked lists", () => {
      const result = validateCommand("kubectl")
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it("should extract bare command from path", () => {
      const result = validateCommand("/usr/bin/ls")
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it("should handle commands with multiple path separators", () => {
      const result = validateCommand("/usr/local/bin/cat")
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it("should require approval for non-safe command extracted from path", () => {
      const result = validateCommand("/usr/bin/python3")
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it("should block rm with critical root target", () => {
      const result = validateCommand("rm", ["-rf", "/"])
      expect(result.isAllowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
      expect(result.reason).toContain("Blocking dangerous rm target")
    })

    it("should require approval for rm on non-critical targets", () => {
      const result = validateCommand("rm", ["-rf", "./tmp"])
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it("should block dd writes to device paths", () => {
      const result = validateCommand("dd", ["if=/dev/zero", "of=/dev/disk1"])
      expect(result.isAllowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
      expect(result.reason).toContain("Blocking dd writes directly to device paths")
    })

    it("should block recursive chmod on critical system paths", () => {
      const result = validateCommand("chmod", ["-R", "777", "/usr"])
      expect(result.isAllowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
      expect(result.reason).toContain("Blocking recursive chmod on critical system path")
    })
  })
})
