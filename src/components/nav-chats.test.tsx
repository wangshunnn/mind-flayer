import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NavChats } from "@/components/nav-chats"
import { SidebarProvider } from "@/components/ui/sidebar"
import i18n from "@/lib/i18n"

vi.mock("@/hooks/use-local-shortcut", () => ({
  useLocalShortcut: vi.fn()
}))

describe("NavChats", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let previousMatchMedia: typeof window.matchMedia | undefined
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

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.clearAllMocks()
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

    ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      previousResizeObserver
  })

  it("uses the sidebar highlight color for unread and replying badges", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarProvider>
            <NavChats
              activeChatId="chat-1"
              chats={[
                {
                  id: "chat-1",
                  title: "Replying chat",
                  created_at: 1_710_000_000_000,
                  updated_at: 1_710_000_000_000
                },
                {
                  id: "chat-2",
                  title: "Unread chat",
                  created_at: 1_710_000_100_000,
                  updated_at: 1_710_000_100_000
                }
              ]}
              onChatClick={vi.fn()}
              onDeleteChat={vi.fn()}
              replyingChatIds={new Set(["chat-1"])}
              unreadChatIds={new Set(["chat-2"])}
            />
          </SidebarProvider>
        </I18nextProvider>
      )
    })

    const notificationIcons = Array.from(container.querySelectorAll("svg")).filter(icon =>
      icon.getAttribute("class")?.includes("text-sidebar-primary")
    )

    expect(container.textContent).toContain("Replying chat")
    expect(container.textContent).toContain("Unread chat")
    expect(notificationIcons).toHaveLength(2)
  })
})
