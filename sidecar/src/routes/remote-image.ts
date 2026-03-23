import { isIP } from "node:net"
import type { Context } from "hono"
import { BadRequestError } from "../utils/http-errors"

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map(segment => Number.parseInt(segment, 10))
  if (octets.length !== 4 || octets.some(Number.isNaN)) {
    return false
  }

  const [first, second] = octets
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isPrivateIpv6Address(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase()
  return (
    normalizedHostname === "::1" ||
    normalizedHostname.startsWith("fc") ||
    normalizedHostname.startsWith("fd") ||
    normalizedHostname.startsWith("fe80:")
  )
}

function validateRemoteImageUrl(rawUrl: string): URL {
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

  if (parsedUrl.hostname === "localhost") {
    throw new BadRequestError("Localhost image URLs are not allowed")
  }

  const hostType = isIP(parsedUrl.hostname)
  if (
    (hostType === 4 && isPrivateIpv4Address(parsedUrl.hostname)) ||
    (hostType === 6 && isPrivateIpv6Address(parsedUrl.hostname))
  ) {
    throw new BadRequestError("Private network image URLs are not allowed")
  }

  return parsedUrl
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
    remoteUrl = validateRemoteImageUrl(rawUrl)
  } catch (error) {
    const message = resolveErrorMessage(error)
    return c.json({ error: message, code: "BAD_REQUEST" }, 400)
  }

  let response: Response
  try {
    response = await fetch(remoteUrl.toString())
  } catch (error) {
    return c.json(
      {
        error: resolveErrorMessage(error),
        code: "UPSTREAM_FETCH_FAILED"
      },
      502
    )
  }

  if (!response.ok) {
    return Response.json(
      {
        error: `Upstream image request failed (${response.status})`,
        code: "UPSTREAM_REQUEST_FAILED"
      },
      {
        status: response.status
      }
    )
  }

  const contentType = response.headers.get("content-type")
  if (!contentType?.toLowerCase().startsWith("image/")) {
    return c.json(
      {
        error: "Upstream response is not an image",
        code: "UNSUPPORTED_CONTENT_TYPE"
      },
      415
    )
  }

  const imageBuffer = new Uint8Array(await response.arrayBuffer())
  return c.body(imageBuffer, 200, {
    "Cache-Control": "no-store",
    "Content-Type": contentType
  })
}
