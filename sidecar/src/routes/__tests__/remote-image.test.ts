import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
    vi.stubGlobal("fetch", fetchMock)
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
})
