import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NavChats } from "@/components/nav-chats"
import { SidebarProvider } from "@/components/ui/sidebar"
import i18n from "@/lib/i18n"
import type { Chat } from "@/types/chat"

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

  const chats: Chat[] = [
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
  ]

  const renderNavChats = async ({
    onRenameChat = vi.fn(),
    onDeleteChat = vi.fn()
  }: {
    onRenameChat?: (chatId: string, title: string) => Promise<void>
    onDeleteChat?: (chatId: string) => void
  } = {}) => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarProvider>
            <NavChats
              activeChatId="chat-1"
              chats={chats}
              onChatClick={vi.fn()}
              onDeleteChat={onDeleteChat}
              onRenameChat={onRenameChat}
              replyingChatIds={new Set(["chat-1"])}
              unreadChatIds={new Set(["chat-2"])}
            />
          </SidebarProvider>
        </I18nextProvider>
      )
    })
  }

  const openFirstChatMenu = async () => {
    const menuTrigger = container.querySelector<HTMLButtonElement>(
      'button[data-sidebar="menu-action"]'
    )
    expect(menuTrigger).not.toBeNull()

    await act(async () => {
      menuTrigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }))
      menuTrigger?.click()
      await Promise.resolve()
    })
  }

  const getMenuItem = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(element =>
      element.textContent?.includes(label)
    )

  const getButton = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      button => button.textContent?.trim() === label
    )

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const prototype = Object.getPrototypeOf(input)
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set

    valueSetter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }

  it("uses the sidebar highlight color for unread and replying badges", async () => {
    await renderNavChats()

    const notificationIcons = Array.from(container.querySelectorAll("svg")).filter(icon =>
      icon.getAttribute("class")?.includes("text-sidebar-primary")
    )

    expect(container.textContent).toContain("Replying chat")
    expect(container.textContent).toContain("Unread chat")
    expect(notificationIcons).toHaveLength(2)
  })

  it("renames a chat from the more menu with a trimmed title", async () => {
    const onRenameChat = vi.fn().mockResolvedValue(undefined)
    await renderNavChats({ onRenameChat })
    await openFirstChatMenu()

    const renameItem = getMenuItem("Rename Chat")
    expect(renameItem).not.toBeNull()

    await act(async () => {
      renameItem?.click()
      await Promise.resolve()
    })

    const titleInput = document.body.querySelector<HTMLInputElement>('input[name="chat-title"]')
    expect(document.body.textContent).toContain("Rename Chat")
    expect(titleInput?.value).toBe("Replying chat")

    await act(async () => {
      if (titleInput) {
        setInputValue(titleInput, "  Updated title  ")
      }
    })

    const saveButton = getButton("Save")
    expect(saveButton).not.toBeNull()

    await act(async () => {
      saveButton?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onRenameChat).toHaveBeenCalledWith("chat-1", "Updated title")
  })

  it("does not submit a blank chat title", async () => {
    const onRenameChat = vi.fn().mockResolvedValue(undefined)
    await renderNavChats({ onRenameChat })
    await openFirstChatMenu()

    await act(async () => {
      getMenuItem("Rename Chat")?.click()
      await Promise.resolve()
    })

    const titleInput = document.body.querySelector<HTMLInputElement>('input[name="chat-title"]')
    await act(async () => {
      if (titleInput) {
        setInputValue(titleInput, "   ")
      }
    })

    const saveButton = getButton("Save")
    expect(saveButton?.disabled).toBe(true)

    await act(async () => {
      saveButton?.click()
      await Promise.resolve()
    })

    expect(onRenameChat).not.toHaveBeenCalled()
  })

  it("closes the rename dialog without saving when the title is unchanged", async () => {
    const onRenameChat = vi.fn().mockResolvedValue(undefined)
    await renderNavChats({ onRenameChat })
    await openFirstChatMenu()

    await act(async () => {
      getMenuItem("Rename Chat")?.click()
      await Promise.resolve()
    })

    const saveButton = getButton("Save")
    expect(saveButton).not.toBeNull()

    await act(async () => {
      saveButton?.click()
      await Promise.resolve()
    })

    expect(onRenameChat).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain("Rename Chat")
  })
})
