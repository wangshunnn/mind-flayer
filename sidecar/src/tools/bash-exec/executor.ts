/**
 * Command executor for bash execution tool
 * Handles spawning processes with safety limits and resource control
 */

import { execFile, spawn } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, dirname, isAbsolute, join, relative } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const USER_HOME = homedir()

// Keep PATH restriction consistent across resolution and execution.
// Start with common system locations, then append trusted user-managed runtime
// directories so node/npm/pnpm from nvm/asdf/volta-style installs stay usable
// without opening execution to arbitrary PATH entries.
const BASE_RESTRICTED_PATH_ENTRIES = [
  "/usr/bin",
  "/bin",
  "/usr/local/bin",
  "/usr/sbin",
  "/sbin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin"
] as const

const TRUSTED_USER_PATH_PREFIXES = [
  join(USER_HOME, ".asdf"),
  join(USER_HOME, ".bun"),
  join(USER_HOME, ".fnm"),
  join(USER_HOME, ".local", "bin"),
  join(USER_HOME, ".local", "share", "fnm"),
  join(USER_HOME, ".local", "share", "mise"),
  join(USER_HOME, ".mise"),
  join(USER_HOME, ".nvm"),
  join(USER_HOME, ".volta"),
  join(USER_HOME, "Library", "pnpm")
] as const

const DISCOVERED_USER_PATH_CANDIDATES = [
  join(USER_HOME, ".asdf", "shims"),
  join(USER_HOME, ".bun", "bin"),
  join(USER_HOME, ".local", "bin"),
  join(USER_HOME, ".local", "share", "mise", "shims"),
  join(USER_HOME, ".mise", "shims"),
  join(USER_HOME, ".volta", "bin"),
  join(USER_HOME, "Library", "pnpm")
] as const

const GRAPHICS_ENV_KEYS = [
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "XDG_RUNTIME_DIR",
  "DBUS_SESSION_BUS_ADDRESS",
  "XAUTHORITY"
] as const

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

function isPathWithinPrefix(pathEntry: string, prefix: string): boolean {
  const relativePath = relative(prefix, pathEntry)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

function isTrustedUserPathEntry(pathEntry: string): boolean {
  return TRUSTED_USER_PATH_PREFIXES.some(prefix => isPathWithinPrefix(pathEntry, prefix))
}

function listExistingPathEntries(pathEntries: readonly string[]): string[] {
  return pathEntries.filter(pathEntry => existsSync(pathEntry))
}

function discoverVersionedBinDirectories(
  rootDir: string,
  suffixParts: readonly string[]
): string[] {
  if (!existsSync(rootDir)) {
    return []
  }

  try {
    return readdirSync(rootDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(rootDir, entry.name, ...suffixParts))
      .filter(pathEntry => existsSync(pathEntry))
  } catch {
    return []
  }
}

function getInheritedTrustedPathEntries(): string[] {
  return (process.env.PATH?.split(delimiter) ?? [])
    .map(entry => expandTilde(entry.trim()))
    .filter(Boolean)
    .filter(isAbsolute)
    .filter(isTrustedUserPathEntry)
}

export function getRestrictedPath(): string {
  const discoveredUserPathEntries = [
    ...listExistingPathEntries(DISCOVERED_USER_PATH_CANDIDATES),
    ...discoverVersionedBinDirectories(join(USER_HOME, ".nvm", "versions", "node"), ["bin"]),
    ...discoverVersionedBinDirectories(join(USER_HOME, ".nvm", "versions", "io.js"), ["bin"])
  ]

  return Array.from(
    new Set([
      ...BASE_RESTRICTED_PATH_ENTRIES,
      dirname(process.execPath),
      ...discoveredUserPathEntries,
      ...getInheritedTrustedPathEntries()
    ])
  ).join(delimiter)
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
        PATH: getRestrictedPath()
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

function buildExecutionEnv(workingDir: string): NodeJS.ProcessEnv {
  const executionEnv: NodeJS.ProcessEnv = {
    PATH: getRestrictedPath(),
    LANG: "en_US.UTF-8",
    HOME: USER_HOME,
    MIND_FLAYER_SESSION_DIR: workingDir
  }

  for (const key of GRAPHICS_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) {
      executionEnv[key] = value
    }
  }

  return executionEnv
}

/**
 * Executes a command with arguments in a specified working directory
 * @param cmd - The command to execute
 * @param args - Array of command arguments
 * @param workingDir - Working directory for command execution (session sandbox)
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

  const executionEnv = buildExecutionEnv(workingDir)

  return new Promise<ExecutionResult>((resolve, reject) => {
    let timedOut = false
    let stdoutData = ""
    let stderrData = ""
    let outputTruncated = false

    // Spawn the process with expanded arguments
    const child = spawn(resolvedPath, expandedArgs, {
      cwd: workingDir,
      shell: false, // Critical: no shell to prevent injection
      env: executionEnv
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
