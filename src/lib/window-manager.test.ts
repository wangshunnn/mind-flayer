import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  constructed: vi.fn(),
  emit: vi.fn(),
  getByLabel: vi.fn(),
  listen: vi.fn(),
  readyHandler: undefined as ((event: { payload: { windowLabel: string } }) => void) | undefined,
  setFocus: vi.fn(),
  show: vi.fn(),
  unlisten: vi.fn(),
  unminimize: vi.fn()
}))

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class LogicalPosition {
    constructor(
      public x: number,
      public y: number
    ) {}
  }
}))

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: mocks.listen
}))

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class WebviewWindow {
    static getByLabel = mocks.getByLabel

    emit = mocks.emit
    setFocus = mocks.setFocus
    show = mocks.show
    unminimize = mocks.unminimize

    constructor(label: string, options: Record<string, unknown>) {
      mocks.constructed(label, options)
      queueMicrotask(() => {
        mocks.readyHandler?.({ payload: { windowLabel: "image-preview" } })
      })
    }
  }
}))

import {
  IMAGE_PREVIEW_READY_EVENT,
  IMAGE_PREVIEW_SHOW_EVENT,
  type ImagePreviewPayload
} from "@/lib/image-preview"
import { openImagePreviewWindow } from "@/lib/window-manager"

const EMBEDDED_PAYLOAD: ImagePreviewPayload = {
  alt: "photo.png",
  filename: "photo.png",
  kind: "embedded",
  localPath: null,
  originalUrl: "",
  resourceUrl: "data:image/png;base64,abc"
}

describe("openImagePreviewWindow", () => {
  beforeEach(() => {
    mocks.constructed.mockReset()
    mocks.emit.mockReset().mockResolvedValue(undefined)
    mocks.getByLabel.mockReset().mockResolvedValue(null)
    mocks.listen.mockReset().mockImplementation(async (_event, handler) => {
      mocks.readyHandler = handler
      return mocks.unlisten
    })
    mocks.readyHandler = undefined
    mocks.setFocus.mockReset().mockResolvedValue(undefined)
    mocks.show.mockReset().mockResolvedValue(undefined)
    mocks.unlisten.mockReset()
    mocks.unminimize.mockReset().mockResolvedValue(undefined)
  })

  it("waits for a new preview window to be ready before sending the payload", async () => {
    await openImagePreviewWindow(EMBEDDED_PAYLOAD)

    expect(mocks.listen).toHaveBeenCalledWith(IMAGE_PREVIEW_READY_EVENT, expect.any(Function))
    expect(mocks.constructed).toHaveBeenCalledWith(
      "image-preview",
      expect.objectContaining({ url: "/image-preview" })
    )
    expect(mocks.emit).toHaveBeenCalledWith(IMAGE_PREVIEW_SHOW_EVENT, EMBEDDED_PAYLOAD)
    expect(mocks.unlisten).toHaveBeenCalledOnce()
    expect(mocks.setFocus).toHaveBeenCalledOnce()
  })

  it("updates an existing preview window without creating another one", async () => {
    const existingWindow = {
      emit: vi.fn().mockResolvedValue(undefined),
      setFocus: vi.fn().mockResolvedValue(undefined),
      show: vi.fn().mockResolvedValue(undefined),
      unminimize: vi.fn().mockResolvedValue(undefined)
    }
    mocks.getByLabel.mockResolvedValue(existingWindow)

    await openImagePreviewWindow(EMBEDDED_PAYLOAD)

    expect(mocks.constructed).not.toHaveBeenCalled()
    expect(existingWindow.emit).toHaveBeenCalledWith(IMAGE_PREVIEW_SHOW_EVENT, EMBEDDED_PAYLOAD)
    expect(existingWindow.show).toHaveBeenCalledOnce()
    expect(existingWindow.unminimize).toHaveBeenCalledOnce()
    expect(existingWindow.setFocus).toHaveBeenCalledOnce()
  })
})
