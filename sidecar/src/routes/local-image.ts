import { readFile, stat } from "node:fs/promises"
import { extname, normalize } from "node:path"
import type { Context } from "hono"
import { BadRequestError, mapErrorToResponse } from "../utils/http-errors"

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"])

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml"
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || WINDOWS_ABSOLUTE_PATH_REGEX.test(path)
}

function decodeQueryPath(queryPath: string): string {
  const trimmedPath = queryPath.trim()
  if (!trimmedPath) {
    throw new BadRequestError("Query parameter 'path' is required")
  }

  if (trimmedPath.toLowerCase().startsWith("file://")) {
    return decodeFileUrlPath(trimmedPath)
  }

  let decodedPath = trimmedPath
  try {
    decodedPath = decodeURIComponent(trimmedPath)
  } catch {
    // Ignore malformed escapes and fallback to raw value.
  }

  if (!isAbsolutePath(decodedPath)) {
    throw new BadRequestError("Path must be an absolute file path")
  }

  return normalize(decodedPath)
}

function decodeFileUrlPath(fileUrlPath: string): string {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(fileUrlPath)
  } catch {
    throw new BadRequestError("Invalid file URL")
  }

  if (parsedUrl.protocol !== "file:") {
    throw new BadRequestError("Invalid file URL")
  }

  if (parsedUrl.hostname && parsedUrl.hostname !== "localhost") {
    throw new BadRequestError("Invalid file URL host")
  }

  let decodedPath = parsedUrl.pathname
  try {
    decodedPath = decodeURIComponent(decodedPath)
  } catch {
    // Ignore malformed escapes and fallback to the parsed pathname.
  }

  if (
    process.platform === "win32" &&
    decodedPath.startsWith("/") &&
    WINDOWS_ABSOLUTE_PATH_REGEX.test(decodedPath.slice(1))
  ) {
    decodedPath = decodedPath.slice(1)
  }

  if (!isAbsolutePath(decodedPath)) {
    throw new BadRequestError("Path must be an absolute file path")
  }

  return normalize(decodedPath)
}

function resolveContentType(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new BadRequestError("Only image files are supported")
  }

  const contentType = CONTENT_TYPE_BY_EXTENSION[extension]
  if (!contentType) {
    throw new BadRequestError("Unsupported image type")
  }

  return contentType
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code: unknown }).code === "ENOENT"
}

export async function handleLocalImage(c: Context) {
  const rawPath = c.req.query("path")
  if (!rawPath) {
    return c.json({ error: "Query parameter 'path' is required", code: "BAD_REQUEST" }, 400)
  }

  try {
    const filePath = decodeQueryPath(rawPath)
    const contentType = resolveContentType(filePath)
    const fileStats = await stat(filePath)

    if (!fileStats.isFile()) {
      throw new BadRequestError("Path must point to a file")
    }

    const imageBuffer = await readFile(filePath)
    return c.body(imageBuffer, 200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    })
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json({ error: "File not found", code: "NOT_FOUND" }, 404)
    }

    const mappedError = mapErrorToResponse(error)
    return c.json(mappedError.body, mappedError.statusCode)
  }
}
