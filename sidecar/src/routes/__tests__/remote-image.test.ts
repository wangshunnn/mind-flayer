import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn()
}))

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock
}))

import { handleRemoteImage } from "../remote-image"

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
])

describe("handleRemoteImage", () => {
  let app: Hono
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    app = new Hono()
    app.get("/api/remote-image", handleRemoteImage)
    fetchMock.mockReset()
    lookupMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    lookupMock.mockResolvedValue([
      {
        address: "93.184.216.34",
        family: 4
      }
    ])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("returns proxied image bytes for a valid remote image", async () => {
    fetchMock.mockResolvedValue(
      new Response(PNG_BYTES, {
        status: 200,
        headers: {
          "content-type": "image/png"
        }
      })
    )

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/photo.png")}`
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("image/png")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/photo.png")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: "manual"
    })
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it("returns 415 for non-image upstream responses", async () => {
    const cancelMock = vi.fn()
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("not an image"))
          },
          cancel() {
            cancelMock()
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "text/plain"
          }
        }
      )
    )

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/file.txt")}`
    )

    expect(res.status).toBe(415)
    await vi.waitFor(() => {
      expect(cancelMock).toHaveBeenCalledTimes(1)
    })
  })

  it("returns the upstream status when the remote image is missing", async () => {
    const cancelMock = vi.fn()
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("missing"))
          },
          cancel() {
            cancelMock()
          }
        }),
        {
          status: 404
        }
      )
    )

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/missing.png")}`
    )

    expect(res.status).toBe(404)
    await vi.waitFor(() => {
      expect(cancelMock).toHaveBeenCalledTimes(1)
    })
  })

  it("returns 502 when the upstream request fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"))

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/broken.png")}`
    )

    expect(res.status).toBe(502)
  })

  it("returns 400 when a hostname resolves to a private IP", async () => {
    lookupMock.mockResolvedValue([
      {
        address: "192.168.1.25",
        family: 4
      }
    ])

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://rebind.example/photo.png")}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    "0.0.0.7",
    "100.64.12.34",
    "224.0.0.1",
    "255.255.255.255"
  ])("returns 400 when a hostname resolves to special-use IPv4 address %s", async address => {
    lookupMock.mockResolvedValue([
      {
        address,
        family: 4
      }
    ])

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://special.example/photo.png")}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 400 when a redirect target resolves to a private IP", async () => {
    const cancelMock = vi.fn()
    lookupMock.mockImplementation(async hostname => {
      if (hostname === "example.com") {
        return [
          {
            address: "93.184.216.34",
            family: 4
          }
        ]
      }

      if (hostname === "internal.example") {
        return [
          {
            address: "10.0.0.42",
            family: 4
          }
        ]
      }

      return [
        {
          address: "93.184.216.34",
          family: 4
        }
      ]
    })

    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          cancel() {
            cancelMock()
          }
        }),
        {
          status: 302,
          headers: {
            location: "https://internal.example/private.png"
          }
        }
      )
    )

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/photo.png")}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(cancelMock).toHaveBeenCalledTimes(1)
    })
  })

  it("returns 400 when a hostname resolves to an IPv4-mapped private IPv6 address", async () => {
    lookupMock.mockResolvedValue([
      {
        address: "::ffff:127.0.0.1",
        family: 6
      }
    ])

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://mapped.example/photo.png")}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 400 when a hostname resolves to a link-local IPv6 address outside fe80::/16", async () => {
    lookupMock.mockResolvedValue([
      {
        address: "fe90::1",
        family: 6
      }
    ])

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://link-local.example/photo.png")}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 400 for literal IPv4-mapped private IPv6 image URLs", async () => {
    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://[::ffff:0:7f00:1]/photo.png")}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 400 for literal link-local IPv6 image URLs in fe80::/10", async () => {
    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://[fe90::1]/photo.png")}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    "0.0.0.7",
    "100.64.12.34",
    "224.0.0.1",
    "255.255.255.255"
  ])("returns 400 for literal special-use IPv4 image URL %s", async address => {
    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent(`https://${address}/photo.png`)}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("maps upstream 304 responses to a valid proxy error status", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }))

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/not-modified.png")}`
    )

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({
      error: "Upstream image request failed (304)",
      code: "UPSTREAM_REQUEST_FAILED"
    })
  })
})
