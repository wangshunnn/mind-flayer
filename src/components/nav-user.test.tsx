import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NavUser } from "@/components/nav-user"
import { SidebarProvider } from "@/components/ui/sidebar"
import i18n from "@/lib/i18n"

const { setAppearanceThemeMock } = vi.hoisted(() => ({
  setAppearanceThemeMock: vi.fn().mockResolvedValue(undefined)
}))

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn().mockResolvedValue(undefined),
    appearanceTheme: "forest",
    setAppearanceTheme: setAppearanceThemeMock,
    resolvedTheme: "light"
  })
}))

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    language: "en",
    changeLanguage: vi.fn().mockResolvedValue(undefined)
  })
}))

vi.mock("@/hooks/use-local-shortcut", () => ({
  useLocalShortcut: vi.fn()
}))

vi.mock("@/hooks/use-shortcut-config", () => ({
  useShortcutDisplay: () => ["⌘", ","]
}))

vi.mock("@/hooks/use-autofocus-selected-dropdown-item", () => ({
  useAutofocusSelectedDropdownItem: () => ({
    scopeId: "test-scope",
    focusSelectedItem: vi.fn()
  })
}))

vi.mock("@/lib/window-manager", () => ({
  SettingsSection: { GENERAL: "general" },
  openSettingsWindow: vi.fn()
}))

describe("NavUser", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let previousMatchMedia: typeof window.matchMedia | undefined
  let previousPointerEvent: typeof PointerEvent | undefined
  let previousResizeObserver: typeof ResizeObserver | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    previousMatchMedia = window.matchMedia
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      }))
    })

    previousPointerEvent = globalThis.PointerEvent
    if (typeof globalThis.PointerEvent === "undefined") {
      ;(globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent =
        MouseEvent as typeof PointerEvent
    }

    previousResizeObserver = globalThis.ResizeObserver
    class ResizeObserverMock {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as never
  })

  beforeEach(async () => {
    await i18n.changeLanguage("en")
    setAppearanceThemeMock.mockClear()

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarProvider>
            <NavUser />
          </SidebarProvider>
        </I18nextProvider>
      )
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ""
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: previousMatchMedia
    })
    ;(globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent = previousPointerEvent
    ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      previousResizeObserver
  })

  it("keeps the settings menu open after changing an option", async () => {
    const trigger = container.querySelector<HTMLElement>('[data-slot="dropdown-menu-trigger"]')
    expect(trigger).not.toBeNull()

    await act(async () => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
      await Promise.resolve()
    })

    const themePresetTrigger = Array.from(
      document.body.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-sub-trigger"]')
    ).find(element => element.textContent?.includes("Theme preset"))
    expect(themePresetTrigger).not.toBeUndefined()

    await act(async () => {
      themePresetTrigger?.focus()
      themePresetTrigger?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })
      )
      await Promise.resolve()
    })

    const auroraItem = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    ).find(element => element.textContent?.includes("System Blue"))
    expect(auroraItem).not.toBeUndefined()

    await act(async () => {
      auroraItem?.click()
      await Promise.resolve()
    })

    expect(setAppearanceThemeMock).toHaveBeenCalledWith("aurora")
    expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).not.toBeNull()
    expect(document.body.querySelector('[data-slot="dropdown-menu-sub-content"]')).not.toBeNull()
  })
})
