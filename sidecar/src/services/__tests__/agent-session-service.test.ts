import { EventEmitter } from "node:events"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AgentSessionService,
  type AgentSessionStartInput,
  buildAgentSessionCommand
} from "../agent-session-service"

const mocks = vi.hoisted(() => ({
  restrictedPath: "",
  children: [] as Array<
    EventEmitter & {
      stdin: PassThrough
      stdout: PassThrough
      stderr: PassThrough
      kill: ReturnType<typeof vi.fn>
      exitCode: number | null
    }
  >,
  spawn: vi.fn()
}))

vi.mock("../../tools/bash-exec/executor", () => ({
  getRestrictedPath: () => mocks.restrictedPath
}))

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
  return {
    ...actual,
    spawn: mocks.spawn
  }
})

function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough
    stdout: PassThrough
    stderr: PassThrough
    kill: ReturnType<typeof vi.fn>
    exitCode: number | null
  }
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.exitCode = null
  child.kill = vi.fn(() => {
    queueMicrotask(() => child.emit("close", null, "SIGTERM"))
    return true
  })
  mocks.children.push(child)
  return child
}

async function createExecutableBin(tempDirs: string[], executable: string) {
  const root = await mkdtemp(join(tmpdir(), "mind-flayer-agent-bin-"))
  tempDirs.push(root)
  const executablePath = join(root, executable)
  await writeFile(executablePath, "#!/bin/sh\n", "utf8")
  await chmod(executablePath, 0o755)
  mocks.restrictedPath = root
}

describe("agent session service", () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    mocks.children.length = 0
    mocks.spawn.mockReset()
    mocks.spawn.mockImplementation(() => createFakeChild())
  })

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  it("builds safe Claude Code print commands", () => {
    const command = buildAgentSessionCommand({
      agent: "claude-code",
      mode: "print",
      cwd: "/project",
      prompt: "Fix tests",
      permissionPreset: "workspace-write",
      extraAllowedDirs: [],
      skipGitRepoCheck: false
    })

    expect(command).toMatchObject({
      executable: "claude"
    })
    expect(command.args).toEqual([
      "-p",
      "Fix tests",
      "--output-format",
      "text",
      "--max-turns",
      "10",
      "--permission-mode",
      "acceptEdits"
    ])
  })

  it("builds safe Codex exec commands", () => {
    const command = buildAgentSessionCommand({
      agent: "codex",
      mode: "exec",
      cwd: "/project",
      prompt: "Implement feature",
      permissionPreset: "read-only",
      extraAllowedDirs: ["/project/packages"],
      skipGitRepoCheck: false
    })

    expect(command).toMatchObject({
      executable: "codex"
    })
    expect(command.args).toEqual([
      "exec",
      "--cd",
      "/project",
      "--color",
      "never",
      "--sandbox",
      "read-only",
      "--add-dir",
      "/project/packages",
      "Implement feature"
    ])
  })

  it("adds --output-last-message to Codex exec commands when requested", () => {
    const command = buildAgentSessionCommand(
      {
        agent: "codex",
        mode: "exec",
        cwd: "/project",
        prompt: "Implement feature",
        permissionPreset: "read-only",
        extraAllowedDirs: [],
        skipGitRepoCheck: false
      },
      {
        outputLastMessagePath: "/tmp/codex-last-message.txt"
      }
    )

    expect(command.args).toContain("--output-last-message")
    expect(command.args).toContain("/tmp/codex-last-message.txt")
  })

  it("builds Codex review commands without unsupported sandbox flags", () => {
    const command = buildAgentSessionCommand({
      agent: "codex",
      mode: "review",
      cwd: "/project",
      prompt: "Review current changes",
      permissionPreset: "read-only",
      extraAllowedDirs: [],
      skipGitRepoCheck: false
    })

    expect(command).toMatchObject({
      executable: "codex"
    })
    expect(command.args).toEqual(["exec", "review", "Review current changes"])
  })

  it("closes stdin for non-interactive sessions", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mind-flayer-agent-cwd-"))
    tempDirs.push(cwd)
    await createExecutableBin(tempDirs, "claude")

    const service = new AgentSessionService()
    const started = await service.start({
      agent: "claude-code",
      mode: "print",
      cwd,
      prompt: "Say hello",
      runMode: "background"
    })
    const child = mocks.children[0]

    expect(started.status).toBe("running")
    expect(child.stdin.writableEnded).toBe(true)
  })

  it("rejects interactive sessions in chat", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mind-flayer-agent-cwd-"))
    tempDirs.push(cwd)
    await createExecutableBin(tempDirs, "claude")

    const service = new AgentSessionService()
    const startInput: AgentSessionStartInput = {
      agent: "claude-code",
      mode: "interactive",
      cwd,
      prompt: "Hello",
      runMode: "background"
    }

    await expect(service.start(startInput)).rejects.toThrow(
      "Interactive PTY sessions are not supported"
    )
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it("rejects relative working directories", async () => {
    await createExecutableBin(tempDirs, "claude")

    const service = new AgentSessionService()

    await expect(
      service.start({
        agent: "claude-code",
        mode: "print",
        cwd: ".",
        prompt: "Hello",
        runMode: "background"
      })
    ).rejects.toThrow("cwd '.' must be an absolute path")
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it("runs a background non-interactive lifecycle with read and stop", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mind-flayer-agent-cwd-"))
    tempDirs.push(cwd)
    await mkdir(join(cwd, "src"))
    await createExecutableBin(tempDirs, "claude")

    const service = new AgentSessionService()
    const started = await service.start({
      agent: "claude-code",
      mode: "print",
      cwd,
      prompt: "Hello",
      runMode: "background"
    })
    const child = mocks.children[0]
    child.stdout.write("Claude ready\n")

    expect(started.status).toBe("running")
    expect(started.commandPreview).toContain("claude")

    const read = await service.read({ sessionId: started.sessionId })
    expect(read.output).toContain("Claude ready")

    const stopped = service.stop({ sessionId: started.sessionId })
    expect(stopped.status).toBe("stopped")
    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
  })

  it("keeps read offsets byte-accurate for non-ASCII output", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mind-flayer-agent-cwd-"))
    tempDirs.push(cwd)
    await createExecutableBin(tempDirs, "claude")

    const service = new AgentSessionService()
    const started = await service.start({
      agent: "claude-code",
      mode: "print",
      cwd,
      prompt: "Hello",
      runMode: "background"
    })
    const child = mocks.children[0]
    child.stdout.write("你好a")

    const firstRead = await service.read({
      sessionId: started.sessionId,
      maxBytes: 6
    })
    expect(firstRead.output).toBe("你好")
    expect(firstRead.nextOffset).toBe(6)

    const secondRead = await service.read({
      sessionId: started.sessionId,
      offset: firstRead.nextOffset ?? 0,
      maxBytes: 1
    })
    expect(secondRead.output).toBe("a")
    expect(secondRead.nextOffset).toBeNull()
  })

  it("removes foreground sessions after returning the final output", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mind-flayer-agent-cwd-"))
    tempDirs.push(cwd)
    await createExecutableBin(tempDirs, "claude")
    mocks.spawn.mockImplementationOnce(() => {
      const child = createFakeChild()
      queueMicrotask(() => {
        child.stdout.write("All done\n")
        child.emit("close", 0, null)
      })
      return child
    })

    const service = new AgentSessionService()
    const result = await service.start({
      agent: "claude-code",
      mode: "print",
      cwd,
      prompt: "Hello",
      runMode: "foreground"
    })
    expect(result.output).toContain("All done")
    await expect(service.read({ sessionId: result.sessionId })).rejects.toThrow("was not found")
  })

  it("retains completed background sessions briefly and then cleans them up", async () => {
    vi.useFakeTimers()
    try {
      const cwd = await mkdtemp(join(tmpdir(), "mind-flayer-agent-cwd-"))
      tempDirs.push(cwd)
      await createExecutableBin(tempDirs, "claude")

      const service = new AgentSessionService()
      const started = await service.start({
        agent: "claude-code",
        mode: "print",
        cwd,
        prompt: "Hello",
        runMode: "background"
      })
      const child = mocks.children[0]
      child.emit("close", 0, null)
      await Promise.resolve()

      await expect(service.read({ sessionId: started.sessionId })).resolves.toMatchObject({
        status: "exited"
      })

      await vi.advanceTimersByTimeAsync(30 * 60 * 1000)

      await expect(service.read({ sessionId: started.sessionId })).rejects.toThrow("was not found")
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns Codex last-message output after the process exits", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mind-flayer-agent-cwd-"))
    tempDirs.push(cwd)
    await createExecutableBin(tempDirs, "codex")

    const service = new AgentSessionService()
    const started = await service.start({
      agent: "codex",
      mode: "exec",
      cwd,
      prompt: "Summarize the repo",
      runMode: "background",
      skipGitRepoCheck: true
    })
    const child = mocks.children[0]
    const spawnArgs = mocks.spawn.mock.calls[0]?.[1] as string[] | undefined
    const outputPathIndex = spawnArgs?.indexOf("--output-last-message") ?? -1
    const outputPath = outputPathIndex >= 0 ? spawnArgs?.[outputPathIndex + 1] : undefined

    expect(outputPath).toBeTruthy()
    if (!outputPath) {
      throw new Error("Codex output path should be defined")
    }

    await writeFile(outputPath, "Final answer from Codex\n", "utf8")
    child.emit("close", 0, null)

    await expect(service.read({ sessionId: started.sessionId })).resolves.toMatchObject({
      output: "Final answer from Codex",
      status: "exited"
    })
  })
})
