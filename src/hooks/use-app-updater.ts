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

interface UpdaterResponseWaiter {
  cancel: () => void
  responsePromise: Promise<AppUpdaterResponse>
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

async function createUpdaterResponseWaiter(responseEvent: string): Promise<UpdaterResponseWaiter> {
  let isSettled = false
  let timeoutId: number | null = null
  let unlistenResponse: (() => void) | null = null
  let resolveResponse: (response: AppUpdaterResponse) => void = () => undefined
  let rejectResponse: (error: unknown) => void = () => undefined

  const cleanup = () => {
    isSettled = true

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }

    unlistenResponse?.()
    unlistenResponse = null
  }

  const responsePromise = new Promise<AppUpdaterResponse>((resolve, reject) => {
    resolveResponse = resolve
    rejectResponse = reject
  })

  try {
    unlistenResponse = await listen<AppUpdaterResponse>(responseEvent, event => {
      if (isSettled) {
        return
      }

      cleanup()
      resolveResponse(event.payload)
    })
  } catch (error) {
    cleanup()
    rejectResponse(error)
    return {
      cancel: cleanup,
      responsePromise
    }
  }

  timeoutId = window.setTimeout(() => {
    if (isSettled) {
      return
    }

    cleanup()
    rejectResponse(new Error("Updater owner did not respond in time"))
  }, APP_UPDATER_REQUEST_TIMEOUT_MS)

  return {
    cancel: cleanup,
    responsePromise
  }
}

export function useAppUpdater() {
  const [snapshot, setSnapshot] = useState<AppUpdaterSnapshot>(createInitialAppUpdaterSnapshot)

  useEffect(() => {
    let isMounted = true
    let unlisten: (() => void) | undefined

    const initialize = async () => {
      try {
        unlisten = await listen<AppUpdaterSnapshot>(APP_UPDATER_STATE_CHANGED_EVENT, event => {
          setSnapshot(event.payload)
        })
      } catch (nextError) {
        console.warn("[useAppUpdater] Failed to subscribe to updater state changes:", nextError)
        return
      }

      try {
        const currentVersion = await getCurrentAppVersion()
        if (isMounted && currentVersion) {
          setSnapshot(currentSnapshot => ({
            ...currentSnapshot,
            currentVersion
          }))
        }
      } catch (nextError) {
        if (isMounted) {
          console.warn("[useAppUpdater] Failed to load current app version:", nextError)
        }
      }

      if (canUseAppUpdater()) {
        try {
          await emit(APP_UPDATER_REQUEST_EVENT, {
            action: "sync"
          } satisfies AppUpdaterRequest)
        } catch (nextError) {
          if (isMounted) {
            console.warn("[useAppUpdater] Failed to request updater sync:", nextError)
          }
        }
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

      const responseWaiter = await createUpdaterResponseWaiter(responseEvent)

      try {
        await emit(APP_UPDATER_REQUEST_EVENT, request)
      } catch (nextError) {
        responseWaiter.cancel()
        throw nextError
      }

      const response = await responseWaiter.responsePromise

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
