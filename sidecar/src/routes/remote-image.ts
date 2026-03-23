import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import type { Context } from "hono"
import { BadRequestError } from "../utils/http-errors"

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])
const MAX_REDIRECTS = 5

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400
}

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

function isDisallowedIpAddress(hostname: string): boolean {
  const hostType = isIP(hostname)
  return (
    (hostType === 4 && isPrivateIpv4Address(hostname)) ||
    (hostType === 6 && isPrivateIpv6Address(hostname))
  )
}

async function validateResolvedHostname(hostname: string): Promise<void> {
  if (hostname === "localhost") {
    throw new BadRequestError("Localhost image URLs are not allowed")
  }

  if (isDisallowedIpAddress(hostname)) {
    throw new BadRequestError("Private network image URLs are not allowed")
  }

  const resolvedAddresses = await lookup(hostname, {
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
      redirect: "manual"
    })

    if (!isRedirectStatus(response.status)) {
      return response
    }

    const locationHeader = response.headers.get("location")
    if (!locationHeader) {
      return response
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new Error("Too many redirects while fetching remote image")
    }

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
