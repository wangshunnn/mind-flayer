import type { Update } from "@tauri-apps/plugin-updater"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { AppUpdaterOwner } from "@/components/app-updater-owner"
import { APP_UPDATER_REQUEST_EVENT, APP_UPDATER_STATE_CHANGED_EVENT } from "@/lib/updater"

type EventListener<T> = (event: { payload: T }) => void

const emitMock = vi.hoisted(() => vi.fn(async () => undefined))
const eventListeners = vi.hoisted(() => new Map<string, Set<EventListener<unknown>>>())
const canUseAppUpdaterMock = vi.hoisted(() => vi.fn(() => true))
const checkForAppUpdateMock = vi.hoisted(() => vi.fn())
const downloadAndInstallAppUpdateMock = vi.hoisted(() => vi.fn())
const getCurrentAppVersionMock = vi.hoisted(() => vi.fn(async () => "0.4.0"))
const relaunchAfterUpdateMock = vi.hoisted(() => vi.fn(async () => undefined))
const shouldAutoCheckForUpdatesMock = vi.hoisted(() => vi.fn(() => false))

vi.mock("@tauri-apps/api/event", () => ({
  emit: emitMock,
  listen: vi.fn(async (eventName: string, listener: EventListener<unknown>) => {
    const listeners = eventListeners.get(eventName) ?? new Set<EventListener<unknown>>()
    listeners.add(listener)
    eventListeners.set(eventName, listeners)

    return () => {
      listeners.delete(listener)
    }
  })
}))

vi.mock("@/lib/updater", async () => {
  const actual = await vi.importActual<typeof import("@/lib/updater")>("@/lib/updater")

  return {
    ...actual,
    canUseAppUpdater: canUseAppUpdaterMock,
    checkForAppUpdate: checkForAppUpdateMock,
    createInitialAppUpdaterSnapshot: () => ({
      availableUpdate: null,
      currentVersion: null,
      downloadedBytes: 0,
      error: null,
      status: canUseAppUpdaterMock() ? "idle" : "unavailable",
      totalBytes: null
    }),
    downloadAndInstallAppUpdate: downloadAndInstallAppUpdateMock,
    getCurrentAppVersion: getCurrentAppVersionMock,
    relaunchAfterUpdate: relaunchAfterUpdateMock,
    shouldAutoCheckForUpdates: shouldAutoCheckForUpdatesMock
  }
})

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function dispatchUpdaterRequest(payload: {
  action: "check" | "install"
  responseEvent: string
}) {
  const listeners = eventListeners.get(APP_UPDATER_REQUEST_EVENT)
  expect(listeners?.size).toBeGreaterThan(0)

  await act(async () => {
    for (const listener of listeners ?? []) {
      listener({ payload })
    }

    await flushAsyncWork()
  })
}

describe("AppUpdaterOwner", () => {
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

    emitMock.mockClear()
    eventListeners.clear()
    canUseAppUpdaterMock.mockReturnValue(true)
    checkForAppUpdateMock.mockReset()
    downloadAndInstallAppUpdateMock.mockReset()
    getCurrentAppVersionMock.mockResolvedValue("0.4.0")
    relaunchAfterUpdateMock.mockReset()
    shouldAutoCheckForUpdatesMock.mockReturnValue(false)
  })

  afterEach(async () => {
    vi.clearAllMocks()

    await act(async () => {
      root.unmount()
      await flushAsyncWork()
    })

    container.remove()
    document.body.innerHTML = ""
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  it("acknowledges install requests before a slow download finishes", async () => {
    const update = {
      body: "Bug fixes",
      close: vi.fn(async () => undefined),
      currentVersion: "0.4.0",
      date: "2026-04-05T00:00:00.000Z",
      version: "0.4.1"
    } as unknown as Update
    let resolveInstall: (() => void) | null = null

    checkForAppUpdateMock.mockResolvedValue(update)
    downloadAndInstallAppUpdateMock.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveInstall = resolve
        })
    )

    await act(async () => {
      root.render(<AppUpdaterOwner />)
      await flushAsyncWork()
    })

    await dispatchUpdaterRequest({
      action: "check",
      responseEvent: "app-updater:response:check"
    })

    emitMock.mockClear()

    await dispatchUpdaterRequest({
      action: "install",
      responseEvent: "app-updater:response:install"
    })

    expect(downloadAndInstallAppUpdateMock).toHaveBeenCalledWith(update, expect.any(Function))
    expect(emitMock).toHaveBeenCalledWith(
      "app-updater:response:install",
      expect.objectContaining({
        ok: true,
        snapshot: expect.objectContaining({
          status: "installing"
        })
      })
    )

    expect(
      emitMock.mock.calls.some(call => {
        const [eventName, payload] = call as unknown as [string, unknown]

        return (
          eventName === APP_UPDATER_STATE_CHANGED_EVENT &&
          payload !== null &&
          typeof payload === "object" &&
          "status" in (payload as Record<string, unknown>) &&
          (payload as { status: string }).status === "restart-required"
        )
      })
    ).toBe(false)

    await act(async () => {
      resolveInstall?.()
      await flushAsyncWork()
    })

    expect(emitMock).toHaveBeenCalledWith(
      APP_UPDATER_STATE_CHANGED_EVENT,
      expect.objectContaining({
        status: "restart-required"
      })
    )
  })

  it("rejects install requests when no update is ready", async () => {
    await act(async () => {
      root.render(<AppUpdaterOwner />)
      await flushAsyncWork()
    })

    emitMock.mockClear()

    await dispatchUpdaterRequest({
      action: "install",
      responseEvent: "app-updater:response:install"
    })

    expect(downloadAndInstallAppUpdateMock).not.toHaveBeenCalled()
    expect(emitMock).toHaveBeenCalledWith(
      "app-updater:response:install",
      expect.objectContaining({
        error: "No app update is ready to install.",
        ok: false
      })
    )
  })
})
