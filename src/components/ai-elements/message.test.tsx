import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const { openImagePreviewWindow } = vi.hoisted(() => ({
  openImagePreviewWindow: vi.fn()
}))

vi.mock("@/lib/window-manager", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/window-manager")>("@/lib/window-manager")
  return {
    ...actual,
    openImagePreviewWindow
  }
})

import { MessageResponse } from "@/components/ai-elements/message"

describe("MessageResponse local image rendering", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    openImagePreviewWindow.mockReset()
    container.remove()
  })

  it("renders local image with sidecar proxy URL", async () => {
    const localPath = "/Users/didi/Desktop/a.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${localPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    const source = image?.getAttribute("src")
    expect(source).toBeTruthy()

    const parsedUrl = new URL(source as string)
    expect(parsedUrl.origin).toBe("http://localhost:21420")
    expect(parsedUrl.pathname).toBe("/api/local-image")
    expect(parsedUrl.searchParams.get("path")).toBe(localPath)
    expect(parsedUrl.searchParams.get("_ts")).toBeTruthy()
  })

  it("renders file URL image with sidecar proxy URL", async () => {
    const fileUrlPath = "file:///Users/didi/Desktop/a.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${fileUrlPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    const source = image?.getAttribute("src")
    expect(source).toBeTruthy()

    const parsedUrl = new URL(source as string)
    expect(parsedUrl.origin).toBe("http://localhost:21420")
    expect(parsedUrl.pathname).toBe("/api/local-image")
    expect(parsedUrl.searchParams.get("path")).toBe(fileUrlPath)
    expect(parsedUrl.searchParams.get("_ts")).toBeTruthy()
  })

  it("renders file URL image with whitespace in the local path", async () => {
    const fileUrlPath =
      "file:///Users/didi/Library/Application Support/Mind Flayer/workspaces/shot one.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${fileUrlPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()

    const source = image?.getAttribute("src")
    expect(source).toBeTruthy()

    const parsedUrl = new URL(source as string)
    expect(parsedUrl.origin).toBe("http://localhost:21420")
    expect(parsedUrl.pathname).toBe("/api/local-image")

    const proxiedFileUrl = parsedUrl.searchParams.get("path")
    expect(proxiedFileUrl).toBeTruthy()
    expect(decodeURIComponent(new URL(proxiedFileUrl as string).pathname)).toBe(
      "/Users/didi/Library/Application Support/Mind Flayer/workspaces/shot one.png"
    )
    expect(parsedUrl.searchParams.get("_ts")).toBeTruthy()
  })

  it("falls back to text link when image loading fails", async () => {
    const localPath = "/Users/didi/Desktop/missing.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${localPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    const imageSource = image?.getAttribute("src")
    expect(imageSource).toBeTruthy()

    await act(async () => {
      image?.dispatchEvent(new Event("error"))
    })

    expect(container.querySelector("img")).toBeNull()

    const fallbackLink = container.querySelector("a")
    expect(fallbackLink).not.toBeNull()
    expect(fallbackLink?.textContent).toBe(localPath)
    expect(fallbackLink?.getAttribute("href")).toBe(imageSource)
  })

  it("opens the image preview window when a previewable image is clicked", async () => {
    const remoteUrl = "https://example.com/assets/photo.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![remote](${remoteUrl})`}
        </MessageResponse>
      )
    })

    const previewButton = container.querySelector("button")
    expect(previewButton).not.toBeNull()

    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(openImagePreviewWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "remote",
        originalUrl: remoteUrl
      })
    )
  })

  it("applies chat-friendly image size caps for previewable images", async () => {
    const remoteUrl = "https://example.com/assets/photo.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![remote](${remoteUrl})`}
        </MessageResponse>
      )
    })

    const previewButton = container.querySelector("button")
    const image = container.querySelector("img")

    expect(previewButton?.className).toContain("sm:max-w-[32rem]")
    expect(image?.className).toContain("max-h-[28rem]")
    expect(image?.className).toContain("rounded-xl")
  })

  it("prevents the native context menu on previewable images", async () => {
    const remoteUrl = "https://example.com/assets/photo.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![remote](${remoteUrl})`}
        </MessageResponse>
      )
    })

    const previewButton = container.querySelector("button")
    expect(previewButton).not.toBeNull()

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    })
    previewButton?.dispatchEvent(contextMenuEvent)

    expect(contextMenuEvent.defaultPrevented).toBe(true)
  })
})
