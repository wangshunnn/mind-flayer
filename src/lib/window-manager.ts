import { LogicalPosition } from "@tauri-apps/api/dpi"
import { emit } from "@tauri-apps/api/event"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"

/**
 * Settings section identifiers
 */
export enum SettingsSection {
  PROVIDERS = "providers",
  WEB_SEARCH = "web-search",
  GENERAL = "general",
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
    height: 540,
    resizable: false,
    fullscreen: false,
    maximizable: false,
    minimizable: false,
    hiddenTitle: true,
    titleBarStyle: "overlay",
    trafficLightPosition: new LogicalPosition(24, 30)
  })
}
