import { LogicalPosition } from "@tauri-apps/api/dpi"
import { emit } from "@tauri-apps/api/event"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { type ImagePreviewPayload, storeImagePreviewSession } from "@/lib/image-preview"

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

export async function openImagePreviewWindow(payload: ImagePreviewPayload) {
  const existingWindow = await WebviewWindow.getByLabel("image-preview")

  if (existingWindow) {
    await existingWindow.emit("image-preview:show", payload)
    await existingWindow.show()
    await existingWindow.unminimize()
    await existingWindow.setFocus()
    return
  }

  const sessionId = globalThis.crypto.randomUUID()
  storeImagePreviewSession(sessionId, payload)

  new WebviewWindow("image-preview", {
    url: `/image-preview?session=${encodeURIComponent(sessionId)}`,
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
}
