import { describe, expect, it, vi } from "vitest"
import {
  buildImagePreviewPayload,
  consumeImagePreviewSession,
  resolveRemoteImageUrl,
  storeImagePreviewSession
} from "@/lib/image-preview"

const SIDECAR_ORIGIN = "http://localhost:21420"

describe("buildImagePreviewPayload", () => {
  it("builds local image payloads from absolute paths", () => {
    const payload = buildImagePreviewPayload(
      "/Users/didi/Desktop/photo.png",
      "local",
      SIDECAR_ORIGIN
    )

    expect(payload).toEqual({
      alt: "local",
      filename: "photo.png",
      kind: "local",
      localPath: "/Users/didi/Desktop/photo.png",
      originalUrl: "/Users/didi/Desktop/photo.png",
      resourceUrl: `${SIDECAR_ORIGIN}/api/local-image?path=${encodeURIComponent("/Users/didi/Desktop/photo.png")}`
    })
  })

  it("builds local image payloads from file URLs", () => {
    const payload = buildImagePreviewPayload(
      "file:///Users/didi/Desktop/shot%20one.png",
      "file-url",
      SIDECAR_ORIGIN
    )

    expect(payload?.kind).toBe("local")
    expect(payload?.localPath).toBe("/Users/didi/Desktop/shot one.png")
    expect(payload?.filename).toBe("shot one.png")
  })

  it("builds remote image payloads with the sidecar proxy URL", () => {
    const payload = buildImagePreviewPayload(
      "https://example.com/assets/photo.png",
      "remote",
      SIDECAR_ORIGIN
    )

    expect(payload).toEqual({
      alt: "remote",
      filename: "photo.png",
      kind: "remote",
      localPath: null,
      originalUrl: "https://example.com/assets/photo.png",
      resourceUrl: `${SIDECAR_ORIGIN}/api/remote-image?url=${encodeURIComponent("https://example.com/assets/photo.png")}`
    })
  })

  it("builds remote image payloads from relative proxy URLs", () => {
    const payload = buildImagePreviewPayload(
      `/api/remote-image?url=${encodeURIComponent("https://example.com/assets/photo.png")}`,
      "remote",
      SIDECAR_ORIGIN
    )

    expect(payload).toEqual({
      alt: "remote",
      filename: "photo.png",
      kind: "remote",
      localPath: null,
      originalUrl: "https://example.com/assets/photo.png",
      resourceUrl: `${SIDECAR_ORIGIN}/api/remote-image?url=${encodeURIComponent("https://example.com/assets/photo.png")}`
    })
  })

  it("returns null for data and blob URLs", () => {
    expect(buildImagePreviewPayload("data:image/png;base64,abc", "", SIDECAR_ORIGIN)).toBeNull()
    expect(buildImagePreviewPayload("blob:http://localhost/id", "", SIDECAR_ORIGIN)).toBeNull()
  })
})

describe("resolveRemoteImageUrl", () => {
  it("keeps remote URLs unchanged without a sidecar origin", () => {
    expect(resolveRemoteImageUrl("https://example.com/photo.png")).toBe(
      "https://example.com/photo.png"
    )
  })
})

describe("image preview sessions", () => {
  it("stores and consumes session payloads exactly once", () => {
    const sessionId = "preview-session"
    const payload = {
      alt: "preview",
      filename: "photo.png",
      kind: "remote" as const,
      localPath: null,
      originalUrl: "https://example.com/photo.png",
      resourceUrl:
        "http://localhost:21420/api/remote-image?url=https%3A%2F%2Fexample.com%2Fphoto.png"
    }

    storeImagePreviewSession(sessionId, payload)

    expect(consumeImagePreviewSession(sessionId)).toEqual(payload)
    expect(consumeImagePreviewSession(sessionId)).toBeNull()
  })

  it("returns null for invalid stored payloads", () => {
    const sessionId = "invalid-preview-session"

    localStorage.setItem(
      `image-preview:session:${sessionId}`,
      JSON.stringify({
        alt: "preview",
        filename: "photo.png"
      })
    )

    expect(consumeImagePreviewSession(sessionId)).toBeNull()
  })

  it("returns null for malformed stored payloads", () => {
    const sessionId = "malformed-preview-session"

    localStorage.setItem(`image-preview:session:${sessionId}`, "{broken")

    expect(consumeImagePreviewSession(sessionId)).toBeNull()
  })

  it("swallows storage write errors", () => {
    const sessionId = "quota-preview-session"
    const payload = {
      alt: "preview",
      filename: "photo.png",
      kind: "remote" as const,
      localPath: null,
      originalUrl: "https://example.com/photo.png",
      resourceUrl:
        "http://localhost:21420/api/remote-image?url=https%3A%2F%2Fexample.com%2Fphoto.png"
    }
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded")
    })

    expect(() => {
      storeImagePreviewSession(sessionId, payload)
    }).not.toThrow()

    expect(consoleErrorSpy).toHaveBeenCalled()
    setItemSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })
})
