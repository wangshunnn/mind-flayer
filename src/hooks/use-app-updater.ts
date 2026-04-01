import { emit, listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useState } from "react"
import {
  APP_UPDATER_REQUEST_EVENT,
  APP_UPDATER_RESPONSE_EVENT_PREFIX,
  APP_UPDATER_STATE_CHANGED_EVENT,
  type AppUpdateInfo,
  type AppUpdaterRequest,
  type AppUpdaterRequestAction,
  type AppUpdaterResponse,
  type AppUpdaterSnapshot,
  canUseAppUpdater,
  createInitialAppUpdaterSnapshot,
  getCurrentAppVersion
} from "@/lib/updater"

const APP_UPDATER_REQUEST_TIMEOUT_MS = 15_000

interface CheckForUpdatesOptions {
  silent?: boolean
}

function createUpdaterRequest(
  action: AppUpdaterRequestAction,
  silent?: boolean
): AppUpdaterRequest {
  return {
    action,
    responseEvent: `${APP_UPDATER_RESPONSE_EVENT_PREFIX}:${globalThis.crypto.randomUUID()}`,
    ...(silent !== undefined ? { silent } : {})
  }
}

async function waitForUpdaterResponse(responseEvent: string) {
  return new Promise<AppUpdaterResponse>((resolve, reject) => {
    let isSettled = false
    let timeoutId: number | null = null
    let unlistenResponse: (() => void) | null = null

    const cleanup = () => {
      isSettled = true

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      unlistenResponse?.()
    }

    timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error("Updater owner did not respond in time"))
    }, APP_UPDATER_REQUEST_TIMEOUT_MS)

    void listen<AppUpdaterResponse>(responseEvent, event => {
      if (isSettled) {
        return
      }

      cleanup()
      resolve(event.payload)
    })
      .then(unlisten => {
        unlistenResponse = unlisten

        if (isSettled) {
          unlisten()
        }
      })
      .catch(error => {
        if (isSettled) {
          return
        }

        cleanup()
        reject(error)
      })
  })
}

export function useAppUpdater() {
  const [snapshot, setSnapshot] = useState<AppUpdaterSnapshot>(createInitialAppUpdaterSnapshot)

  useEffect(() => {
    let isMounted = true
    let unlisten: (() => void) | undefined

    const initialize = async () => {
      const currentVersion = await getCurrentAppVersion()
      if (isMounted && currentVersion) {
        setSnapshot(currentSnapshot => ({
          ...currentSnapshot,
          currentVersion
        }))
      }

      unlisten = await listen<AppUpdaterSnapshot>(APP_UPDATER_STATE_CHANGED_EVENT, event => {
        setSnapshot(event.payload)
      })

      if (canUseAppUpdater()) {
        await emit(APP_UPDATER_REQUEST_EVENT, {
          action: "sync"
        } satisfies AppUpdaterRequest)
      }
    }

    void initialize()

    return () => {
      isMounted = false
      unlisten?.()
    }
  }, [])

  const requestUpdaterAction = useCallback(
    async (action: AppUpdaterRequestAction, options?: CheckForUpdatesOptions) => {
      if (!canUseAppUpdater()) {
        setSnapshot(currentSnapshot => ({
          ...currentSnapshot,
          status: "unavailable"
        }))
        return null
      }

      const request = createUpdaterRequest(action, options?.silent)
      const responseEvent = request.responseEvent
      if (!responseEvent) {
        throw new Error("Updater request is missing a response event")
      }

      const responsePromise = waitForUpdaterResponse(responseEvent)
      await emit(APP_UPDATER_REQUEST_EVENT, request)
      const response = await responsePromise

      setSnapshot(response.snapshot)

      if (!response.ok) {
        throw new Error(response.error ?? "Updater request failed")
      }

      return response.snapshot
    },
    []
  )

  const checkForUpdates = useCallback(
    async ({ silent = false }: CheckForUpdatesOptions = {}): Promise<AppUpdateInfo | null> => {
      const nextSnapshot = await requestUpdaterAction("check", { silent })
      return nextSnapshot?.availableUpdate ?? null
    },
    [requestUpdaterAction]
  )

  const installUpdate = useCallback(async () => {
    await requestUpdaterAction("install")
  }, [requestUpdaterAction])

  const relaunchApp = useCallback(async () => {
    await requestUpdaterAction("relaunch")
  }, [requestUpdaterAction])

  return {
    ...snapshot,
    canCheckForUpdates: canUseAppUpdater(),
    checkForUpdates,
    installUpdate,
    relaunchApp
  }
}
