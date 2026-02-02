/**
 * Command executor for bash execution tool
 * Handles spawning processes with safety limits and resource control
 */

import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

// Safety constants
const TIMEOUT_MS = 30000 // 30 seconds
const MAX_OUTPUT_BYTES = 51200 // 50KB

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

/**
 * Cache for resolved command paths to avoid repeated lookups
 */
const commandPathCache = new Map<string, string>()

/**
 * Resolves a command to its full path using 'which'
 * @param command - The command name to resolve
 * @returns Full path to the command executable
 * @throws Error if command not found
 */
async function resolveCommandPath(command: string): Promise<string> {
  // Check cache first
  const cachedPath = commandPathCache.get(command)
  if (cachedPath) {
    return cachedPath
  }

  try {
    const { stdout } = await execFileAsync("which", [command], {
      timeout: 5000
    })
    const resolvedPath = stdout.trim()

    if (!resolvedPath) {
      throw new Error(`Command '${command}' not found in PATH`)
    }

    // Cache the result
    commandPathCache.set(command, resolvedPath)
    return resolvedPath
  } catch (error) {
    throw new Error(
      `Command '${command}' not found in PATH: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Executes a command with arguments in a specified working directory
 * @param cmd - The command to execute
 * @param args - Array of command arguments
 * @param workingDir - Working directory for command execution (sandbox)
 * @param abortSignal - Signal to abort execution
 * @returns Execution result with stdout, stderr, exit code, and timeout flag
 */
export async function executeCommand(
  cmd: string,
  args: string[],
  workingDir: string,
  abortSignal: AbortSignal
): Promise<ExecutionResult> {
  // Resolve command to full path
  const resolvedPath = await resolveCommandPath(cmd)

  // Restricted environment to prevent PATH manipulation
  const restrictedEnv = {
    PATH: "/usr/bin:/bin:/usr/local/bin",
    LANG: "en_US.UTF-8",
    HOME: workingDir // Set HOME to sandbox for safety
  }

  return new Promise<ExecutionResult>((resolve, reject) => {
    let timedOut = false
    let stdoutData = ""
    let stderrData = ""
    let outputTruncated = false

    // Spawn the process
    const child = spawn(resolvedPath, args, {
      cwd: workingDir,
      shell: false, // Critical: no shell to prevent injection
      env: restrictedEnv
    })

    // Timeout handler
    const timeoutHandle = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")

      // Force kill if still running after 2 seconds
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL")
        }
      }, 2000)
    }, TIMEOUT_MS)

    // Abort signal handler
    const abortHandler = () => {
      child.kill("SIGTERM")
      clearTimeout(timeoutHandle)

      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL")
        }
      }, 2000)
    }

    if (abortSignal) {
      abortSignal.addEventListener("abort", abortHandler)
    }

    // Collect stdout with size limit
    child.stdout.on("data", (chunk: Buffer) => {
      const currentSize = Buffer.byteLength(stdoutData, "utf-8")
      const chunkSize = chunk.length

      if (currentSize + chunkSize > MAX_OUTPUT_BYTES) {
        outputTruncated = true
        const remaining = MAX_OUTPUT_BYTES - currentSize
        if (remaining > 0) {
          stdoutData += chunk.toString("utf-8", 0, remaining)
        }
        child.kill("SIGTERM")
      } else {
        stdoutData += chunk.toString("utf-8")
      }
    })

    // Collect stderr with size limit
    child.stderr.on("data", (chunk: Buffer) => {
      const currentSize = Buffer.byteLength(stderrData, "utf-8")
      const chunkSize = chunk.length

      if (currentSize + chunkSize > MAX_OUTPUT_BYTES) {
        outputTruncated = true
        const remaining = MAX_OUTPUT_BYTES - currentSize
        if (remaining > 0) {
          stderrData += chunk.toString("utf-8", 0, remaining)
        }
        child.kill("SIGTERM")
      } else {
        stderrData += chunk.toString("utf-8")
      }
    })

    // Handle process completion
    child.on("close", (code, signal) => {
      clearTimeout(timeoutHandle)
      if (abortSignal) {
        abortSignal.removeEventListener("abort", abortHandler)
      }

      let exitCode = code ?? -1
      let finalStderr = stderrData

      // Add metadata to stderr for special cases
      if (timedOut) {
        exitCode = -1
        finalStderr += `\n[Error] Command execution timed out after ${TIMEOUT_MS / 1000} seconds`
      }

      if (outputTruncated) {
        finalStderr += `\n[Warning] Output exceeded ${MAX_OUTPUT_BYTES / 1024}KB limit and was truncated`
      }

      if (signal) {
        finalStderr += `\n[Info] Process terminated by signal: ${signal}`
      }

      resolve({
        stdout: stdoutData,
        stderr: finalStderr,
        exitCode,
        timedOut
      })
    })

    // Handle spawn errors
    child.on("error", error => {
      clearTimeout(timeoutHandle)
      if (abortSignal) {
        abortSignal.removeEventListener("abort", abortHandler)
      }

      reject(new Error(`Failed to execute command '${cmd}': ${error.message}`))
    })
  })
}
