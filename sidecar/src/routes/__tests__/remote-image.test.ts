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
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/photo.png", {
      redirect: "manual"
    })
  })

  it("returns 415 for non-image upstream responses", async () => {
    fetchMock.mockResolvedValue(
      new Response("not an image", {
        status: 200,
        headers: {
          "content-type": "text/plain"
        }
      })
    )

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/file.txt")}`
    )

    expect(res.status).toBe(415)
  })

  it("returns the upstream status when the remote image is missing", async () => {
    fetchMock.mockResolvedValue(
      new Response("missing", {
        status: 404
      })
    )

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/missing.png")}`
    )

    expect(res.status).toBe(404)
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

  it("returns 400 when a redirect target resolves to a private IP", async () => {
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
      new Response(null, {
        status: 302,
        headers: {
          location: "https://internal.example/private.png"
        }
      })
    )

    const res = await app.request(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/photo.png")}`
    )

    expect(res.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
