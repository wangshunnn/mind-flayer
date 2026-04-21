import { tool } from "ai"
import { z } from "zod"
import {
  type AgentSessionReadInput,
  type AgentSessionStartInput,
  type AgentSessionStopInput,
  agentSessionService
} from "../../services/agent-session-service"
import type { ITool } from "../base-tool"

const agentSchema = z.enum(["claude-code", "codex"])
const modeSchema = z.enum(["print", "exec", "review"])
const runModeSchema = z.enum(["foreground", "background"])
const permissionPresetSchema = z.enum(["default", "read-only", "workspace-write", "plan"])

export class AgentSessionStartTool implements ITool {
  readonly name = "agentSessionStart"

  createInstance(): ReturnType<typeof agentSessionStartTool> {
    return agentSessionStartTool()
  }
}

export class AgentSessionReadTool implements ITool {
  readonly name = "agentSessionRead"

  createInstance(): ReturnType<typeof agentSessionReadTool> {
    return agentSessionReadTool()
  }
}

export class AgentSessionStopTool implements ITool {
  readonly name = "agentSessionStop"

  createInstance(): ReturnType<typeof agentSessionStopTool> {
    return agentSessionStopTool()
  }
}

export const agentSessionStartTool = () =>
  tool({
    description: `Start a controlled external coding-agent session for Claude Code or Codex.

Use this only after loading a coding-agent skill that asks you to delegate work to Claude Code or Codex.
This tool does not execute arbitrary shell commands. It constructs one of the supported CLI invocations from structured fields.

Recommended modes:
- claude-code + print for one-shot Claude Code work
- codex + exec for one-shot Codex work
- codex + review for Codex code review

Use runMode=background only for long-running non-interactive jobs, then poll logs with agentSessionRead and stop abandoned jobs with agentSessionStop.
Interactive TUI sessions are not supported in Mind Flayer chat.`,

    inputSchema: z.object({
      agent: agentSchema.describe("External coding agent to run"),
      mode: modeSchema.describe("Agent mode. Claude supports print; Codex supports exec/review."),
      cwd: z.string().min(1).describe("Absolute project directory for the coding agent"),
      prompt: z.string().optional().default("").describe("Task instructions for the coding agent"),
      runMode: runModeSchema
        .optional()
        .describe("foreground waits for completion; background returns a sessionId immediately"),
      timeoutSeconds: z
        .number()
        .int()
        .min(1)
        .max(3600)
        .optional()
        .describe("Optional timeout for the session"),
      permissionPreset: permissionPresetSchema
        .optional()
        .default("default")
        .describe("Safe permission preset. Dangerous bypass modes are not available."),
      extraAllowedDirs: z
        .array(z.string().min(1))
        .optional()
        .default([])
        .describe("Additional absolute directories the CLI may access"),
      skipGitRepoCheck: z
        .boolean()
        .optional()
        .default(false)
        .describe("Allow Codex to run outside a git repository")
    }),

    needsApproval: () => true,

    execute: async input => agentSessionService.start(input as AgentSessionStartInput)
  })

export const agentSessionReadTool = () =>
  tool({
    description: `Read output and status from a running or completed external coding-agent session.

Use offset to continue reading from nextOffset returned by a previous call.`,

    inputSchema: z.object({
      sessionId: z.string().min(1).describe("Agent session id returned by agentSessionStart"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Optional output offset to continue from"),
      maxBytes: z
        .number()
        .int()
        .min(1)
        .max(102400)
        .optional()
        .describe("Maximum output bytes to return")
    }),

    execute: async input => agentSessionService.read(input as AgentSessionReadInput)
  })

export const agentSessionStopTool = () =>
  tool({
    description: "Stop a running external coding-agent session.",

    inputSchema: z.object({
      sessionId: z.string().min(1).describe("Agent session id returned by agentSessionStart")
    }),

    execute: async input => agentSessionService.stop(input as AgentSessionStopInput)
  })
