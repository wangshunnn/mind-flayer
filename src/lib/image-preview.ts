import { getLocalImagePath, resolveLocalImageUrl } from "@/lib/local-image-url"

const REMOTE_IMAGE_PROXY_PATH_SUFFIX = "/api/remote-image"
const HTTP_PROTOCOL_REGEX = /^https?:/i
const DATA_OR_BLOB_PROTOCOL_REGEX = /^(data:|blob:)/i
const IMAGE_PREVIEW_SESSION_STORAGE_PREFIX = "image-preview:session:"
const RELATIVE_URL_PARSE_BASE = "http://localhost"

export type ImagePreviewSourceKind = "local" | "remote"

export interface ImagePreviewPayload {
  alt: string
  filename: string
  kind: ImagePreviewSourceKind
  localPath: string | null
  originalUrl: string
  resourceUrl: string
}

export function isRemoteImageUrl(source: string): boolean {
  return HTTP_PROTOCOL_REGEX.test(source.trim())
}

function isImagePreviewPayload(value: unknown): value is ImagePreviewPayload {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.alt === "string" &&
    typeof candidate.filename === "string" &&
    (candidate.kind === "local" || candidate.kind === "remote") &&
    (typeof candidate.localPath === "string" || candidate.localPath === null) &&
    typeof candidate.originalUrl === "string" &&
    typeof candidate.resourceUrl === "string"
  )
}

function trimTrailingSlashes(origin: string): string {
  return origin.replace(/\/+$/, "")
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseUrlAllowRelative(source: string): URL | null {
  try {
    return new URL(source)
  } catch {
    try {
      return new URL(source, RELATIVE_URL_PARSE_BASE)
    } catch {
      return null
    }
  }
}

function isRemoteImageProxyUrl(source: string): boolean {
  const parsedUrl = parseUrlAllowRelative(source)
  return Boolean(
    parsedUrl?.pathname.endsWith(REMOTE_IMAGE_PROXY_PATH_SUFFIX) &&
      parsedUrl.searchParams.has("url")
  )
}

export function resolveRemoteImageUrl(source: string, sidecarOrigin?: string): string {
  const trimmedSource = source.trim()
  if (!isRemoteImageUrl(trimmedSource) || !sidecarOrigin) {
    return trimmedSource
  }

  if (isRemoteImageProxyUrl(trimmedSource)) {
    return trimmedSource
  }

  return `${trimTrailingSlashes(sidecarOrigin)}/api/remote-image?url=${encodeURIComponent(trimmedSource)}`
}

export function getOriginalRemoteImageUrlFromProxyUrl(source: string): string | null {
  const parsedUrl = parseUrlAllowRelative(source)
  if (!parsedUrl?.pathname.endsWith(REMOTE_IMAGE_PROXY_PATH_SUFFIX)) {
    return null
  }

  const originalUrl = parsedUrl.searchParams.get("url")
  return originalUrl?.trim() ? originalUrl : null
}

export function deriveImageFilename(source: string, localPath?: string | null): string {
  const fallbackName = "image"

  if (localPath) {
    const segments = localPath.split(/[\\/]/)
    return decodePathSegment(segments.at(-1) || fallbackName) || fallbackName
  }

  try {
    const parsedUrl = new URL(source)
    const pathname = parsedUrl.pathname.replace(/\/+$/, "")
    const candidate = pathname.split("/").at(-1)
    return candidate ? decodePathSegment(candidate) : fallbackName
  } catch {
    return fallbackName
  }
}

export function buildImagePreviewPayload(
  source: string,
  alt: string,
  sidecarOrigin?: string
): ImagePreviewPayload | null {
  const trimmedSource = source.trim()
  if (!trimmedSource || DATA_OR_BLOB_PROTOCOL_REGEX.test(trimmedSource)) {
    return null
  }

  const proxiedRemoteUrl = getOriginalRemoteImageUrlFromProxyUrl(trimmedSource)
  if (proxiedRemoteUrl) {
    return {
      alt,
      filename: deriveImageFilename(proxiedRemoteUrl),
      kind: "remote",
      localPath: null,
      originalUrl: proxiedRemoteUrl,
      resourceUrl: resolveRemoteImageUrl(proxiedRemoteUrl, sidecarOrigin)
    }
  }

  const localPath = getLocalImagePath(trimmedSource)
  if (localPath) {
    const originalUrl = trimmedSource
    return {
      alt,
      filename: deriveImageFilename(trimmedSource, localPath),
      kind: "local",
      localPath,
      originalUrl,
      resourceUrl: resolveLocalImageUrl(originalUrl, sidecarOrigin)
    }
  }

  const originalUrl = trimmedSource
  if (!isRemoteImageUrl(originalUrl)) {
    return null
  }

  return {
    alt,
    filename: deriveImageFilename(originalUrl),
    kind: "remote",
    localPath: null,
    originalUrl,
    resourceUrl: resolveRemoteImageUrl(originalUrl, sidecarOrigin)
  }
}

export function createImagePreviewSessionKey(sessionId: string): string {
  return `${IMAGE_PREVIEW_SESSION_STORAGE_PREFIX}${sessionId}`
}

export function storeImagePreviewSession(sessionId: string, payload: ImagePreviewPayload): void {
  const storageKey = createImagePreviewSessionKey(sessionId)

  try {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(payload))
  } catch (error) {
    console.error(`[image-preview] Failed to store preview session "${storageKey}"`, error)
  }
}

export function consumeImagePreviewSession(sessionId: string): ImagePreviewPayload | null {
  const storageKey = createImagePreviewSessionKey(sessionId)

  try {
    const storedValue = globalThis.localStorage.getItem(storageKey)
    if (!storedValue) {
      return null
    }

    globalThis.localStorage.removeItem(storageKey)

    const parsedValue: unknown = JSON.parse(storedValue)
    if (!isImagePreviewPayload(parsedValue)) {
      console.warn(`[image-preview] Ignoring invalid preview session "${storageKey}"`)
      return null
    }

    return parsedValue
  } catch (error) {
    console.error(`[image-preview] Failed to consume preview session "${storageKey}"`, error)
    return null
  }
}
