import { constants as fsConstants } from "node:fs"
import { open, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { tool } from "ai"
import { z } from "zod"
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
          filePath: "/Users/you/Library/Application Support/mind-flayer/skills/example/SKILL.md",
          offset: 0
        }
      },
      {
        input: {
          filePath: "/Users/you/Library/Application Support/mind-flayer/skills/example/SKILL.md",
          offset: 51200
        }
      }
    ],

    execute: async ({ filePath, offset }) => {
      const resolvedPath = expandUserPath(filePath)
      const normalizedOffset = Math.max(0, Number.isFinite(offset) ? offset : 0)

      let fileInfo: Awaited<ReturnType<typeof stat>>
      try {
        fileInfo = await stat(resolvedPath)
      } catch (error) {
        throw new Error(
          `Failed to access '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`
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
        const nextOffset =
          normalizedOffset + bytesRead < fileInfo.size ? normalizedOffset + bytesRead : null
        const truncated = nextOffset !== null
        const content = buffer.subarray(0, bytesRead).toString("utf8")
        const suffix = truncated ? `\n[Use offset=${nextOffset} to continue reading]` : ""

        return {
          filePath: resolvedPath,
          content: `${content}${suffix}`,
          offset: normalizedOffset,
          nextOffset,
          truncated
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
