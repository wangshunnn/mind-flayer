import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider, useTheme } from "@/components/theme-provider"
import { getAppearanceThemeTokens } from "@/lib/appearance-themes"

const storeValues = new Map<string, unknown>()
const storeGet = vi.fn(async (key: string) => storeValues.get(key))
const storeSet = vi.fn(async (key: string, value: unknown) => {
  storeValues.set(key, value)
})
const settingChangedListeners = new Set<
  (event: { payload: { key: string; value: unknown } }) => void
>()

let systemPrefersDark = false
const mediaQueryListeners = new Set<(event: MediaQueryListEvent) => void>()

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({
    get: storeGet,
    set: storeSet
  }))
}))

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async (eventName: string, payload: { key: string; value: unknown }) => {
    if (eventName !== "setting-changed") {
      return
    }

    for (const listener of settingChangedListeners) {
      listener({ payload })
    }
  }),
  listen: vi.fn(
    async (
      eventName: string,
      listener: (event: { payload: { key: string; value: unknown } }) => void
    ) => {
      if (eventName === "setting-changed") {
        settingChangedListeners.add(listener)
      }

      return () => settingChangedListeners.delete(listener)
    }
  )
}))

function ThemeProbe({ id }: { id: string }) {
  const { theme, resolvedTheme, appearanceTheme, setTheme, setAppearanceTheme } = useTheme()

  return (
    <div data-probe={id}>
      <span data-slot={`${id}-theme`}>{theme}</span>
      <span data-slot={`${id}-resolved-theme`}>{resolvedTheme}</span>
      <span data-slot={`${id}-appearance-theme`}>{appearanceTheme}</span>
      <button data-action={`${id}-set-dark`} onClick={() => void setTheme("dark")} type="button" />
      <button
        data-action={`${id}-set-system`}
        onClick={() => void setTheme("system")}
        type="button"
      />
      <button
        data-action={`${id}-set-workbench`}
        onClick={() => void setAppearanceTheme("workbench")}
        type="button"
      />
      <button
        data-action={`${id}-set-graphite`}
        onClick={() => void setAppearanceTheme("graphite")}
        type="button"
      />
    </div>
  )
}

async function triggerClick(container: HTMLDivElement, action: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
  expect(button).not.toBeNull()

  await act(async () => {
    button?.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function getProbeText(container: HTMLDivElement, slot: string) {
  const element = container.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
  return element?.textContent
}

function updateSystemTheme(matches: boolean) {
  systemPrefersDark = matches

  const event = {
    matches,
    media: "(prefers-color-scheme: dark)"
  } as MediaQueryListEvent

  for (const listener of mediaQueryListeners) {
    listener(event)
  }
}

describe("ThemeProvider", () => {
  const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = []
  let previousActEnvironment: boolean | undefined
  let previousMatchMedia: typeof window.matchMedia | undefined

  beforeAll(() => {
    previousMatchMedia = window.matchMedia
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return systemPrefersDark
        },
        media: query,
        onchange: null,
        addEventListener: (_eventName: string, listener: (event: MediaQueryListEvent) => void) => {
          mediaQueryListeners.add(listener)
        },
        removeEventListener: (
          _eventName: string,
          listener: (event: MediaQueryListEvent) => void
        ) => {
          mediaQueryListeners.delete(listener)
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
          mediaQueryListeners.add(listener)
        },
        removeListener: (listener: (event: MediaQueryListEvent) => void) => {
          mediaQueryListeners.delete(listener)
        },
        dispatchEvent: () => true
      }))
    })
  })

  beforeEach(() => {
    storeValues.clear()
    settingChangedListeners.clear()
    mediaQueryListeners.clear()
    storeGet.mockClear()
    storeSet.mockClear()
    systemPrefersDark = false
    document.documentElement.className = ""
    document.documentElement.removeAttribute("data-appearance-theme")
    document.documentElement.style.cssText = ""
  })

  afterEach(async () => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop()

      if (!mounted) {
        continue
      }

      await act(async () => {
        mounted.root.unmount()
      })
      mounted.container.remove()
    }
  })

  afterAll(() => {
    if (previousMatchMedia) {
      window.matchMedia = previousMatchMedia
    }

    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  async function renderProbe(id: string) {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    mountedRoots.push({ container, root })

    await act(async () => {
      root.render(
        <ThemeProvider>
          <ThemeProbe id={id} />
        </ThemeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    return container
  }

  it("applies theme classes and appearance tokens when settings change", async () => {
    const container = await renderProbe("primary")

    const root = document.documentElement
    const forestLight = getAppearanceThemeTokens("forest", "light")

    expect(root.classList.contains("light")).toBe(true)
    expect(root.dataset.appearanceTheme).toBe("forest")
    expect(root.style.colorScheme).toBe("light")
    expect(root.style.getPropertyValue("--background")).toBe(forestLight["--background"])

    await triggerClick(container, "primary-set-dark")

    const forestDark = getAppearanceThemeTokens("forest", "dark")

    expect(root.classList.contains("dark")).toBe(true)
    expect(root.style.colorScheme).toBe("dark")
    expect(root.style.getPropertyValue("--brand-green-color")).toBe(
      forestDark["--brand-green-color"]
    )
    expect(storeValues.get("theme")).toBe("dark")
    expect(getProbeText(container, "primary-theme")).toBe("dark")

    await triggerClick(container, "primary-set-workbench")

    const workbenchDark = getAppearanceThemeTokens("workbench", "dark")

    expect(root.dataset.appearanceTheme).toBe("workbench")
    expect(root.style.getPropertyValue("--sidebar")).toBe(workbenchDark["--sidebar"])
    expect(root.style.getPropertyValue("--setting-sidebar")).toBe(
      workbenchDark["--setting-sidebar"]
    )
    expect(storeValues.get("appearanceTheme")).toBe("workbench")
    expect(getProbeText(container, "primary-appearance-theme")).toBe("workbench")
  })

  it("responds to system theme changes while keeping the selected appearance preset", async () => {
    storeValues.set("theme", "system")
    storeValues.set("appearanceTheme", "sand")

    await renderProbe("system")

    const root = document.documentElement

    expect(root.classList.contains("light")).toBe(true)
    expect(root.dataset.appearanceTheme).toBe("sand")
    expect(root.style.getPropertyValue("--background")).toBe(
      getAppearanceThemeTokens("sand", "light")["--background"]
    )

    await act(async () => {
      updateSystemTheme(true)
    })

    expect(root.classList.contains("dark")).toBe(true)
    expect(root.style.colorScheme).toBe("dark")
    expect(root.style.getPropertyValue("--background")).toBe(
      getAppearanceThemeTokens("sand", "dark")["--background"]
    )
  })

  it("syncs appearance theme changes across providers via setting-changed events", async () => {
    const firstContainer = await renderProbe("first")
    const secondContainer = await renderProbe("second")

    await triggerClick(firstContainer, "first-set-graphite")

    expect(getProbeText(firstContainer, "first-appearance-theme")).toBe("graphite")
    expect(getProbeText(secondContainer, "second-appearance-theme")).toBe("graphite")
    expect(document.documentElement.dataset.appearanceTheme).toBe("graphite")
  })
})
