import type { UIMessage } from "ai"
import { act, StrictMode } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ChatTranscript } from "@/components/chat-transcript"
import { ChatRenderStore } from "@/lib/chat-render-store"
import type { FrameSchedulerClock } from "@/lib/frame-scheduler"
import i18n from "@/lib/i18n"

function message(id: string, text: string, role: UIMessage["role"] = "assistant"): UIMessage {
  return { id, role, parts: [{ type: "text", text }] }
}

function createClock() {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1
  const clock: FrameSchedulerClock = {
    requestFrame: callback => {
      const frameId = nextFrameId
      nextFrameId += 1
      frames.set(frameId, callback)
      return frameId
    },
    cancelFrame: frameId => {
      frames.delete(frameId)
    },
    queueMicrotask: callback => callback()
  }
  return {
    clock,
    flushFrame: () => {
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) {
        callback(performance.now())
      }
    },
    pendingFrames: () => frames.size
  }
}

describe("ChatTranscript streaming isolation", () => {
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

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  it("coalesces a chunk burst into the active row without mutating settled rows", async () => {
    const { clock, flushFrame, pendingFrames } = createClock()
    const store = new ChatRenderStore(clock)
    const user = message("user", "question", "user")
    const settled = message("settled", "stable answer")
    const orderListener = vi.fn()
    const initialActive = message("active", "chunk 0")
    store.publishMessagesNow([user, settled, initialActive])
    store.publishStatus("streaming")
    store.order().subscribe(orderListener)

    await act(async () => {
      root.render(
        <StrictMode>
          <I18nextProvider i18n={i18n}>
            <ChatTranscript
              store={store}
              getMessageNodeRef={() => undefined}
              onRegenerate={() => {}}
              onToolApprovalResponse={async () => {}}
            />
          </I18nextProvider>
        </StrictMode>
      )
    })

    const settledRow = container.querySelector<HTMLElement>('[data-message-id="settled"]')
    const activeRow = container.querySelector<HTMLElement>('[data-message-id="active"]')
    expect(settledRow?.style.contentVisibility).toBe("auto")
    expect(activeRow?.style.contentVisibility).toBe("visible")

    const settledMutations: MutationRecord[] = []
    const observer = new MutationObserver(records => {
      settledMutations.push(...records)
    })
    if (settledRow) {
      observer.observe(settledRow, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true
      })
    }

    await act(async () => {
      for (let index = 1; index <= 120; index += 1) {
        store.enqueueMessages([user, settled, message("active", `chunk ${index}`)])
      }
      expect(pendingFrames()).toBe(1)
      flushFrame()
      await Promise.resolve()
    })

    observer.disconnect()
    expect(orderListener).not.toHaveBeenCalled()
    expect(settledMutations).toEqual([])
    expect(container.querySelector('[data-message-id="settled"]')).toBe(settledRow)
    expect(container.querySelector('[data-message-id="active"]')?.textContent).toContain(
      "chunk 120"
    )
    store.dispose()
  })
})
