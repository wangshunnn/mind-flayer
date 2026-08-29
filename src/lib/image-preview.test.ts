import { describe, expect, it } from "vitest"
import { buildImagePreviewPayload, resolveRemoteImageUrl } from "@/lib/image-preview"

const SIDECAR_ORIGIN = "http://localhost:21420"

describe("buildImagePreviewPayload", () => {
  it("builds local image payloads from absolute paths", () => {
    const payload = buildImagePreviewPayload(
      "/Users/USERNAME/Desktop/photo.png",
      "local",
      SIDECAR_ORIGIN
    )

    expect(payload).toEqual({
      alt: "local",
      filename: "photo.png",
      kind: "local",
      localPath: "/Users/USERNAME/Desktop/photo.png",
      originalUrl: "/Users/USERNAME/Desktop/photo.png",
      resourceUrl: `${SIDECAR_ORIGIN}/api/local-image?path=${encodeURIComponent("/Users/USERNAME/Desktop/photo.png")}`
    })
  })

  it("builds local image payloads from file URLs", () => {
    const payload = buildImagePreviewPayload(
      "file:///Users/USERNAME/Desktop/shot%20one.png",
      "file-url",
      SIDECAR_ORIGIN
    )

    expect(payload?.kind).toBe("local")
    expect(payload?.localPath).toBe("/Users/USERNAME/Desktop/shot one.png")
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

  it("builds an embedded payload only when explicitly allowed", () => {
    const source = "data:image/png;base64,abc"

    expect(
      buildImagePreviewPayload(source, "attachment", SIDECAR_ORIGIN, {
        allowEmbedded: true,
        filename: "photo.png"
      })
    ).toEqual({
      alt: "attachment",
      filename: "photo.png",
      kind: "embedded",
      localPath: null,
      originalUrl: "",
      resourceUrl: source
    })
  })

  it("preserves an attachment filename for proxied preview sources", () => {
    expect(
      buildImagePreviewPayload("https://example.com/generated", "attachment", SIDECAR_ORIGIN, {
        filename: "chart.png"
      })?.filename
    ).toBe("chart.png")
  })
})

describe("resolveRemoteImageUrl", () => {
  it("keeps remote URLs unchanged without a sidecar origin", () => {
    expect(resolveRemoteImageUrl("https://example.com/photo.png")).toBe(
      "https://example.com/photo.png"
    )
  })
})
