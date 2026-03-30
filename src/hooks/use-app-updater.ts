import type { Update } from "@tauri-apps/plugin-updater"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  type AppUpdateInfo,
  type AppUpdaterStatus,
  canUseAppUpdater,
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  getCurrentAppVersion,
  relaunchAfterUpdate,
  toAppUpdateInfo,
  toErrorMessage
} from "@/lib/updater"

interface CheckForUpdatesOptions {
  silent?: boolean
}

export function useAppUpdater() {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<AppUpdaterStatus>(
    canUseAppUpdater() ? "idle" : "unavailable"
  )
  const updateRef = useRef<Update | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadVersion = async () => {
      const version = await getCurrentAppVersion()

      if (!cancelled) {
        setCurrentVersion(version)
      }
    }

    void loadVersion()

    return () => {
      cancelled = true

      if (updateRef.current) {
        void updateRef.current.close().catch(() => undefined)
        updateRef.current = null
      }
    }
  }, [])

  const checkForUpdates = useCallback(async ({ silent = false }: CheckForUpdatesOptions = {}) => {
    if (!canUseAppUpdater()) {
      setStatus("unavailable")
      return null
    }

    setError(null)
    setDownloadedBytes(0)
    setTotalBytes(null)
    setStatus("checking")

    try {
      const update = await checkForAppUpdate()

      if (updateRef.current && updateRef.current !== update) {
        void updateRef.current.close().catch(() => undefined)
      }
      updateRef.current = update

      if (!update) {
        setAvailableUpdate(null)
        setStatus("up-to-date")
        return null
      }

      const nextUpdate = toAppUpdateInfo(update)
      setAvailableUpdate(nextUpdate)
      setCurrentVersion(update.currentVersion)
      setStatus("update-available")

      return nextUpdate
    } catch (nextError) {
      const message = toErrorMessage(nextError)

      if (silent) {
        setStatus("idle")
        return null
      }

      setError(message)
      setStatus("error")
      throw nextError
    }
  }, [])

  const installUpdate = useCallback(async () => {
    if (!updateRef.current) {
      return
    }

    setError(null)
    setDownloadedBytes(0)
    setTotalBytes(null)
    setStatus("installing")

    try {
      await downloadAndInstallAppUpdate(updateRef.current, event => {
        if (event.event === "Started") {
          setDownloadedBytes(0)
          setTotalBytes(event.data.contentLength ?? null)
          return
        }

        if (event.event === "Progress") {
          setDownloadedBytes(current => current + event.data.chunkLength)
        }
      })

      setStatus("restart-required")
    } catch (nextError) {
      setError(toErrorMessage(nextError))
      setStatus("error")
      throw nextError
    }
  }, [])

  const relaunchApp = useCallback(async () => {
    await relaunchAfterUpdate()
  }, [])

  return {
    availableUpdate,
    canCheckForUpdates: canUseAppUpdater(),
    checkForUpdates,
    currentVersion,
    downloadedBytes,
    error,
    installUpdate,
    relaunchApp,
    status,
    totalBytes
  }
}
