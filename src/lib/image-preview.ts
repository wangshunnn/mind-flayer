import { getLocalImagePath, resolveLocalImageUrl } from "@/lib/local-image-url"

const REMOTE_IMAGE_PROXY_PATH_SUFFIX = "/api/remote-image"
const HTTP_PROTOCOL_REGEX = /^https?:/i
const DATA_OR_BLOB_PROTOCOL_REGEX = /^(data:|blob:)/i
const IMAGE_PREVIEW_SESSION_STORAGE_PREFIX = "image-preview:session:"

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

function isRemoteImageProxyUrl(source: string): boolean {
  try {
    const parsedUrl = new URL(source)
    return (
      parsedUrl.pathname.endsWith(REMOTE_IMAGE_PROXY_PATH_SUFFIX) &&
      parsedUrl.searchParams.has("url")
    )
  } catch {
    return false
  }
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
  try {
    const parsedUrl = new URL(source)
    if (!parsedUrl.pathname.endsWith(REMOTE_IMAGE_PROXY_PATH_SUFFIX)) {
      return null
    }

    const originalUrl = parsedUrl.searchParams.get("url")
    return originalUrl?.trim() ? originalUrl : null
  } catch {
    return null
  }
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

  const proxiedRemoteUrl = getOriginalRemoteImageUrlFromProxyUrl(trimmedSource)
  const originalUrl = proxiedRemoteUrl ?? trimmedSource
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
  globalThis.localStorage.setItem(createImagePreviewSessionKey(sessionId), JSON.stringify(payload))
}

export function consumeImagePreviewSession(sessionId: string): ImagePreviewPayload | null {
  const key = createImagePreviewSessionKey(sessionId)
  const storedValue = globalThis.localStorage.getItem(key)
  if (!storedValue) {
    return null
  }

  globalThis.localStorage.removeItem(key)

  try {
    return JSON.parse(storedValue) as ImagePreviewPayload
  } catch {
    return null
  }
}
