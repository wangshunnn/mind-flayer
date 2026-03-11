import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ReadTool, readTool } from "../read"

const TOOL_CONTEXT = {
  abortSignal: new AbortController().signal
} as never

type ReadToolResult = {
  filePath: string
  content: string
  offset: number
  nextOffset: number | null
  truncated: boolean
}

const executeReadTool = async (input: { filePath: string; offset: number }) => {
  const execute = readTool().execute as unknown as (
    nextInput: { filePath: string; offset: number },
    context: typeof TOOL_CONTEXT
  ) => PromiseLike<ReadToolResult> | ReadToolResult

  return await execute(input, TOOL_CONTEXT)
}

describe("ReadTool", () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
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

    expect(result.filePath).toBe(filePath)
    expect(result.content).toBe("hello world")
    expect(result.offset).toBe(0)
    expect(result.nextOffset).toBeNull()
    expect(result.truncated).toBe(false)
  })

  it("should expand ~ to the real home directory", async () => {
    await expect(executeReadTool({ filePath: "~", offset: 0 })).rejects.toThrow(
      new RegExp(homedir())
    )
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

  it("should reject directory paths", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mind-flayer-read-dir-"))
    tempDirs.push(tempDir)

    await expect(executeReadTool({ filePath: tempDir, offset: 0 })).rejects.toThrow(/directory/)
  })
})
