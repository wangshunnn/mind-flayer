/**
 * Bash execution tool for Mind Flayer
 * Allows AI agents to execute shell commands in isolated sandbox environments
 */

import { tool } from "ai"
import { z } from "zod"
import type { ITool } from "../base-tool"
import { executeCommand } from "./executor"
import { assertPlatformSupported } from "./platform"
import { validateCommand } from "./validator"
import { ensureChatWorkspace } from "./workspace"

/**
 * Bash execution tool implementation.
 * Implements ITool interface for plugin architecture.
 */
export class BashExecutionTool implements ITool {
  readonly name = "bashExecution"

  createInstance(chatId: string) {
    return bashExecutionTool(chatId)
  }
}

/**
 * Bash execution tool definition factory
 * This tool executes shell commands in an isolated sandbox environment
 * @param chatId - Chat session ID for workspace isolation
 */
export const bashExecutionTool = (chatId: string) => {
  // Check platform support on tool creation
  assertPlatformSupported()

  if (!chatId) {
    console.warn(
      "[BashExec] No chatId provided, will use temporary workspace (may not be cleaned up automatically)"
    )
  }

  return tool({
    description: `Execute shell commands in an isolated sandbox environment (macOS/Linux only; not supported on Windows).

IMPORTANT: Commands are executed using direct process spawn (not shell).
- Use 'command' field for the executable name (e.g., "ls", "cat", "grep")  
- Each flag or parameter must be a separate array element (e.g., ["-la"] or ["-l","-a"] NOT ["- la"])
- Do NOT use shell syntax like pipes (|), redirects (>, <), or command chains (;, &&, ||)
- Working directory is a temporary sandbox, but args can reference real file paths
- Safe commands (ls, cat, grep, etc.) execute immediately
- Dangerous commands (rm, chmod, etc.) may require user approval

Examples:
  ✅ { command: "ls", args: ["-la", "~/Desktop"] } - List Desktop files
  ✅ { command: "cat", args: ["~/Documents/file.txt"] } - Read real file
  ✅ { command: "find", args: [".", "-name", "*.ts"] } - Find in sandbox
  ❌ { command: "ls | grep test" } - NO: shell syntax not supported
  ❌ { command: "cat file.txt > output.txt" } - NO: use 'cp' command instead
  ❌ { command: "ls - la" } - NO: flags/args must be separate elements
  ❌ { command: "rm -rf /" } - NO: extremely dangerous command`,

    inputSchema: z.object({
      command: z
        .string()
        .min(1)
        .describe('The command to execute (bare name like "ls", not shell syntax)'),
      args: z
        .array(z.string())
        .default([])
        .describe(
          'Array of command arguments. Can include paths to real files (e.g., ["~/Desktop", "-la"])'
        )
    }),

    inputExamples: [
      {
        input: {
          command: "ls",
          args: ["-la", "~/Desktop"]
        }
      },
      {
        input: {
          command: "find",
          args: ["~/Documents", "-name", "*.pdf", "-type", "f"]
        }
      },
      {
        input: {
          command: "cat",
          args: ["~/config.json"]
        }
      }
    ],

    needsApproval: input => {
      const { command } = input
      const { requiresApproval } = validateCommand(command)
      if (requiresApproval) {
        console.info(
          `[BashExec] Command '${command}' is marked as dangerous - approval should be required`
        )
      }
      return requiresApproval
    },

    execute: async ({ command, args }, { abortSignal }) => {
      console.log(`[BashExec] Executing command: ${command} ${args.join(" ")}`)

      // Validate command
      const validation = validateCommand(command)
      if (!validation.isAllowed) {
        throw new Error(validation.reason || `Command '${command}' is not allowed for execution`)
      }

      try {
        // Ensure workspace exists for this chat
        const workspacePath = await ensureChatWorkspace(chatId)
        console.log(`[BashExec] Using workspace: ${workspacePath}`)

        // Execute the command
        const startTime = Date.now()
        const result = await executeCommand(
          command,
          args,
          workspacePath,
          abortSignal || new AbortController().signal
        )
        const duration = Date.now() - startTime

        console.log(
          `[BashExec] Execution completed in ${duration}ms with exit code ${result.exitCode}`
        )

        // Return structured result
        return {
          command,
          args,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          workingDir: workspacePath,
          executedAt: new Date().toISOString()
        }
      } catch (error) {
        console.error("[BashExec] Execution failed:", error)
        throw new Error(
          `Command execution failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  })
}
