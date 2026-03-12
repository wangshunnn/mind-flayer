import { constants as fsConstants } from "node:fs"
import { open, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { tool } from "ai"
import { z } from "zod"
import { getSkillFileDisplayContext } from "../../skills/catalog"
import type { ITool } from "../base-tool"

const MAX_READ_BYTES = 50 * 1024

function expandUserPath(filePath: string): string {
  if (filePath === "~") {
    return homedir()
  }

  if (filePath.startsWith("~/")) {
    return resolve(homedir(), filePath.slice(2))
  }

  return filePath
}

function normalizeFilePath(filePath: string): string {
  return resolve(expandUserPath(filePath))
}

function getExpectedUtf8SequenceLength(byte: number): number | null {
  if (byte <= 0x7f) {
    return 1
  }
  if (byte >= 0xc2 && byte <= 0xdf) {
    return 2
  }
  if (byte >= 0xe0 && byte <= 0xef) {
    return 3
  }
  if (byte >= 0xf0 && byte <= 0xf4) {
    return 4
  }
  return null
}

function getUtf8SafeReadLength(buffer: Buffer, bytesRead: number): number {
  if (bytesRead === 0) {
    return 0
  }

  const chunk = buffer.subarray(0, bytesRead)
  let leadingByteIndex = chunk.length - 1

  while (leadingByteIndex >= 0 && (chunk[leadingByteIndex] & 0b1100_0000) === 0b1000_0000) {
    leadingByteIndex -= 1
  }

  if (leadingByteIndex < 0) {
    return chunk.length
  }

  const expectedLength = getExpectedUtf8SequenceLength(chunk[leadingByteIndex])
  if (!expectedLength || expectedLength === 1) {
    return chunk.length
  }

  const actualLength = chunk.length - leadingByteIndex
  if (actualLength < expectedLength) {
    return leadingByteIndex
  }

  return chunk.length
}

/**
 * File read tool implementation.
 * Exposes paginated read-only access to local files.
 */
export class ReadTool implements ITool {
  readonly name = "read"

  createInstance(_unused = ""): ReturnType<typeof readTool> {
    return readTool()
  }
}

/**
 * Read tool definition factory.
 * Reads local files as UTF-8 text with a hard per-call byte cap.
 */
export const readTool = () =>
  tool({
    description: `Read a local text file from disk.

Use this when you need the contents of a file, including skill files such as SKILL.md, AGENTS.md, references, or scripts.
- filePath may be absolute, relative, or start with ~
- offset is a byte offset for paginating large files
- Each call returns up to 50KB of UTF-8 text
- If truncated is true, call the tool again with nextOffset`,

    inputSchema: z.object({
      filePath: z.string().min(1).describe("Path to the file to read"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Optional byte offset for continuing a previous read")
    }),

    inputExamples: [
      {
        input: {
          filePath: "/Users/you/Library/Application Support/Mind Flayer/skills/example/SKILL.md",
          offset: 0
        }
      },
      {
        input: {
          filePath: "/Users/you/Library/Application Support/Mind Flayer/skills/example/SKILL.md",
          offset: 51200
        }
      }
    ],

    execute: async ({ filePath, offset }) => {
      const normalizedPath = normalizeFilePath(filePath)
      const normalizedOffset = Math.max(0, Number.isFinite(offset) ? offset : 0)
      let resolvedPath: string
      let fileInfo: Awaited<ReturnType<typeof stat>>

      try {
        resolvedPath = await realpath(normalizedPath)
        fileInfo = await stat(resolvedPath)
      } catch (error) {
        throw new Error(
          `Failed to access '${normalizedPath}': ${error instanceof Error ? error.message : String(error)}`
        )
      }

      if (fileInfo.isDirectory()) {
        throw new Error(`Path '${resolvedPath}' is a directory, not a file`)
      }

      if (!(fileInfo.mode & fsConstants.S_IFREG) && !fileInfo.isFile()) {
        throw new Error(`Path '${resolvedPath}' is not a regular file`)
      }

      const handle = await open(resolvedPath, "r")
      try {
        const buffer = Buffer.alloc(MAX_READ_BYTES)
        const { bytesRead } = await handle.read(buffer, 0, MAX_READ_BYTES, normalizedOffset)
        const safeBytesRead = getUtf8SafeReadLength(buffer, bytesRead)
        const nextOffset =
          normalizedOffset + safeBytesRead < fileInfo.size ? normalizedOffset + safeBytesRead : null
        const truncated = nextOffset !== null
        const content = buffer.subarray(0, safeBytesRead).toString("utf8")
        const suffix = truncated ? `\n[Use offset=${nextOffset} to continue reading]` : ""
        const displayContext = await getSkillFileDisplayContext(resolvedPath)

        return {
          filePath: resolvedPath,
          content: `${content}${suffix}`,
          offset: normalizedOffset,
          nextOffset,
          truncated,
          displayContext: displayContext ?? { kind: "file" as const }
        }
      } catch (error) {
        throw new Error(
          `Failed to read '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        await handle.close()
      }
    }
  })
