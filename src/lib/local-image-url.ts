const LOCAL_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"])
const LOCAL_IMAGE_PROXY_PATH_SUFFIX = "/api/local-image"
const LOCAL_IMAGE_CACHE_BUST_PARAM = "_ts"

const NETWORK_OR_DATA_PROTOCOL_REGEX = /^(https?:|data:|blob:)/i
const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/

type ResolveLocalImageUrlOptions = {
  cacheBustKey?: string | number | null
}

function encodeWhitespace(value: string): string {
  return value.replace(/\s/g, whitespace => encodeURIComponent(whitespace))
}

function stripSearchAndHash(value: string): string {
  return value.split("#", 1)[0]?.split("?", 1)[0] ?? value
}

function decodeFileUrlPath(source: string): string | null {
  try {
    const fileUrl = new URL(source)
    if (fileUrl.protocol !== "file:") {
      return null
    }
    return decodeURIComponent(fileUrl.pathname)
  } catch {
    return null
  }
}

function isAbsolutePath(source: string): boolean {
  if (source.startsWith("//")) {
    return false
  }
  return source.startsWith("/") || WINDOWS_ABSOLUTE_PATH_REGEX.test(source)
}

function normalizeLocalPathCandidate(source: string): string | null {
  const trimmedSource = source.trim()
  if (!trimmedSource || NETWORK_OR_DATA_PROTOCOL_REGEX.test(trimmedSource)) {
    return null
  }

  if (trimmedSource.toLowerCase().startsWith("file://")) {
    return decodeFileUrlPath(trimmedSource)
  }

  if (isAbsolutePath(trimmedSource)) {
    return trimmedSource
  }

  return null
}

function findClosingMarker(
  value: string,
  startIndex: number,
  openMarker: string,
  closeMarker: string
): number {
  let depth = 1

  for (let index = startIndex + 1; index < value.length; index += 1) {
    const character = value[index]

    if (character === "\\") {
      index += 1
      continue
    }

    if (character === openMarker) {
      depth += 1
      continue
    }

    if (character === closeMarker) {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function normalizeMarkdownLocalImageDestination(destination: string): string | null {
  const leadingWhitespace = destination.match(/^\s*/)?.[0] ?? ""
  const trailingWhitespace = destination.match(/\s*$/)?.[0] ?? ""
  const coreDestination = destination.slice(
    leadingWhitespace.length,
    destination.length - trailingWhitespace.length
  )

  if (!coreDestination || !/\s/.test(coreDestination)) {
    return null
  }

  if (!isLocalImagePath(coreDestination) || !hasSupportedLocalImageExtension(coreDestination)) {
    return null
  }

  return `${leadingWhitespace}${encodeWhitespace(coreDestination)}${trailingWhitespace}`
}

export function hasSupportedLocalImageExtension(source: string): boolean {
  const normalizedPath = normalizeLocalPathCandidate(source)
  if (!normalizedPath) {
    return false
  }

  const cleanPath = stripSearchAndHash(normalizedPath)
  const extensionMatch = cleanPath.match(/\.([a-z0-9]+)$/i)
  if (!extensionMatch) {
    return false
  }

  return LOCAL_IMAGE_EXTENSIONS.has(extensionMatch[1].toLowerCase())
}

export function isLocalImagePath(source: string): boolean {
  return normalizeLocalPathCandidate(source) !== null
}

export function normalizeLocalImageMarkdown(markdown: string): string {
  let result = ""
  let cursor = 0

  while (cursor < markdown.length) {
    const imageStart = markdown.indexOf("![", cursor)
    if (imageStart === -1) {
      result += markdown.slice(cursor)
      break
    }

    result += markdown.slice(cursor, imageStart)

    const altTextStart = imageStart + 1
    const altTextEnd = findClosingMarker(markdown, altTextStart, "[", "]")
    if (altTextEnd === -1 || markdown[altTextEnd + 1] !== "(") {
      result += markdown.slice(imageStart, imageStart + 2)
      cursor = imageStart + 2
      continue
    }

    const destinationStart = altTextEnd + 2
    const destinationEnd = findClosingMarker(markdown, altTextEnd + 1, "(", ")")
    if (destinationEnd === -1) {
      result += markdown.slice(imageStart)
      break
    }

    const rawDestination = markdown.slice(destinationStart, destinationEnd)
    const normalizedDestination =
      normalizeMarkdownLocalImageDestination(rawDestination) ?? rawDestination

    result += markdown.slice(imageStart, destinationStart)
    result += normalizedDestination
    result += ")"
    cursor = destinationEnd + 1
  }

  return result
}

function trimTrailingSlashes(origin: string): string {
  return origin.replace(/\/+$/, "")
}

function normalizeCacheBustKey(
  cacheBustKey: ResolveLocalImageUrlOptions["cacheBustKey"]
): string | null {
  if (cacheBustKey === undefined || cacheBustKey === null) {
    return null
  }

  const normalized = String(cacheBustKey).trim()
  return normalized ? normalized : null
}

function isLocalImageProxyUrl(source: string): boolean {
  try {
    const parsedUrl = new URL(source)
    return (
      parsedUrl.pathname.endsWith(LOCAL_IMAGE_PROXY_PATH_SUFFIX) &&
      parsedUrl.searchParams.has("path")
    )
  } catch {
    return false
  }
}

function appendCacheBustParam(source: string, cacheBustKey: string): string {
  try {
    const parsedUrl = new URL(source)
    parsedUrl.searchParams.set(LOCAL_IMAGE_CACHE_BUST_PARAM, cacheBustKey)
    return parsedUrl.toString()
  } catch {
    const hashIndex = source.indexOf("#")
    const hash = hashIndex >= 0 ? source.slice(hashIndex) : ""
    const baseSource = hashIndex >= 0 ? source.slice(0, hashIndex) : source
    const separator = baseSource.includes("?") ? "&" : "?"
    return `${baseSource}${separator}${LOCAL_IMAGE_CACHE_BUST_PARAM}=${encodeURIComponent(cacheBustKey)}${hash}`
  }
}

export function resolveLocalImageUrl(
  source: string,
  localImageProxyOrigin?: string,
  options?: ResolveLocalImageUrlOptions
): string {
  const trimmedSource = source.trim()
  const cacheBustKey = normalizeCacheBustKey(options?.cacheBustKey)

  if (!trimmedSource || NETWORK_OR_DATA_PROTOCOL_REGEX.test(trimmedSource)) {
    if (cacheBustKey && isLocalImageProxyUrl(trimmedSource)) {
      return appendCacheBustParam(trimmedSource, cacheBustKey)
    }
    return trimmedSource
  }

  if (!localImageProxyOrigin) {
    return trimmedSource
  }

  if (!isLocalImagePath(trimmedSource) || !hasSupportedLocalImageExtension(trimmedSource)) {
    return trimmedSource
  }

  const proxyOrigin = trimTrailingSlashes(localImageProxyOrigin)
  const resolvedProxyUrl = `${proxyOrigin}/api/local-image?path=${encodeURIComponent(trimmedSource)}`

  if (!cacheBustKey) {
    return resolvedProxyUrl
  }

  return appendCacheBustParam(resolvedProxyUrl, cacheBustKey)
}

export function getLocalImagePath(source: string): string | null {
  const directPath = normalizeLocalPathCandidate(source)
  if (directPath) {
    return directPath
  }

  const proxiedPath = getOriginalLocalImagePathFromProxyUrl(source)
  if (!proxiedPath) {
    return null
  }

  return normalizeLocalPathCandidate(proxiedPath)
}

export function getOriginalLocalImagePathFromProxyUrl(source: string): string | null {
  try {
    const parsedUrl = new URL(source)
    if (!parsedUrl.pathname.endsWith("/api/local-image")) {
      return null
    }

    const localPath = parsedUrl.searchParams.get("path")
    return localPath?.trim() ? localPath : null
  } catch {
    return null
  }
}
