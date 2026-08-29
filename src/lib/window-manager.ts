import { LogicalPosition } from "@tauri-apps/api/dpi"
import { emit, listen } from "@tauri-apps/api/event"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import {
  IMAGE_PREVIEW_READY_EVENT,
  IMAGE_PREVIEW_SHOW_EVENT,
  IMAGE_PREVIEW_WINDOW_LABEL,
  type ImagePreviewPayload,
  type ImagePreviewReadyPayload
} from "@/lib/image-preview"

const IMAGE_PREVIEW_READY_TIMEOUT_MS = 10_000

let imagePreviewQueue = Promise.resolve()

/**
 * Settings section identifiers
 */
export enum SettingsSection {
  PROVIDERS = "providers",
  CHANNELS = "channels",
  WEB_SEARCH = "web-search",
  GENERAL = "general",
  KEYBOARD = "keyboard",
  ADVANCED = "advanced",
  ABOUT = "about"
}

/**
 * Validate and normalize settings section value
 */
export function isValidSettingsSection(section: string): section is SettingsSection {
  return Object.values(SettingsSection).includes(section as SettingsSection)
}

/**
 * Get settings section with fallback to GENERAL
 */
export function getValidSettingsSection(section: string | null | undefined): SettingsSection {
  if (section && isValidSettingsSection(section)) {
    return section as SettingsSection
  }
  return SettingsSection.GENERAL
}

export async function openSettingsWindow(initialTab: SettingsSection = SettingsSection.GENERAL) {
  const existingWindow = await WebviewWindow.getByLabel("settings")

  if (existingWindow) {
    await existingWindow.setFocus()
    await emit("settings-change-tab", initialTab)
    return
  }

  new WebviewWindow("settings", {
    url: `/settings?tab=${initialTab}`,
    width: 720,
    height: 680,
    center: true,
    resizable: false,
    fullscreen: false,
    maximizable: false,
    minimizable: false,
    hiddenTitle: true,
    titleBarStyle: "overlay",
    trafficLightPosition: new LogicalPosition(24, 30)
  })
}

async function showImagePreviewWindow(payload: ImagePreviewPayload): Promise<void> {
  const existingWindow = await WebviewWindow.getByLabel(IMAGE_PREVIEW_WINDOW_LABEL)

  if (existingWindow) {
    await existingWindow.emit(IMAGE_PREVIEW_SHOW_EVENT, payload)
    await existingWindow.show()
    await existingWindow.unminimize()
    await existingWindow.setFocus()
    return
  }

  let resolveReady: (() => void) | undefined
  const ready = new Promise<void>(resolve => {
    resolveReady = resolve
  })
  const unlisten = await listen<ImagePreviewReadyPayload>(IMAGE_PREVIEW_READY_EVENT, event => {
    if (event.payload.windowLabel === IMAGE_PREVIEW_WINDOW_LABEL) {
      resolveReady?.()
    }
  })

  const previewWindow = new WebviewWindow(IMAGE_PREVIEW_WINDOW_LABEL, {
    url: "/image-preview",
    width: 920,
    height: 640,
    minWidth: 520,
    minHeight: 380,
    center: true,
    resizable: true,
    fullscreen: false,
    hiddenTitle: true,
    titleBarStyle: "overlay",
    trafficLightPosition: new LogicalPosition(16, 18)
  })

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      ready,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Image preview window did not become ready"))
        }, IMAGE_PREVIEW_READY_TIMEOUT_MS)
      })
    ])

    await previewWindow.emit(IMAGE_PREVIEW_SHOW_EVENT, payload)
    await previewWindow.show()
    await previewWindow.unminimize()
    await previewWindow.setFocus()
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
    unlisten()
  }
}

export function openImagePreviewWindow(payload: ImagePreviewPayload): Promise<void> {
  const request = imagePreviewQueue
    .catch(() => undefined)
    .then(() => showImagePreviewWindow(payload))
  imagePreviewQueue = request
  return request
}
