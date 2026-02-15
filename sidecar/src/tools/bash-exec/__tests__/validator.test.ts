import { describe, expect, it } from "vitest"
import { DANGEROUS_COMMANDS, SAFE_COMMANDS, validateCommand } from "../validator"

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

    it("should flag dangerous commands for approval", () => {
      for (const command of DANGEROUS_COMMANDS) {
        const result = validateCommand(command)
        expect(result.isAllowed).toBe(true)
        expect(result.requiresApproval).toBe(true)
        expect(result.reason).toBeUndefined()
      }
    })

    it("should allow common execution commands with approval", () => {
      for (const command of [
        "python3",
        "python",
        "tee",
        "curl",
        "wget",
        "git",
        "ssh",
        "scp",
        "ping",
        "sed",
        "awk"
      ]) {
        const result = validateCommand(command)
        expect(result.isAllowed).toBe(true)
        expect(result.requiresApproval).toBe(true)
      }
    })

    it("should reject commands not in whitelist", () => {
      const result = validateCommand("kubectl")
      expect(result.isAllowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
      expect(result.reason).toContain("not in the allowed command list")
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

    it("should extract bare dangerous command from path", () => {
      const result = validateCommand("/usr/bin/python3")
      expect(result.isAllowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })
  })
})
