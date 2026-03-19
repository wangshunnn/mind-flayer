import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ChannelTelegramChat } from "@/components/channel-telegram-chat"
import { SidebarProvider } from "@/components/ui/sidebar"
import i18n from "@/lib/i18n"

const { getTelegramChannelSessionMessagesMock, getTelegramChannelSessionsMock } = vi.hoisted(
  () => ({
    getTelegramChannelSessionsMock: vi.fn(),
    getTelegramChannelSessionMessagesMock: vi.fn()
  })
)

vi.mock("@/lib/sidecar-client", () => ({
  getTelegramChannelSessions: (...args: unknown[]) => getTelegramChannelSessionsMock(...args),
  getTelegramChannelSessionMessages: (...args: unknown[]) =>
    getTelegramChannelSessionMessagesMock(...args)
}))

vi.mock("@/hooks/use-local-shortcut", () => ({
  useLocalShortcut: vi.fn()
}))

const formatStartedAt = (value: number) =>
  new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value))

const formatCompactStartedAt = (value: number) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date(value))
  const lookup = new Map(parts.map(part => [part.type, part.value]))

  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")} ${lookup.get("hour")}:${lookup.get("minute")}:${lookup.get("second")}`
}

describe("ChannelTelegramChat", () => {
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

    getTelegramChannelSessionsMock.mockResolvedValue({
      sessions: [
        {
          sessionKey: "telegram:1001:session-b",
          sessionId: "session-b",
          chatId: "1001",
          startedAt: 1_710_000_100_000,
          updatedAt: 1_710_000_200_000,
          isActive: true,
          messageCount: 2,
          firstMessagePreview: "hello",
          lastMessageRole: "assistant",
          lastMessagePreview: "latest answer",
          latestAssistantUsage: {
            inputTokens: 32_000,
            outputTokens: 400,
            totalTokens: 32_400
          },
          latestModelProvider: "openai",
          latestModelProviderLabel: "OpenAI",
          latestModelId: "gpt-5.3-chat-latest",
          latestModelLabel: "GPT-5.3-Chat-Latest"
        },
        {
          sessionKey: "telegram:1001:session-a",
          sessionId: "session-a",
          chatId: "1001",
          startedAt: 1_710_000_000_000,
          updatedAt: 1_710_000_050_000,
          isActive: false,
          messageCount: 2,
          firstMessagePreview: "older hello",
          lastMessageRole: "assistant",
          lastMessagePreview: "older answer",
          latestAssistantUsage: {
            inputTokens: 16_000,
            outputTokens: 200,
            totalTokens: 16_200
          },
          latestModelProvider: "openai",
          latestModelProviderLabel: "OpenAI",
          latestModelId: "gpt-5.3-chat-latest",
          latestModelLabel: "GPT-5.3-Chat-Latest"
        },
        {
          sessionKey: "telegram:2002:session-c",
          sessionId: "session-c",
          chatId: "2002",
          startedAt: 1_710_000_300_000,
          updatedAt: 1_710_000_350_000,
          isActive: true,
          messageCount: 2,
          firstMessagePreview: "another thread",
          lastMessageRole: "assistant",
          lastMessagePreview: "another answer"
        }
      ]
    })

    getTelegramChannelSessionMessagesMock.mockImplementation((sessionKey: string) => {
      if (sessionKey === "telegram:1001:session-b") {
        return Promise.resolve({
          sessionKey,
          messages: [
            {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "hello" }]
            },
            {
              id: "assistant-1",
              role: "assistant",
              parts: [{ type: "text", text: "latest answer" }],
              metadata: {
                createdAt: 1_710_000_100_000,
                firstTokenAt: 1_710_000_100_400,
                lastTokenAt: 1_710_000_102_400,
                totalUsage: {
                  inputTokens: 32_000,
                  outputTokens: 400,
                  totalTokens: 32_400
                },
                modelProvider: "openai",
                modelProviderLabel: "OpenAI",
                modelId: "gpt-5.3-chat-latest",
                modelLabel: "GPT-5.3-Chat-Latest"
              }
            }
          ]
        })
      }

      return Promise.resolve({
        sessionKey,
        messages: [
          {
            id: "user-2",
            role: "user",
            parts: [{ type: "text", text: "older hello" }]
          },
          {
            id: "assistant-2",
            role: "assistant",
            parts: [{ type: "text", text: "older answer" }]
          }
        ]
      })
    })
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

  afterEach(async () => {
    vi.clearAllMocks()
    await act(async () => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ""
  })

  it("groups sessions by thread, shows status in the sidebar, and centers the selected started time", async () => {
    const latestStartedAtText = `Started ${formatStartedAt(1_710_000_100_000)}`
    const olderStartedAtText = `Started ${formatStartedAt(1_710_000_000_000)}`
    const latestCompactStartedAtText = formatCompactStartedAt(1_710_000_100_000)
    const olderCompactStartedAtText = formatCompactStartedAt(1_710_000_000_000)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarProvider>
            <ChannelTelegramChat />
          </SidebarProvider>
        </I18nextProvider>
      )
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const sessionButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-session-key]")
    )
    expect(sessionButtons).toHaveLength(3)
    expect(container.textContent).toContain("Thread 1001")
    expect(container.textContent).toContain("Thread 2002")
    expect(sessionButtons[0]?.textContent).toContain("hello")
    expect(sessionButtons[1]?.textContent).toContain("older hello")
    expect(sessionButtons[2]?.textContent).toContain("another thread")
    expect(sessionButtons[0]?.textContent).toContain(latestCompactStartedAtText)
    expect(sessionButtons[1]?.textContent).toContain(olderCompactStartedAtText)
    expect(sessionButtons[0]?.textContent).not.toContain("Started")
    expect(sessionButtons[1]?.textContent).not.toContain("Archived")
    expect(
      container
        .querySelector('[data-session-status="active"] svg')
        ?.getAttribute("class")
        ?.includes("text-status-positive")
    ).toBe(true)
    expect(container.querySelectorAll('[data-session-status="active"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-session-status="archived"]')).toHaveLength(1)
    expect(
      container
        .querySelector('[data-session-status="archived"]')
        ?.getAttribute("aria-label")
        ?.includes("cannot continue chatting")
    ).toBe(true)
    expect(sessionButtons[0]?.textContent).not.toEqual(sessionButtons[1]?.textContent)
    expect(sessionButtons[0]?.textContent).not.toContain("latest answer")
    expect(sessionButtons[1]?.textContent).not.toContain("older answer")
    expect(sessionButtons[0]?.textContent).not.toContain("25%")
    expect(
      container.querySelector('[data-testid="selected-thread-started-at"]')?.textContent
    ).toContain(latestStartedAtText)
    expect(container.textContent).toContain("25%")
    const contextWindowButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Context window usage:"]'
    )
    expect(contextWindowButton).not.toBeNull()
    expect(contextWindowButton?.getAttribute("aria-label")).toContain(
      "32,000 / 128,000 tokens · 25%"
    )
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="thread-context-usage-trigger"]')
        ?.dataset.variant
    ).toBe("ghost")
    const tokenDetailsButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="View token, cost, and speed details"]'
    )
    expect(tokenDetailsButton).not.toBeNull()
    expect(tokenDetailsButton?.getAttribute("aria-label")).toContain("TTFT 400ms")
    expect(tokenDetailsButton?.getAttribute("aria-label")).toContain("TTLT 2.40s")
    expect(tokenDetailsButton?.getAttribute("aria-label")).toContain("TPS 200.00")

    await act(async () => {
      sessionButtons[1]?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      container.querySelector('[data-testid="selected-thread-started-at"]')?.textContent
    ).toContain(olderStartedAtText)
    expect(container.textContent).toContain("older answer")
    expect(
      container.querySelector('[data-testid="selected-thread-archived-notice"]')?.textContent
    ).toContain("This thread is archived")
  })

  it("does not render the token usage button for assistant messages without usage metadata", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarProvider>
            <ChannelTelegramChat />
          </SidebarProvider>
        </I18nextProvider>
      )
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const sessionButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-session-key]")
    )

    await act(async () => {
      sessionButtons[1]?.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("older answer")
    expect(
      container.querySelector('button[aria-label^="View token, cost, and speed details"]')
    ).toBeNull()
  })
})
