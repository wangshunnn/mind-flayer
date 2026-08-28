import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton
} from "@/components/ai-elements/conversation"
import type { ConversationScrollController } from "@/hooks/use-conversation-scroll"

type ResizeCallback = ResizeObserverCallback

const resizeCallbacks = new Set<ResizeCallback>()

class ResizeObserverMock {
  constructor(private readonly callback: ResizeCallback) {
    resizeCallbacks.add(callback)
  }

  observe() {}

  disconnect() {
    resizeCallbacks.delete(this.callback)
  }
}

function notifyResize() {
  for (const callback of resizeCallbacks) {
    callback([], {} as ResizeObserver)
  }
}

function installScrollMetrics(element: HTMLElement, initialHeight = 1_000, initialClient = 300) {
  let scrollHeight = initialHeight
  let clientHeight = initialClient
  let scrollTop = 0

  Object.defineProperties(element, {
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight
    },
    clientHeight: {
      configurable: true,
      get: () => clientHeight
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        const floor = Math.max(0, scrollHeight - clientHeight)
        scrollTop = Math.max(0, Math.min(value, floor))
      }
    }
  })

  return {
    get scrollTop() {
      return scrollTop
    },
    setScrollTop(value: number) {
      element.scrollTop = value
    },
    setLayout(nextHeight: number, nextClient = clientHeight) {
      scrollHeight = nextHeight
      clientHeight = nextClient
      const floor = Math.max(0, scrollHeight - clientHeight)
      scrollTop = Math.min(scrollTop, floor)
    }
  }
}

function installFrameClock() {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const frameId = nextFrameId
    nextFrameId += 1
    frames.set(frameId, callback)
    return frameId
  })
  vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
    frames.delete(frameId)
  })
  return {
    flush(now: number) {
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) {
        callback(now)
      }
    },
    pending: () => frames.size
  }
}

describe("Conversation bottom follow", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    resizeCallbacks.clear()
    vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true } satisfies Partial<MediaQueryList>)
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
    resizeCallbacks.clear()
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  const renderConversation = (resetKey = "chat-a") => {
    const contextRef = createRef<ConversationScrollController>()
    act(() => {
      root.render(
        <Conversation contextRef={contextRef} resetKey={resetKey}>
          <ConversationContent>
            <div>Messages</div>
          </ConversationContent>
          <ConversationScrollButton aria-label="Back to bottom" />
        </Conversation>
      )
    })
    const scrollElement = container.querySelector(
      '[data-slot="conversation-scroll"]'
    ) as HTMLDivElement
    return { contextRef, scrollElement }
  }

  const dispatchScroll = (scrollElement: HTMLElement) => {
    act(() => {
      scrollElement.dispatchEvent(new Event("scroll"))
    })
  }

  const getBackToBottomButton = () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Back to bottom"]')

  it("follows content growth while pinned", () => {
    const { scrollElement } = renderConversation()
    const metrics = installScrollMetrics(scrollElement)

    act(notifyResize)
    expect(metrics.scrollTop).toBe(700)

    metrics.setLayout(1_200)
    act(notifyResize)
    expect(metrics.scrollTop).toBe(900)
  })

  it("does not move a reader who scrolled away", () => {
    const { scrollElement } = renderConversation()
    const metrics = installScrollMetrics(scrollElement)
    act(notifyResize)

    metrics.setScrollTop(400)
    dispatchScroll(scrollElement)
    expect(getBackToBottomButton()).not.toBeNull()

    metrics.setLayout(1_200)
    act(notifyResize)
    expect(metrics.scrollTop).toBe(400)
  })

  it("keeps ownership when viewport growth clamps a pinned position", () => {
    const { scrollElement } = renderConversation()
    const metrics = installScrollMetrics(scrollElement)
    act(notifyResize)
    expect(metrics.scrollTop).toBe(700)

    metrics.setLayout(1_000, 500)
    dispatchScroll(scrollElement)
    act(notifyResize)
    expect(getBackToBottomButton()).toBeNull()

    metrics.setLayout(1_400, 500)
    act(notifyResize)
    expect(metrics.scrollTop).toBe(900)
  })

  it("re-arms near the bottom without snapping the remaining distance", () => {
    const { scrollElement } = renderConversation()
    const metrics = installScrollMetrics(scrollElement)
    act(notifyResize)

    metrics.setScrollTop(685)
    dispatchScroll(scrollElement)

    expect(metrics.scrollTop).toBe(685)
    expect(getBackToBottomButton()).toBeNull()
  })

  it("returns to the bottom from the button", () => {
    const { scrollElement } = renderConversation()
    const metrics = installScrollMetrics(scrollElement)
    act(notifyResize)

    metrics.setScrollTop(300)
    dispatchScroll(scrollElement)
    act(() => {
      getBackToBottomButton()?.click()
    })

    expect(metrics.scrollTop).toBe(700)
    expect(getBackToBottomButton()).toBeNull()
  })

  it("animates a distant button scroll and records the final floor", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false } satisfies Partial<MediaQueryList>)
    )
    const frameClock = installFrameClock()
    const { scrollElement } = renderConversation()
    const metrics = installScrollMetrics(scrollElement)
    act(notifyResize)

    metrics.setScrollTop(300)
    dispatchScroll(scrollElement)
    act(() => {
      getBackToBottomButton()?.click()
    })
    expect(frameClock.pending()).toBe(1)
    expect(metrics.scrollTop).toBe(300)

    act(() => {
      frameClock.flush(performance.now() + 1_000)
    })
    expect(metrics.scrollTop).toBe(700)
    expect(frameClock.pending()).toBe(0)
  })

  it("cancels the button animation when the reader scrolls away", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false } satisfies Partial<MediaQueryList>)
    )
    const frameClock = installFrameClock()
    const { scrollElement } = renderConversation()
    const metrics = installScrollMetrics(scrollElement)
    act(notifyResize)

    metrics.setScrollTop(300)
    dispatchScroll(scrollElement)
    act(() => {
      getBackToBottomButton()?.click()
    })

    metrics.setScrollTop(200)
    dispatchScroll(scrollElement)
    expect(frameClock.pending()).toBe(0)
    expect(metrics.scrollTop).toBe(200)
    expect(getBackToBottomButton()).not.toBeNull()
  })

  it("resets ownership and position when the conversation key changes", () => {
    const { contextRef, scrollElement } = renderConversation()
    const metrics = installScrollMetrics(scrollElement)
    act(notifyResize)

    metrics.setScrollTop(200)
    dispatchScroll(scrollElement)
    expect(contextRef.current?.isAtBottom).toBe(false)

    act(() => {
      root.render(
        <Conversation contextRef={contextRef} resetKey="chat-b">
          <ConversationContent>
            <div>Other messages</div>
          </ConversationContent>
          <ConversationScrollButton aria-label="Back to bottom" />
        </Conversation>
      )
    })

    expect(metrics.scrollTop).toBe(700)
    expect(contextRef.current?.isAtBottom).toBe(true)
  })

  it("notifies layout consumers from the shared observer", () => {
    const { contextRef } = renderConversation()
    const listener = vi.fn()
    const unsubscribe = contextRef.current?.addLayoutListener(listener)

    act(notifyResize)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe?.()
    act(notifyResize)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
