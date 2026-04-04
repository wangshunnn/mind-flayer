import { getVersion } from "@tauri-apps/api/app"
import { isTauri } from "@tauri-apps/api/core"
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater"

export type AppUpdaterStatus =
  | "idle"
  | "unavailable"
  | "checking"
  | "up-to-date"
  | "update-available"
  | "installing"
  | "restart-required"
  | "error"

export interface AppUpdateInfo {
  body: string | null
  currentVersion: string
  date: string | null
  version: string
}

export interface AppUpdaterSnapshot {
  availableUpdate: AppUpdateInfo | null
  currentVersion: string | null
  downloadedBytes: number
  error: string | null
  status: AppUpdaterStatus
  totalBytes: number | null
}

export type AppUpdaterRequestAction = "check" | "install" | "relaunch" | "sync"

export interface AppUpdaterRequest {
  action: AppUpdaterRequestAction
  responseEvent?: string | null
  silent?: boolean
}

export interface AppUpdaterResponse {
  error: string | null
  ok: boolean
  snapshot: AppUpdaterSnapshot
}

export const APP_UPDATER_REQUEST_EVENT = "app-updater:request"
export const APP_UPDATER_RESPONSE_EVENT_PREFIX = "app-updater:response"
export const APP_UPDATER_STATE_CHANGED_EVENT = "app-updater:state-changed"
export const APP_GITHUB_RELEASES_URL = "https://github.com/wangshunnn/mind-flayer/releases"

export function canUseAppUpdater() {
  return isTauri() && !import.meta.env.DEV
}

export function shouldAutoCheckForUpdates() {
  return canUseAppUpdater()
}

export function createInitialAppUpdaterSnapshot(): AppUpdaterSnapshot {
  return {
    availableUpdate: null,
    currentVersion: null,
    downloadedBytes: 0,
    error: null,
    status: canUseAppUpdater() ? "idle" : "unavailable",
    totalBytes: null
  }
}

export async function getCurrentAppVersion() {
  if (!isTauri()) {
    return null
  }

  try {
    return await getVersion()
  } catch {
    return null
  }
}

export function toAppUpdateInfo(update: Update): AppUpdateInfo {
  return {
    body: update.body ?? null,
    currentVersion: update.currentVersion,
    date: update.date ?? null,
    version: update.version
  }
}

export function getAppReleaseUrl(version?: string | null) {
  const normalizedVersion = version?.trim()

  if (!normalizedVersion) {
    return APP_GITHUB_RELEASES_URL
  }

  const tagName = normalizedVersion.startsWith("v") ? normalizedVersion : `v${normalizedVersion}`
  return `${APP_GITHUB_RELEASES_URL}/tag/${encodeURIComponent(tagName)}`
}

export function formatUpdateDate(date: string | null, locale: string) {
  if (!date) {
    return null
  }

  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsedDate)
}

export function formatBytes(bytes: number, locale: string) {
  const units = [
    { label: "B", size: 1 },
    { label: "KB", size: 1024 },
    { label: "MB", size: 1024 * 1024 },
    { label: "GB", size: 1024 * 1024 * 1024 }
  ]

  const unit = [...units].reverse().find(candidate => bytes >= candidate.size) ?? units[0]
  const value = bytes / unit.size

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit.size === 1 ? 0 : 1
  }).format(value)} ${unit.label}`
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return null
}

export async function checkForAppUpdate() {
  if (!canUseAppUpdater()) {
    return null
  }

  const { check } = await import("@tauri-apps/plugin-updater")
  return check()
}

export async function downloadAndInstallAppUpdate(
  update: Update,
  onEvent?: (event: DownloadEvent) => void
) {
  await update.downloadAndInstall(onEvent)
}

export async function relaunchAfterUpdate() {
  const { relaunch } = await import("@tauri-apps/plugin-process")
  await relaunch()
}
