import { lookup } from "node:dns/promises"
import { isIP, SocketAddress } from "node:net"
import type { Context } from "hono"
import { BadRequestError } from "../utils/http-errors"

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])
const MAX_REDIRECTS = 5
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 10_000

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400
}

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map(segment => Number.parseInt(segment, 10))
  if (octets.length !== 4 || octets.some(Number.isNaN)) {
    return false
  }

  const [first, second, third, fourth] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first >= 224 && first <= 239) ||
    (first === 255 && second === 255 && third === 255 && fourth === 255)
  )
}

function isPrivateIpv6Address(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase()
  const firstSegment = parseIpv6Segments(normalizedHostname)?.[0]

  return (
    normalizedHostname === "::1" ||
    (typeof firstSegment === "number" && (firstSegment & 0xfe00) === 0xfc00) ||
    (typeof firstSegment === "number" && (firstSegment & 0xffc0) === 0xfe80)
  )
}

function unwrapHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname
}

function normalizeIpv6SegmentList(segments: string[]): string[] | null {
  if (!segments.length) {
    return []
  }

  const lastSegment = segments.at(-1)
  if (!lastSegment?.includes(".")) {
    return segments
  }

  if (isIP(lastSegment) !== 4) {
    return null
  }

  const octets = lastSegment.split(".").map(segment => Number.parseInt(segment, 10))
  if (octets.length !== 4 || octets.some(Number.isNaN)) {
    return null
  }

  return [
    ...segments.slice(0, -1),
    ((octets[0] << 8) | octets[1]).toString(16),
    ((octets[2] << 8) | octets[3]).toString(16)
  ]
}

function parseIpv6Segments(hostname: string): number[] | null {
  const parsedAddress = SocketAddress.parse(`[${unwrapHostname(hostname)}]:0`)
  if (!parsedAddress || parsedAddress.family !== "ipv6") {
    return null
  }

  const normalizedHostname = parsedAddress.address.toLowerCase()
  const [head = "", tail = ""] = normalizedHostname.split("::", 2)
  const headSegments = normalizeIpv6SegmentList(head ? head.split(":").filter(Boolean) : [])
  const tailSegments = normalizeIpv6SegmentList(tail ? tail.split(":").filter(Boolean) : [])
  if (!headSegments || !tailSegments) {
    return null
  }

  const totalSegments = headSegments.length + tailSegments.length
  if (totalSegments > 8) {
    return null
  }

  const zeroSegments = Array.from({ length: 8 - totalSegments }, () => "0")
  const segments = [...headSegments, ...zeroSegments, ...tailSegments]
  if (segments.length !== 8) {
    return null
  }

  const parsedSegments = segments.map(segment => Number.parseInt(segment, 16))
  return parsedSegments.some(segment => Number.isNaN(segment) || segment < 0 || segment > 0xffff)
    ? null
    : parsedSegments
}

function getEmbeddedIpv4Address(hostname: string): string | null {
  const ipv6Segments = parseIpv6Segments(hostname)
  if (!ipv6Segments) {
    return null
  }

  const isIpv4MappedAddress =
    ipv6Segments[0] === 0 &&
    ipv6Segments[1] === 0 &&
    ipv6Segments[2] === 0 &&
    ipv6Segments[3] === 0 &&
    ((ipv6Segments[4] === 0 && ipv6Segments[5] === 0xffff) ||
      (ipv6Segments[4] === 0xffff && ipv6Segments[5] === 0))

  if (!isIpv4MappedAddress) {
    return null
  }

  return [
    ipv6Segments[6] >> 8,
    ipv6Segments[6] & 0xff,
    ipv6Segments[7] >> 8,
    ipv6Segments[7] & 0xff
  ].join(".")
}

function isDisallowedIpAddress(hostname: string): boolean {
  const normalizedHostname = unwrapHostname(hostname)
  const hostType = isIP(normalizedHostname)
  if (hostType === 4) {
    return isPrivateIpv4Address(normalizedHostname)
  }

  if (hostType !== 6) {
    return false
  }

  const embeddedIpv4Address = getEmbeddedIpv4Address(normalizedHostname)
  return embeddedIpv4Address
    ? isPrivateIpv4Address(embeddedIpv4Address)
    : isPrivateIpv6Address(normalizedHostname)
}

function cancelResponseBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined)
}

function getProxyErrorStatus(status: number): number {
  return status === 304 ? 502 : status
}

async function validateResolvedHostname(hostname: string): Promise<void> {
  const normalizedHostname = unwrapHostname(hostname)
  if (normalizedHostname === "localhost") {
    throw new BadRequestError("Localhost image URLs are not allowed")
  }

  if (isDisallowedIpAddress(normalizedHostname)) {
    throw new BadRequestError("Private network image URLs are not allowed")
  }

  if (isIP(normalizedHostname) !== 0) {
    return
  }

  const resolvedAddresses = await lookup(normalizedHostname, {
    all: true,
    verbatim: true
  })
  if (!resolvedAddresses.length) {
    throw new BadRequestError("Unable to resolve remote image hostname")
  }

  if (resolvedAddresses.some(address => isDisallowedIpAddress(address.address))) {
    throw new BadRequestError("Private network image URLs are not allowed")
  }
}

async function validateRemoteImageUrl(rawUrl: string): Promise<URL> {
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) {
    throw new BadRequestError("Query parameter 'url' is required")
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmedUrl)
  } catch {
    throw new BadRequestError("Invalid remote image URL")
  }

  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new BadRequestError("Only http and https image URLs are supported")
  }

  try {
    await validateResolvedHostname(parsedUrl.hostname)
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error
    }

    throw new BadRequestError("Unable to resolve remote image hostname")
  }

  return parsedUrl
}

async function fetchRemoteImageWithRedirectValidation(initialUrl: URL): Promise<Response> {
  let currentUrl = initialUrl

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(REMOTE_IMAGE_FETCH_TIMEOUT_MS)
    })

    if (!isRedirectStatus(response.status)) {
      return response
    }

    const locationHeader = response.headers.get("location")
    if (!locationHeader) {
      return response
    }

    if (redirectCount === MAX_REDIRECTS) {
      cancelResponseBody(response)
      throw new Error("Too many redirects while fetching remote image")
    }

    cancelResponseBody(response)
    currentUrl = await validateRemoteImageUrl(new URL(locationHeader, currentUrl).toString())
  }

  throw new Error("Too many redirects while fetching remote image")
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to fetch remote image"
}

export async function handleRemoteImage(c: Context) {
  const rawUrl = c.req.query("url")
  if (!rawUrl) {
    return c.json({ error: "Query parameter 'url' is required", code: "BAD_REQUEST" }, 400)
  }

  let remoteUrl: URL
  try {
    remoteUrl = await validateRemoteImageUrl(rawUrl)
  } catch (error) {
    const message = resolveErrorMessage(error)
    return c.json({ error: message, code: "BAD_REQUEST" }, 400)
  }

  let response: Response
  try {
    response = await fetchRemoteImageWithRedirectValidation(remoteUrl)
  } catch (error) {
    if (error instanceof BadRequestError) {
      return c.json(
        {
          error: error.message,
          code: "BAD_REQUEST"
        },
        400
      )
    }

    return c.json(
      {
        error: resolveErrorMessage(error),
        code: "UPSTREAM_FETCH_FAILED"
      },
      502
    )
  }

  if (!response.ok) {
    cancelResponseBody(response)
    return Response.json(
      {
        error: `Upstream image request failed (${response.status})`,
        code: "UPSTREAM_REQUEST_FAILED"
      },
      {
        status: getProxyErrorStatus(response.status)
      }
    )
  }

  const contentType = response.headers.get("content-type")
  if (!contentType?.toLowerCase().startsWith("image/")) {
    cancelResponseBody(response)
    return c.json(
      {
        error: "Upstream response is not an image",
        code: "UNSUPPORTED_CONTENT_TYPE"
      },
      415
    )
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": contentType
    }
  })
}
