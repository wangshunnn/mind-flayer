import { describe, expect, it } from "vitest"
import { BLOCKED_COMMANDS, DANGEROUS_COMMANDS, validateCommand } from "../validator"

describe("Command Validator", () => {
  describe("validateCommand", () => {
    it("should reject blocked commands", () => {
      for (const command of BLOCKED_COMMANDS) {
        const result = validateCommand(command)
        expect(result.isAllowed).toBe(false)
        expect(result.requiresApproval).toBe(false)
        expect(result.reason).toContain("blocked by policy")
      }
    })

    it("should require approval for dangerous commands on desktop", () => {
      for (const command of DANGEROUS_COMMANDS) {
        const result = validateCommand(command)
        expect(result.isAllowed).toBe(true)
        expect(result.requiresApproval).toBe(true)
        expect(result.reason).toBeUndefined()
      }
    })

    it("should auto-allow dangerous commands for channel source", () => {
      for (const command of DANGEROUS_COMMANDS) {
        const result = validateCommand(command, [], "channel")
        expect(result.isAllowed).toBe(true)
        expect(result.requiresApproval).toBe(false)
      }
    })

    it("should auto-allow commands not in blocked or dangerous lists", () => {
      const normalCommands = [
        "ls",
        "cat",
        "grep",
        "python3",
        "node",
        "git",
        "curl",
        "kubectl",
        "cargo",
        "npm"
      ]
      for (const command of normalCommands) {
        const result = validateCommand(command)
        expect(result.isAllowed).toBe(true)
        expect(result.requiresApproval).toBe(false)
        expect(result.reason).toBeUndefined()
      }
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

    it("should auto-allow non-dangerous command extracted from path", () => {
      const result = validateCommand("/usr/bin/python3")
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it("should require approval for dangerous command extracted from path (desktop)", () => {
      const result = validateCommand("/usr/bin/rm", ["-rf", "./tmp"])
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it("should block rm with critical root target", () => {
      const result = validateCommand("rm", ["-rf", "/"])
      expect(result.isAllowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
      expect(result.reason).toContain("Blocking dangerous rm target")
    })

    it("should require approval for rm on non-critical targets (desktop)", () => {
      const result = validateCommand("rm", ["-rf", "./tmp"])
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it("should auto-allow rm on non-critical targets for channel source", () => {
      const result = validateCommand("rm", ["-rf", "./tmp"], "channel")
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
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
