import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ReadTool, readTool } from "../read"

type ReadToolExecute = NonNullable<ReturnType<typeof readTool>["execute"]>
type ReadToolContext = Parameters<ReadToolExecute>[1]

const TOOL_CONTEXT: ReadToolContext = {
  toolCallId: "test-read-tool-call",
  messages: [],
  abortSignal: new AbortController().signal
}

type ReadToolResult = {
  filePath: string
  content: string
  offset: number
  nextOffset: number | null
  truncated: boolean
  displayContext:
    | {
        kind: "file"
      }
    | {
        kind: "skill"
        skillName: string
        fileKind: "skill-md" | "reference" | "script" | "other"
      }
}

const executeReadTool = async (input: { filePath: string; offset: number }) => {
  const execute = readTool().execute as ReadToolExecute

  return (await execute(input, TOOL_CONTEXT)) as ReadToolResult
}

describe("ReadTool", () => {
  const tempDirs: string[] = []
  const originalAppSupportDir = process.env.MINDFLAYER_APP_SUPPORT_DIR

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
    if (originalAppSupportDir === undefined) {
      delete process.env.MINDFLAYER_APP_SUPPORT_DIR
    } else {
      process.env.MINDFLAYER_APP_SUPPORT_DIR = originalAppSupportDir
    }
  })

  it("should have correct name", () => {
    const tool = new ReadTool()
    expect(tool.name).toBe("read")
  })

  it("should create a tool instance", () => {
    const instance = new ReadTool().createInstance("")

    expect(instance).toBeDefined()
    expect(instance.description).toContain("Read a local text file")
    expect(typeof instance.execute).toBe("function")
  })

  it("should read a local text file", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-read-"))
    tempDirs.push(tempDir)
    const filePath = join(tempDir, "note.txt")
    await writeFile(filePath, "hello world", "utf8")

    const result = await executeReadTool({ filePath, offset: 0 })

    expect(result.filePath).toBe(await realpath(filePath))
    expect(result.content).toBe("hello world")
    expect(result.offset).toBe(0)
    expect(result.nextOffset).toBeNull()
    expect(result.truncated).toBe(false)
    expect(result.displayContext).toEqual({ kind: "file" })
  })

  it("should expand ~ to the real home directory", async () => {
    await expect(executeReadTool({ filePath: "~", offset: 0 })).rejects.toMatchObject({
      message: expect.stringContaining(homedir())
    })
  })

  it("should paginate large files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-read-large-"))
    tempDirs.push(tempDir)
    const filePath = join(tempDir, "large.txt")
    await writeFile(filePath, "a".repeat(60 * 1024), "utf8")

    const result = await executeReadTool({ filePath, offset: 0 })

    expect(result.truncated).toBe(true)
    expect(result.nextOffset).toBe(50 * 1024)
    expect(result.content).toContain("[Use offset=51200 to continue reading]")
  })

  it("should preserve UTF-8 boundaries when paginating multibyte content", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-read-utf8-"))
    tempDirs.push(tempDir)
    const filePath = join(tempDir, "utf8.txt")
    const prefix = "a".repeat(50 * 1024 - 1)
    await writeFile(filePath, `${prefix}你b`, "utf8")

    const firstResult = await executeReadTool({ filePath, offset: 0 })
    const secondResult = await executeReadTool({
      filePath,
      offset: firstResult.nextOffset ?? 0
    })

    expect(firstResult.content).not.toContain("\uFFFD")
    expect(firstResult.content).toContain(`${prefix}\n[Use offset=51199 to continue reading]`)
    expect(firstResult.nextOffset).toBe(50 * 1024 - 1)

    expect(secondResult.content).not.toContain("\uFFFD")
    expect(secondResult.content.startsWith("你b")).toBe(true)
  })

  it("should reject directory paths", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-read-dir-"))
    tempDirs.push(tempDir)

    await expect(executeReadTool({ filePath: tempDir, offset: 0 })).rejects.toThrow(/directory/)
  })

  it("should tag skill files with display context", async () => {
    const appSupportDir = await mkdtemp(join(tmpdir(), "mind-flayer-read-skill-"))
    tempDirs.push(appSupportDir)
    process.env.MINDFLAYER_APP_SUPPORT_DIR = appSupportDir

    const filePath = join(appSupportDir, "skills", "skill-smoke-test", "SKILL.md")
    await mkdir(join(appSupportDir, "skills", "skill-smoke-test"), { recursive: true })
    await writeFile(
      filePath,
      `---
name: skill-smoke-test
description: smoke test
---
`,
      "utf8"
    )

    const result = await executeReadTool({ filePath, offset: 0 })

    expect(result.displayContext).toEqual({
      kind: "skill",
      skillName: "skill-smoke-test",
      fileKind: "skill-md"
    })
  })
})
