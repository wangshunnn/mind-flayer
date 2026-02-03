/**
 * Command executor for bash execution tool
 * Handles spawning processes with safety limits and resource control
 */

import { execFile, spawn } from "node:child_process"
import { homedir } from "node:os"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

// Keep PATH restriction consistent across resolution and execution
const RESTRICTED_PATH = "/usr/bin:/bin:/usr/local/bin"

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
 * Real user's home directory (cached)
 */
const USER_HOME = homedir()

/**
 * Expands tilde (~) in a path to the user's real home directory
 * @param path - Path that may contain tilde
 * @returns Expanded path
 */
function expandTilde(path: string): string {
  if (path.startsWith("~/")) {
    return path.replace("~", USER_HOME)
  }
  if (path === "~") {
    return USER_HOME
  }
  return path
}

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
      timeout: 5000,
      env: {
        PATH: RESTRICTED_PATH
      }
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

  // Expand tilde in all arguments to support paths like ~/Desktop
  const expandedArgs = args.map(expandTilde)

  // Restricted environment to prevent PATH manipulation
  const restrictedEnv = {
    PATH: RESTRICTED_PATH,
    LANG: "en_US.UTF-8",
    HOME: workingDir // Set HOME to sandbox for safety
  }

  return new Promise<ExecutionResult>((resolve, reject) => {
    let timedOut = false
    let stdoutData = ""
    let stderrData = ""
    let outputTruncated = false

    // Spawn the process with expanded arguments
    const child = spawn(resolvedPath, expandedArgs, {
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
