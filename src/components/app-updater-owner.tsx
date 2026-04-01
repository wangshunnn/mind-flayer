import { emit, listen } from "@tauri-apps/api/event"
import type { Update } from "@tauri-apps/plugin-updater"
import { useEffect, useRef } from "react"
import {
  APP_UPDATER_REQUEST_EVENT,
  APP_UPDATER_STATE_CHANGED_EVENT,
  type AppUpdaterRequest,
  type AppUpdaterResponse,
  type AppUpdaterSnapshot,
  canUseAppUpdater,
  checkForAppUpdate,
  createInitialAppUpdaterSnapshot,
  downloadAndInstallAppUpdate,
  getCurrentAppVersion,
  relaunchAfterUpdate,
  shouldAutoCheckForUpdates,
  toAppUpdateInfo,
  toErrorMessage
} from "@/lib/updater"

export function AppUpdaterOwner() {
  const snapshotRef = useRef<AppUpdaterSnapshot>(createInitialAppUpdaterSnapshot())
  const updateRef = useRef<Update | null>(null)
  const hasCheckedForUpdatesRef = useRef(false)
  const isOperationInFlightRef = useRef(false)

  useEffect(() => {
    let isMounted = true
    let unlisten: (() => void) | undefined

    const publishSnapshot = async () => {
      if (!isMounted) {
        return
      }

      await emit(APP_UPDATER_STATE_CHANGED_EVENT, snapshotRef.current)
    }

    const replaceSnapshot = async (
      nextSnapshot:
        | AppUpdaterSnapshot
        | ((currentSnapshot: AppUpdaterSnapshot) => AppUpdaterSnapshot)
    ) => {
      snapshotRef.current =
        typeof nextSnapshot === "function" ? nextSnapshot(snapshotRef.current) : nextSnapshot

      await publishSnapshot()
    }

    const respond = async (
      responseEvent: string | null | undefined,
      response: Omit<AppUpdaterResponse, "snapshot">
    ) => {
      if (!responseEvent || !isMounted) {
        return
      }

      await emit(responseEvent, {
        ...response,
        snapshot: snapshotRef.current
      } satisfies AppUpdaterResponse)
    }

    const runCheckForUpdates = async (silent = false) => {
      if (!canUseAppUpdater()) {
        await replaceSnapshot(currentSnapshot => ({
          ...currentSnapshot,
          status: "unavailable"
        }))
        return null
      }

      await replaceSnapshot(currentSnapshot => ({
        ...currentSnapshot,
        downloadedBytes: 0,
        error: null,
        status: "checking",
        totalBytes: null
      }))

      try {
        const nextUpdate = await checkForAppUpdate()

        if (updateRef.current && updateRef.current !== nextUpdate) {
          void updateRef.current.close().catch(() => undefined)
        }
        updateRef.current = nextUpdate

        if (!nextUpdate) {
          await replaceSnapshot(currentSnapshot => ({
            ...currentSnapshot,
            availableUpdate: null,
            status: "up-to-date"
          }))
          return null
        }

        const nextAvailableUpdate = toAppUpdateInfo(nextUpdate)
        await replaceSnapshot(currentSnapshot => ({
          ...currentSnapshot,
          availableUpdate: nextAvailableUpdate,
          currentVersion: nextUpdate.currentVersion,
          status: "update-available"
        }))

        return nextAvailableUpdate
      } catch (nextError) {
        if (silent) {
          await replaceSnapshot(currentSnapshot => ({
            ...currentSnapshot,
            status: "idle"
          }))
          return null
        }

        await replaceSnapshot(currentSnapshot => ({
          ...currentSnapshot,
          error: toErrorMessage(nextError),
          status: "error"
        }))
        throw nextError
      }
    }

    const runInstallUpdate = async () => {
      if (!updateRef.current) {
        return
      }

      await replaceSnapshot(currentSnapshot => ({
        ...currentSnapshot,
        downloadedBytes: 0,
        error: null,
        status: "installing",
        totalBytes: null
      }))

      try {
        await downloadAndInstallAppUpdate(updateRef.current, event => {
          if (!isMounted) {
            return
          }

          if (event.event === "Started") {
            snapshotRef.current = {
              ...snapshotRef.current,
              downloadedBytes: 0,
              totalBytes: event.data.contentLength ?? null
            }
            void publishSnapshot()
            return
          }

          if (event.event === "Progress") {
            snapshotRef.current = {
              ...snapshotRef.current,
              downloadedBytes: snapshotRef.current.downloadedBytes + event.data.chunkLength
            }
            void publishSnapshot()
          }
        })

        await replaceSnapshot(currentSnapshot => ({
          ...currentSnapshot,
          status: "restart-required"
        }))
      } catch (nextError) {
        await replaceSnapshot(currentSnapshot => ({
          ...currentSnapshot,
          error: toErrorMessage(nextError),
          status: "error"
        }))
        throw nextError
      }
    }

    const runRelaunchApp = async () => {
      try {
        await relaunchAfterUpdate()
      } catch (nextError) {
        await replaceSnapshot(currentSnapshot => ({
          ...currentSnapshot,
          error: toErrorMessage(nextError),
          status: "restart-required"
        }))
        throw nextError
      }
    }

    const handleRequest = async ({ action, responseEvent, silent }: AppUpdaterRequest) => {
      if (action === "sync") {
        await publishSnapshot()
        await respond(responseEvent, { error: null, ok: true })
        return
      }

      if (isOperationInFlightRef.current) {
        await respond(responseEvent, { error: null, ok: true })
        return
      }

      isOperationInFlightRef.current = true

      try {
        if (action === "check") {
          await runCheckForUpdates(silent)
        } else if (action === "install") {
          await runInstallUpdate()
        } else if (action === "relaunch") {
          await runRelaunchApp()
        }

        await respond(responseEvent, { error: null, ok: true })
      } catch (nextError) {
        await respond(responseEvent, {
          error: toErrorMessage(nextError) ?? "Updater request failed",
          ok: false
        })
      } finally {
        isOperationInFlightRef.current = false
      }
    }

    const initialize = async () => {
      const currentVersion = await getCurrentAppVersion()
      if (!isMounted) {
        return
      }

      snapshotRef.current = {
        ...snapshotRef.current,
        currentVersion
      }
      await publishSnapshot()

      unlisten = await listen<AppUpdaterRequest>(APP_UPDATER_REQUEST_EVENT, event => {
        void handleRequest(event.payload)
      })

      if (shouldAutoCheckForUpdates() && !hasCheckedForUpdatesRef.current) {
        hasCheckedForUpdatesRef.current = true
        void runCheckForUpdates(true)
      }
    }

    void initialize()

    return () => {
      isMounted = false
      unlisten?.()

      if (updateRef.current) {
        void updateRef.current.close().catch(() => undefined)
        updateRef.current = null
      }
    }
  }, [])

  return null
}
