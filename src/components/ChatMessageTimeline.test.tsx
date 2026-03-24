import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ChatMessageTimeline } from "@/components/ChatMessageTimeline"
import i18n from "@/lib/i18n"

describe("ChatMessageTimeline", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(async () => {
    await i18n.changeLanguage("en")

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ""
  })

  it("renders one dash per user message and marks the active anchor", async () => {
    const itemRefs = { current: [] as Array<HTMLButtonElement | null> }

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChatMessageTimeline
            activeIndex={1}
            anchors={[
              { id: "user-1", preview: "first" },
              { id: "user-2", preview: "second" },
              { id: "user-3", preview: "third" }
            ]}
            itemRefs={itemRefs}
            onSelect={() => {}}
          />
        </I18nextProvider>
      )
    })

    const anchors = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="chat-message-timeline-anchor-"]'
      )
    )

    expect(anchors).toHaveLength(3)
    expect(anchors[1]?.getAttribute("data-active")).toBe("true")
    expect(anchors[0]?.getAttribute("data-active")).toBe("false")
    expect(container.querySelector('[data-testid="chat-message-timeline-previous"]')).toBeNull()
    expect(container.querySelector('[data-testid="chat-message-timeline-next"]')).toBeNull()
  })

  it("calls the correct callback for anchor selection", async () => {
    const onSelect = vi.fn()

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChatMessageTimeline
            activeIndex={1}
            anchors={[
              { id: "user-1", preview: "first" },
              { id: "user-2", preview: "second" },
              { id: "user-3", preview: "third" }
            ]}
            onSelect={onSelect}
          />
        </I18nextProvider>
      )
    })

    const targetAnchor = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-message-timeline-anchor-2"]'
    )

    await act(async () => {
      targetAnchor?.click()
    })

    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it("uses preview text for anchor labels and falls back for empty previews", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChatMessageTimeline
            activeIndex={0}
            anchors={[
              { id: "user-1", preview: "hello world" },
              { id: "user-2", preview: "" }
            ]}
            onSelect={() => {}}
          />
        </I18nextProvider>
      )
    })

    const firstAnchor = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-message-timeline-anchor-0"]'
    )
    const secondAnchor = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-message-timeline-anchor-1"]'
    )

    expect(firstAnchor?.getAttribute("aria-label")).toBe("hello world")
    expect(secondAnchor?.getAttribute("aria-label")).toBe("Jump to message 2")
  })

  it("prevents text selection when timeline controls are pressed repeatedly", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChatMessageTimeline
            activeIndex={1}
            anchors={[
              { id: "user-1", preview: "first" },
              { id: "user-2", preview: "second" },
              { id: "user-3", preview: "third" }
            ]}
            onSelect={() => {}}
          />
        </I18nextProvider>
      )
    })

    const targetAnchor = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-message-timeline-anchor-1"]'
    )

    const anchorMouseDownEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true
    })

    targetAnchor?.dispatchEvent(anchorMouseDownEvent)

    expect(anchorMouseDownEvent.defaultPrevented).toBe(true)
  })
})
