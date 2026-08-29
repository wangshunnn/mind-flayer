import { getLocalImagePath, resolveLocalImageUrl } from "@/lib/local-image-url"

const REMOTE_IMAGE_PROXY_PATH_SUFFIX = "/api/remote-image"
const HTTP_PROTOCOL_REGEX = /^https?:/i
const DATA_OR_BLOB_PROTOCOL_REGEX = /^(data:|blob:)/i
const RELATIVE_URL_PARSE_BASE = "http://localhost"

export const IMAGE_PREVIEW_READY_EVENT = "image-preview:ready"
export const IMAGE_PREVIEW_SHOW_EVENT = "image-preview:show"
export const IMAGE_PREVIEW_WINDOW_LABEL = "image-preview"

export type ImagePreviewSourceKind = "embedded" | "local" | "remote"

export interface ImagePreviewPayload {
  alt: string
  filename: string
  kind: ImagePreviewSourceKind
  localPath: string | null
  originalUrl: string
  resourceUrl: string
}

export interface ImagePreviewReadyPayload {
  windowLabel: typeof IMAGE_PREVIEW_WINDOW_LABEL
}

export interface BuildImagePreviewPayloadOptions {
  allowEmbedded?: boolean
  filename?: string
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
  sidecarOrigin?: string,
  options?: BuildImagePreviewPayloadOptions
): ImagePreviewPayload | null {
  const trimmedSource = source.trim()
  if (!trimmedSource) {
    return null
  }

  if (DATA_OR_BLOB_PROTOCOL_REGEX.test(trimmedSource)) {
    if (!options?.allowEmbedded) {
      return null
    }

    return {
      alt,
      filename: options.filename?.trim() || "image",
      kind: "embedded",
      localPath: null,
      originalUrl: "",
      resourceUrl: trimmedSource
    }
  }

  const proxiedRemoteUrl = getOriginalRemoteImageUrlFromProxyUrl(trimmedSource)
  if (proxiedRemoteUrl) {
    return {
      alt,
      filename: options?.filename?.trim() || deriveImageFilename(proxiedRemoteUrl),
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
      filename: options?.filename?.trim() || deriveImageFilename(trimmedSource, localPath),
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
    filename: options?.filename?.trim() || deriveImageFilename(originalUrl),
    kind: "remote",
    localPath: null,
    originalUrl,
    resourceUrl: resolveRemoteImageUrl(originalUrl, sidecarOrigin)
  }
}
