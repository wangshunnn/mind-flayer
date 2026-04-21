import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { access, mkdir, readFile, realpath, rm, stat } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { delimiter, isAbsolute, relative, resolve } from "node:path"
import { getRestrictedPath } from "../tools/bash-exec/executor"

export type AgentSessionAgent = "claude-code" | "codex"
export type AgentSessionMode = "print" | "interactive" | "exec" | "review"
export type AgentSessionRunMode = "foreground" | "background"
export type AgentSessionPermissionPreset = "default" | "read-only" | "workspace-write" | "plan"
export type AgentSessionStatus = "running" | "exited" | "failed" | "stopped"
export type AgentSessionSendKey = "Enter" | "Down" | "Up" | "CtrlC" | "CtrlD" | "Esc"

export interface AgentSessionStartInput {
  agent: AgentSessionAgent
  mode: AgentSessionMode
  cwd: string
  prompt?: string
  runMode?: AgentSessionRunMode
  timeoutSeconds?: number
  permissionPreset?: AgentSessionPermissionPreset
  extraAllowedDirs?: string[]
  skipGitRepoCheck?: boolean
}

export interface AgentSessionSendInput {
  sessionId: string
  text?: string
  key?: AgentSessionSendKey
}

export interface AgentSessionReadInput {
  sessionId: string
  offset?: number
  maxBytes?: number
}

export interface AgentSessionStopInput {
  sessionId: string
}

export interface AgentSessionCommandSpec {
  executable: string
  args: string[]
  previewArgs: string[]
}

export interface AgentSessionToolOutput {
  sessionId: string
  agent: AgentSessionAgent
  mode: AgentSessionMode
  cwd: string
  status: AgentSessionStatus
  exitCode: number | null
  startedAt: string
  updatedAt: string
  output: string
  nextOffset: number | null
  commandPreview: string
}

type SessionRecord = {
  sessionId: string
  agent: AgentSessionAgent
  mode: AgentSessionMode
  cwd: string
  status: AgentSessionStatus
  exitCode: number | null
  startedAt: Date
  updatedAt: Date
  commandPreview: string
  output: string
  outputBaseOffset: number
  child: ChildProcessWithoutNullStreams
  timeoutHandle: NodeJS.Timeout | null
  outputLastMessagePath: string | null
  finalizeOutputPromise: Promise<void> | null
}

const AGENT_EXECUTABLES: Record<AgentSessionAgent, string> = {
  "claude-code": "claude",
  codex: "codex"
}

const MAX_SESSION_OUTPUT_BYTES = 256 * 1024
const DEFAULT_READ_BYTES = 50 * 1024
const MAX_READ_BYTES = 100 * 1024
const DEFAULT_FOREGROUND_TIMEOUT_SECONDS = 300
const MAX_TIMEOUT_SECONDS = 3600
const CRITICAL_CWD_PREFIXES = ["/System", "/usr", "/bin", "/sbin", "/etc"]
const CRITICAL_CWD_EXACT = new Set(["/", "/private", "/var"])
const AGENT_SESSION_TEMP_DIR_NAME = "mind-flayer-agent-sessions"

interface BuildAgentSessionCommandOptions {
  outputLastMessagePath?: string
}

function expandUserPath(path: string): string {
  if (path === "~") {
    return homedir()
  }
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2))
  }
  return path
}

function normalizePath(path: string): string {
  return resolve(expandUserPath(path))
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value
  }
  return `'${value.replaceAll("'", "'\\''")}'`
}

function buildCommandPreview(executable: string, args: string[]): string {
  return [executable, ...args].map(shellQuote).join(" ")
}

function normalizeTimeoutSeconds(
  timeoutSeconds: number | undefined,
  runMode: AgentSessionRunMode
): number | null {
  if (timeoutSeconds === undefined || timeoutSeconds === null) {
    return runMode === "foreground" ? DEFAULT_FOREGROUND_TIMEOUT_SECONDS : null
  }

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error("timeoutSeconds must be a positive number when provided")
  }

  return Math.min(Math.floor(timeoutSeconds), MAX_TIMEOUT_SECONDS)
}

function normalizeRunMode(input: AgentSessionStartInput): AgentSessionRunMode {
  if (input.runMode) {
    return input.runMode
  }

  return "foreground"
}

function validateModeForAgent(agent: AgentSessionAgent, mode: AgentSessionMode): void {
  if (mode === "interactive") {
    throw new Error(
      "Interactive PTY sessions are not supported in Mind Flayer chat. Use claude-code print, codex exec, or codex review instead."
    )
  }

  if (agent === "claude-code" && mode !== "print") {
    throw new Error("Claude Code supports only print mode in Mind Flayer chat")
  }

  if (agent === "codex" && mode !== "exec" && mode !== "review") {
    throw new Error("Codex supports only exec or review mode in Mind Flayer chat")
  }
}

function appendClaudePermissionArgs(
  args: string[],
  permissionPreset: AgentSessionPermissionPreset
): void {
  if (permissionPreset === "read-only") {
    args.push("--allowedTools", "Read")
    return
  }

  if (permissionPreset === "workspace-write") {
    args.push("--permission-mode", "acceptEdits")
    return
  }

  if (permissionPreset === "plan") {
    args.push("--permission-mode", "plan")
  }
}

function appendCodexPermissionArgs(
  args: string[],
  permissionPreset: AgentSessionPermissionPreset
): void {
  if (permissionPreset === "read-only" || permissionPreset === "plan") {
    args.push("--sandbox", "read-only")
    return
  }

  if (permissionPreset === "workspace-write") {
    args.push("--full-auto")
  }
}

function appendCodexReviewPermissionArgs(
  args: string[],
  permissionPreset: AgentSessionPermissionPreset
): void {
  if (permissionPreset === "workspace-write") {
    args.push("--full-auto")
  }
}

function appendExtraAllowedDirs(args: string[], dirs: string[], flag = "--add-dir"): void {
  for (const dir of dirs) {
    args.push(flag, dir)
  }
}

function buildClaudeCommand(
  input: RequiredNormalizedAgentSessionStartInput
): AgentSessionCommandSpec {
  const args: string[] = []

  if (input.mode === "print") {
    args.push("-p", input.prompt)
    args.push("--output-format", "text")
    args.push("--max-turns", "10")
  } else {
    args.push("--name", "mind-flayer")
    if (input.prompt.trim()) {
      args.push(input.prompt)
    }
  }

  appendClaudePermissionArgs(args, input.permissionPreset)
  appendExtraAllowedDirs(args, input.extraAllowedDirs)

  return {
    executable: AGENT_EXECUTABLES[input.agent],
    args,
    previewArgs: args
  }
}

function buildCodexCommand(
  input: RequiredNormalizedAgentSessionStartInput,
  options: BuildAgentSessionCommandOptions
): AgentSessionCommandSpec {
  const args: string[] = []

  if (input.mode === "exec") {
    args.push("exec", "--cd", input.cwd, "--color", "never")
    appendCodexPermissionArgs(args, input.permissionPreset)
    if (input.skipGitRepoCheck) {
      args.push("--skip-git-repo-check")
    }
    appendExtraAllowedDirs(args, input.extraAllowedDirs)
    if (options.outputLastMessagePath) {
      args.push("--output-last-message", options.outputLastMessagePath)
    }
    if (input.prompt.trim()) {
      args.push(input.prompt)
    }
  } else if (input.mode === "review") {
    args.push("exec", "review")
    appendCodexReviewPermissionArgs(args, input.permissionPreset)
    if (input.skipGitRepoCheck) {
      args.push("--skip-git-repo-check")
    }
    if (options.outputLastMessagePath) {
      args.push("--output-last-message", options.outputLastMessagePath)
    }
    if (input.prompt.trim()) {
      args.push(input.prompt)
    }
  } else {
    args.push("--cd", input.cwd, "--no-alt-screen")
    appendCodexPermissionArgs(args, input.permissionPreset)
    appendExtraAllowedDirs(args, input.extraAllowedDirs)
    if (input.prompt.trim()) {
      args.push(input.prompt)
    }
  }

  return {
    executable: AGENT_EXECUTABLES[input.agent],
    args,
    previewArgs: args
  }
}

type RequiredNormalizedAgentSessionStartInput = Required<
  Pick<
    AgentSessionStartInput,
    | "agent"
    | "mode"
    | "cwd"
    | "prompt"
    | "permissionPreset"
    | "extraAllowedDirs"
    | "skipGitRepoCheck"
  >
>

export function buildAgentSessionCommand(
  input: RequiredNormalizedAgentSessionStartInput,
  options: BuildAgentSessionCommandOptions = {}
): AgentSessionCommandSpec {
  validateModeForAgent(input.agent, input.mode)

  if (input.agent === "claude-code") {
    return buildClaudeCommand(input)
  }

  return buildCodexCommand(input, options)
}

async function createOutputLastMessagePath(
  input: RequiredNormalizedAgentSessionStartInput,
  sessionId: string
): Promise<string | null> {
  if (input.agent !== "codex" || (input.mode !== "exec" && input.mode !== "review")) {
    return null
  }

  const outputDir = resolve(tmpdir(), AGENT_SESSION_TEMP_DIR_NAME)
  await mkdir(outputDir, { recursive: true })
  return resolve(outputDir, `${sessionId}-last-message.txt`)
}

async function assertExecutableExists(executable: string): Promise<void> {
  const searchPath = getRestrictedPath().split(delimiter).filter(Boolean)
  for (const pathEntry of searchPath) {
    try {
      await access(resolve(pathEntry, executable), fsConstants.X_OK)
      return
    } catch {}
  }

  throw new Error(`Required CLI '${executable}' was not found in PATH`)
}

async function resolveDirectory(path: string, label: string): Promise<string> {
  const normalizedPath = normalizePath(path)
  let resolvedPath: string
  let fileInfo: Awaited<ReturnType<typeof stat>>

  try {
    resolvedPath = await realpath(normalizedPath)
    fileInfo = await stat(resolvedPath)
  } catch (error) {
    throw new Error(
      `${label} '${normalizedPath}' is not accessible: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  if (!fileInfo.isDirectory()) {
    throw new Error(`${label} '${resolvedPath}' must be a directory`)
  }

  return resolvedPath
}

function assertSafeWorkingDirectory(cwd: string): void {
  const home = homedir()
  if (cwd === home || CRITICAL_CWD_EXACT.has(cwd)) {
    throw new Error("cwd must be a specific project directory, not a filesystem root")
  }

  if (CRITICAL_CWD_PREFIXES.some(prefix => cwd === prefix || cwd.startsWith(`${prefix}/`))) {
    throw new Error(`Refusing to run an external coding agent in critical directory '${cwd}'`)
  }
}

async function assertGitRepository(cwd: string, skipGitRepoCheck: boolean): Promise<void> {
  if (skipGitRepoCheck) {
    return
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      env: {
        ...process.env,
        PATH: getRestrictedPath()
      },
      stdio: "ignore"
    })

    child.on("error", error => {
      rejectPromise(new Error(`Failed to check git repository: ${error.message}`))
    })
    child.on("close", code => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error("Codex sessions must run inside a git repository"))
    })
  })
}

async function normalizeStartInput(input: AgentSessionStartInput): Promise<{
  normalizedInput: RequiredNormalizedAgentSessionStartInput
  runMode: AgentSessionRunMode
  timeoutSeconds: number | null
}> {
  validateModeForAgent(input.agent, input.mode)

  const cwd = await resolveDirectory(input.cwd, "cwd")
  assertSafeWorkingDirectory(cwd)

  const extraAllowedDirs = await Promise.all(
    (input.extraAllowedDirs ?? []).map(dir => resolveDirectory(dir, "extraAllowedDirs entry"))
  )

  for (const dir of extraAllowedDirs) {
    if (dir === cwd || isPathInside(cwd, dir)) {
      continue
    }
    assertSafeWorkingDirectory(dir)
  }

  if (input.agent === "codex") {
    await assertGitRepository(cwd, input.skipGitRepoCheck === true)
  }

  const executable = AGENT_EXECUTABLES[input.agent]
  await assertExecutableExists(executable)

  const runMode = normalizeRunMode(input)
  const timeoutSeconds = normalizeTimeoutSeconds(input.timeoutSeconds, runMode)

  return {
    normalizedInput: {
      agent: input.agent,
      mode: input.mode,
      cwd,
      prompt: input.prompt ?? "",
      permissionPreset: input.permissionPreset ?? "default",
      extraAllowedDirs,
      skipGitRepoCheck: input.skipGitRepoCheck === true
    },
    runMode,
    timeoutSeconds
  }
}

function getSendKeySequence(key: AgentSessionSendKey): string {
  switch (key) {
    case "Enter":
      return "\n"
    case "Down":
      return "\u001b[B"
    case "Up":
      return "\u001b[A"
    case "CtrlC":
      return "\u0003"
    case "CtrlD":
      return "\u0004"
    case "Esc":
      return "\u001b"
  }
}

export class AgentSessionService {
  private sessions = new Map<string, SessionRecord>()

  async start(input: AgentSessionStartInput): Promise<AgentSessionToolOutput> {
    const { normalizedInput, runMode, timeoutSeconds } = await normalizeStartInput(input)
    const sessionId = randomUUID()
    const outputLastMessagePath = await createOutputLastMessagePath(normalizedInput, sessionId)
    const commandSpec = buildAgentSessionCommand(normalizedInput, {
      outputLastMessagePath: outputLastMessagePath ?? undefined
    })
    const now = new Date()
    const commandPreview = buildCommandPreview(commandSpec.executable, commandSpec.previewArgs)

    const child = spawn(commandSpec.executable, commandSpec.args, {
      cwd: normalizedInput.cwd,
      env: {
        ...process.env,
        PATH: getRestrictedPath(),
        LANG: process.env.LANG ?? "en_US.UTF-8",
        TERM: process.env.TERM ?? "xterm-256color",
        NO_COLOR: "1"
      },
      shell: false
    })

    const session: SessionRecord = {
      sessionId,
      agent: normalizedInput.agent,
      mode: normalizedInput.mode,
      cwd: normalizedInput.cwd,
      status: "running",
      exitCode: null,
      startedAt: now,
      updatedAt: now,
      commandPreview,
      output: "",
      outputBaseOffset: 0,
      child,
      timeoutHandle: null,
      outputLastMessagePath,
      finalizeOutputPromise: null
    }

    this.sessions.set(sessionId, session)
    this.attachChildListeners(session)
    this.closeNonInteractiveStdin(session)

    if (timeoutSeconds !== null) {
      session.timeoutHandle = setTimeout(() => {
        this.appendOutput(
          session,
          `\n[Mind Flayer] Agent session timed out after ${timeoutSeconds}s\n`
        )
        this.stopSessionRecord(session, "failed")
      }, timeoutSeconds * 1000)
    }

    if (runMode === "background") {
      return this.toToolOutput(session)
    }

    await this.waitForExit(session)
    return this.toToolOutput(session)
  }

  read(input: AgentSessionReadInput): AgentSessionToolOutput {
    const session = this.getSession(input.sessionId)
    return this.toToolOutput(session, input.offset, input.maxBytes)
  }

  send(input: AgentSessionSendInput): AgentSessionToolOutput {
    const session = this.getSession(input.sessionId)
    if (session.status !== "running") {
      throw new Error(`Agent session '${input.sessionId}' is not running`)
    }

    const text = input.text ?? ""
    const keySequence = input.key ? getSendKeySequence(input.key) : ""
    if (!text && !keySequence) {
      throw new Error("Either text or key is required")
    }

    session.child.stdin.write(`${text}${keySequence}`)
    session.updatedAt = new Date()
    return this.toToolOutput(session)
  }

  stop(input: AgentSessionStopInput): AgentSessionToolOutput {
    const session = this.getSession(input.sessionId)
    this.stopSessionRecord(session, "stopped")
    return this.toToolOutput(session)
  }

  async stopAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      this.stopSessionRecord(session, "stopped")
    }
  }

  private getSession(sessionId: string): SessionRecord {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Agent session '${sessionId}' was not found`)
    }
    return session
  }

  private attachChildListeners(session: SessionRecord): void {
    session.child.stdout.on("data", chunk => {
      this.appendOutput(session, chunk.toString("utf8"))
    })
    session.child.stderr.on("data", chunk => {
      this.appendOutput(session, chunk.toString("utf8"))
    })
    session.child.on("error", error => {
      this.appendOutput(
        session,
        `\n[Mind Flayer] Failed to start agent session: ${error.message}\n`
      )
      session.status = "failed"
      session.updatedAt = new Date()
      this.clearSessionTimeout(session)
    })
    session.child.on("close", code => {
      if (session.status === "running") {
        session.status = code === 0 ? "exited" : "failed"
      }
      session.exitCode = code ?? session.exitCode
      session.updatedAt = new Date()
      this.clearSessionTimeout(session)
      session.finalizeOutputPromise = this.finalizeOutput(session)
    })
  }

  private closeNonInteractiveStdin(session: SessionRecord): void {
    if (session.child.stdin.writableEnded || session.child.stdin.destroyed) {
      return
    }

    session.child.stdin.end()
  }

  private async finalizeOutput(session: SessionRecord): Promise<void> {
    if (!session.outputLastMessagePath) {
      return
    }

    try {
      const lastMessage = await readFile(session.outputLastMessagePath, "utf8")
      const trimmedMessage = lastMessage.trimEnd()
      if (trimmedMessage) {
        session.output = trimmedMessage
        session.outputBaseOffset = 0
        session.updatedAt = new Date()
      }
    } catch (error) {
      console.debug(
        `[AgentSession] Failed to read Codex last message '${session.outputLastMessagePath}': ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      try {
        await rm(session.outputLastMessagePath, { force: true })
      } catch {}
    }
  }

  private appendOutput(session: SessionRecord, text: string): void {
    session.output += text

    while (Buffer.byteLength(session.output, "utf8") > MAX_SESSION_OUTPUT_BYTES) {
      const removeLength = Math.ceil(session.output.length / 4)
      session.output = session.output.slice(removeLength)
      session.outputBaseOffset += removeLength
    }

    session.updatedAt = new Date()
  }

  private clearSessionTimeout(session: SessionRecord): void {
    if (session.timeoutHandle) {
      clearTimeout(session.timeoutHandle)
      session.timeoutHandle = null
    }
  }

  private stopSessionRecord(session: SessionRecord, status: AgentSessionStatus): void {
    if (session.status !== "running") {
      return
    }

    session.status = status
    session.updatedAt = new Date()
    this.clearSessionTimeout(session)
    session.child.kill("SIGTERM")
    setTimeout(() => {
      if (session.status === "running" || session.child.exitCode === null) {
        session.child.kill("SIGKILL")
      }
    }, 2000)
  }

  private waitForExit(session: SessionRecord): Promise<void> {
    if (session.status !== "running") {
      return Promise.resolve()
    }

    return new Promise<void>(resolvePromise => {
      session.child.once("close", () => resolvePromise())
      session.child.once("error", () => resolvePromise())
    }).then(async () => {
      await session.finalizeOutputPromise
    })
  }

  private toToolOutput(
    session: SessionRecord,
    offset?: number,
    maxBytes?: number
  ): AgentSessionToolOutput {
    const requestedOffset = Math.max(session.outputBaseOffset, offset ?? session.outputBaseOffset)
    const relativeOffset = Math.max(0, requestedOffset - session.outputBaseOffset)
    const normalizedMaxBytes = Math.min(Math.max(1, maxBytes ?? DEFAULT_READ_BYTES), MAX_READ_BYTES)
    const content = session.output.slice(relativeOffset, relativeOffset + normalizedMaxBytes)
    const absoluteEndOffset = session.outputBaseOffset + relativeOffset + content.length
    const totalEndOffset = session.outputBaseOffset + session.output.length

    return {
      sessionId: session.sessionId,
      agent: session.agent,
      mode: session.mode,
      cwd: session.cwd,
      status: session.status,
      exitCode: session.exitCode,
      startedAt: session.startedAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      output: content,
      nextOffset: absoluteEndOffset < totalEndOffset ? absoluteEndOffset : null,
      commandPreview: session.commandPreview
    }
  }
}

export const agentSessionService = new AgentSessionService()
