import { readFile, stat } from "node:fs/promises"
import { basename, extname, normalize } from "node:path"

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/
const NETWORK_OR_DATA_PROTOCOL_REGEX = /^(https?:|data:|blob:)/i
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g
const MAX_PROXY_PATH_RESOLVE_DEPTH = 3
const ATTACHMENTS_SECTION_HEADER = "Attachments:"

const STILL_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"])
const UNSUPPORTED_TELEGRAM_PHOTO_EXTENSIONS = new Set([".gif", ".svg"])
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"])
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"])

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
  ".md": "text/markdown"
}

export type TelegramMediaKind = "photo" | "video" | "audio" | "document"
export type AttachmentIntent = "photo" | "document"
export type TelegramMediaSendMethod = "sendPhoto" | "sendVideo" | "sendAudio" | "sendDocument"

export interface TelegramMediaUpload {
  kind: TelegramMediaKind
  intent: AttachmentIntent
  data: Buffer
  filename: string
  mimeType: string
  caption: string
  resolvedPath: string
  originalSizeBytes: number
  imageWidth?: number
  imageHeight?: number
  finalMethod?: TelegramMediaSendMethod
}

export interface TelegramMediaTransformResult {
  sanitizedText: string
  uploads: TelegramMediaUpload[]
  warnings: string[]
  attachmentsSection: string | null
}

interface MarkdownMatch {
  altText: string
  rawTarget: string
  type: "image" | "link"
}

interface ImageDimensions {
  width: number
  height: number
}

interface AttachmentSection {
  sectionText: string
  bodyText: string
}

function isAbsolutePath(path: string): boolean {
  if (path.startsWith("//")) {
    return false
  }

  return path.startsWith("/") || WINDOWS_ABSOLUTE_PATH_REGEX.test(path)
}

function decodeFileUrlPath(fileUrlPath: string): string | null {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(fileUrlPath)
  } catch {
    return null
  }

  if (parsedUrl.protocol !== "file:") {
    return null
  }

  if (parsedUrl.hostname && parsedUrl.hostname !== "localhost") {
    return null
  }

  let decodedPath = parsedUrl.pathname
  try {
    decodedPath = decodeURIComponent(decodedPath)
  } catch {
    // Keep parsed pathname when decode fails.
  }

  if (
    process.platform === "win32" &&
    decodedPath.startsWith("/") &&
    WINDOWS_ABSOLUTE_PATH_REGEX.test(decodedPath.slice(1))
  ) {
    decodedPath = decodedPath.slice(1)
  }

  if (!isAbsolutePath(decodedPath)) {
    return null
  }

  return normalize(decodedPath)
}

function unwrapMarkdownTarget(rawTarget: string): string {
  let next = rawTarget.trim()

  if (next.startsWith("<") && next.endsWith(">")) {
    next = next.slice(1, -1).trim()
  }

  const titleSeparator = next.search(/\s+"/)
  if (titleSeparator >= 0) {
    next = next.slice(0, titleSeparator)
  }

  return next
}

function extractProxyPath(source: string): string | null {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(source)
  } catch {
    return null
  }

  if (!parsedUrl.pathname.endsWith("/api/local-image")) {
    return null
  }

  const path = parsedUrl.searchParams.get("path")?.trim()
  return path || null
}

function resolveLocalPath(source: string, depth = 0): string | null {
  if (depth > MAX_PROXY_PATH_RESOLVE_DEPTH) {
    return null
  }

  const trimmedSource = source.trim()
  if (!trimmedSource) {
    return null
  }

  const proxyPath = extractProxyPath(trimmedSource)
  if (proxyPath) {
    return resolveLocalPath(proxyPath, depth + 1)
  }

  if (NETWORK_OR_DATA_PROTOCOL_REGEX.test(trimmedSource)) {
    return null
  }

  if (trimmedSource.toLowerCase().startsWith("file://")) {
    return decodeFileUrlPath(trimmedSource)
  }

  if (!isAbsolutePath(trimmedSource)) {
    return null
  }

  return normalize(trimmedSource)
}

function resolveMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  return MIME_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream"
}

function isStillImageExtension(filePath: string): boolean {
  return STILL_IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function isUnsupportedTelegramPhotoExtension(filePath: string): boolean {
  return UNSUPPORTED_TELEGRAM_PHOTO_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function resolveKind(filePath: string): TelegramMediaKind {
  const extension = extname(filePath).toLowerCase()

  if (isStillImageExtension(filePath)) {
    return "photo"
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video"
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio"
  }

  return "document"
}

function collectMarkdownMatches(text: string): MarkdownMatch[] {
  const matches: MarkdownMatch[] = []

  for (const match of text.matchAll(MARKDOWN_IMAGE_REGEX)) {
    matches.push({
      altText: match[1] ?? "",
      rawTarget: match[2] ?? "",
      type: "image"
    })
  }

  for (const match of text.matchAll(MARKDOWN_LINK_REGEX)) {
    const start = match.index ?? 0

    if (start > 0 && text[start - 1] === "!") {
      continue
    }

    matches.push({
      altText: match[1] ?? "",
      rawTarget: match[2] ?? "",
      type: "link"
    })
  }

  return matches
}

function extractAttachmentsSection(text: string): AttachmentSection | null {
  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) {
    return null
  }

  const lines = normalized.split("\n")
  let startIndex = -1

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.trim() === ATTACHMENTS_SECTION_HEADER) {
      startIndex = index
      break
    }
  }

  if (startIndex < 0) {
    return null
  }

  return {
    sectionText: lines.slice(startIndex).join("\n").trim(),
    bodyText: lines
      .slice(startIndex + 1)
      .join("\n")
      .trim()
  }
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16)
}

function resolvePngDimensions(data: Buffer): ImageDimensions | null {
  if (
    data.length < 24 ||
    data[0] !== 0x89 ||
    data[1] !== 0x50 ||
    data[2] !== 0x4e ||
    data[3] !== 0x47
  ) {
    return null
  }

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  }
}

function resolveBmpDimensions(data: Buffer): ImageDimensions | null {
  if (data.length < 26 || data.toString("ascii", 0, 2) !== "BM") {
    return null
  }

  return {
    width: Math.abs(data.readInt32LE(18)),
    height: Math.abs(data.readInt32LE(22))
  }
}

function resolveJpegDimensions(data: Buffer): ImageDimensions | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null
  }

  let offset = 2
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = data[offset + 1]
    if (!marker) {
      break
    }

    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2
      continue
    }

    if (offset + 4 >= data.length) {
      break
    }

    const segmentLength = data.readUInt16BE(offset + 2)
    if (segmentLength < 2 || offset + 2 + segmentLength > data.length) {
      break
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)

    if (isStartOfFrame && offset + 9 < data.length) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7)
      }
    }

    offset += 2 + segmentLength
  }

  return null
}

function resolveWebpDimensions(data: Buffer): ImageDimensions | null {
  if (
    data.length < 30 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null
  }

  const chunkType = data.toString("ascii", 12, 16)
  if (chunkType === "VP8X") {
    return {
      width: readUInt24LE(data, 24) + 1,
      height: readUInt24LE(data, 27) + 1
    }
  }

  if (chunkType === "VP8L" && data.length >= 25 && data[20] === 0x2f) {
    const b1 = data[21]
    const b2 = data[22]
    const b3 = data[23]
    const b4 = data[24]

    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
    }
  }

  if (
    chunkType === "VP8 " &&
    data.length >= 30 &&
    data[23] === 0x9d &&
    data[24] === 0x01 &&
    data[25] === 0x2a
  ) {
    return {
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff
    }
  }

  return null
}

function resolveStillImageDimensions(filePath: string, data: Buffer): ImageDimensions | null {
  const extension = extname(filePath).toLowerCase()

  if (extension === ".png") {
    return resolvePngDimensions(data)
  }
  if (extension === ".bmp") {
    return resolveBmpDimensions(data)
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return resolveJpegDimensions(data)
  }
  if (extension === ".webp") {
    return resolveWebpDimensions(data)
  }

  return null
}

function resolveIntent(filePath: string, matchType: MarkdownMatch["type"]): AttachmentIntent {
  if (isStillImageExtension(filePath)) {
    return matchType === "image" ? "photo" : "document"
  }

  return "document"
}

function buildCaption(match: MarkdownMatch, filePath: string): string {
  return match.altText.trim() || basename(filePath)
}

export async function transformTelegramMediaMessage(
  text: string
): Promise<TelegramMediaTransformResult> {
  const normalizedText = text.trim()
  const attachmentsSection = extractAttachmentsSection(normalizedText)
  const warnings: string[] = []
  const uploads: TelegramMediaUpload[] = []

  if (!attachmentsSection) {
    return {
      sanitizedText: normalizedText,
      uploads,
      warnings,
      attachmentsSection: null
    }
  }

  const matches = collectMarkdownMatches(attachmentsSection.bodyText)
  for (const match of matches) {
    const source = unwrapMarkdownTarget(match.rawTarget)
    const localPath = resolveLocalPath(source)
    if (!localPath) {
      continue
    }

    try {
      const fileStats = await stat(localPath)
      if (!fileStats.isFile()) {
        warnings.push(`Skipping local media '${localPath}': path is not a file.`)
        continue
      }

      const data = await readFile(localPath)
      const intent = resolveIntent(localPath, match.type)
      let kind = resolveKind(localPath)

      if (isUnsupportedTelegramPhotoExtension(localPath)) {
        if (match.type === "image") {
          warnings.push(
            `Telegram photo syntax is not supported for '${localPath}'. Sending it as a document instead.`
          )
        }
        kind = "document"
      }

      const dimensions = kind === "photo" ? resolveStillImageDimensions(localPath, data) : null

      uploads.push({
        kind,
        intent: kind === "photo" ? intent : "document",
        data,
        filename: basename(localPath),
        mimeType: resolveMimeType(localPath),
        caption: buildCaption(match, localPath),
        resolvedPath: localPath,
        originalSizeBytes: fileStats.size,
        imageWidth: dimensions?.width,
        imageHeight: dimensions?.height
      })
    } catch (error) {
      warnings.push(
        `Skipping local media '${localPath}': ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return {
    sanitizedText: normalizedText,
    uploads,
    warnings,
    attachmentsSection: attachmentsSection.sectionText
  }
}
