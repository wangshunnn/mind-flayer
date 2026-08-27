import type { UIMessage } from "ai"
import { describe, expect, it, vi } from "vitest"
import { ChatRenderStore } from "@/lib/chat-render-store"
import type { FrameSchedulerClock } from "@/lib/frame-scheduler"

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

describe("ChatRenderStore", () => {
  it("publishes the latest streamed message once per frame", () => {
    const { clock, flushFrame, pendingFrames } = createClock()
    const store = new ChatRenderStore(clock)
    const assistantListener = vi.fn()
    store.message("assistant").subscribe(assistantListener)

    store.enqueueMessages([message("assistant", "a")])
    store.enqueueMessages([message("assistant", "ab")])
    store.enqueueMessages([message("assistant", "abc")])

    expect(pendingFrames()).toBe(1)
    expect(store.message("assistant").getSnapshot()).toBeUndefined()
    flushFrame()

    expect(assistantListener).toHaveBeenCalledOnce()
    expect(store.message("assistant").getSnapshot()?.parts).toEqual([{ type: "text", text: "abc" }])
  })

  it("keeps settled message channels quiet when only the tail changes", () => {
    const { clock, flushFrame } = createClock()
    const store = new ChatRenderStore(clock)
    const user = message("user", "question", "user")
    const assistant = message("assistant", "a")
    const userListener = vi.fn()
    const assistantListener = vi.fn()
    store.message(user.id).subscribe(userListener)
    store.message(assistant.id).subscribe(assistantListener)

    store.publishMessagesNow([user, assistant])
    userListener.mockClear()
    assistantListener.mockClear()

    store.enqueueMessages([user, message("assistant", "ab")])
    flushFrame()

    expect(userListener).not.toHaveBeenCalled()
    expect(assistantListener).toHaveBeenCalledOnce()
  })

  it("publishes final content immediately and catches up after becoming visible", () => {
    const { clock, flushFrame, pendingFrames } = createClock()
    const store = new ChatRenderStore(clock)

    store.setVisible(false)
    store.enqueueMessages([message("assistant", "hidden")])
    expect(pendingFrames()).toBe(0)
    expect(store.order().getSnapshot()).toEqual([])

    store.setVisible(true)
    expect(store.message("assistant").getSnapshot()?.parts).toEqual([
      { type: "text", text: "hidden" }
    ])

    store.enqueueMessages([message("assistant", "final")])
    store.publishStatus("ready")
    expect(pendingFrames()).toBe(0)
    expect(store.message("assistant").getSnapshot()?.parts).toEqual([
      { type: "text", text: "final" }
    ])

    flushFrame()
  })

  it("removes messages and notifies their channels", () => {
    const { clock } = createClock()
    const store = new ChatRenderStore(clock)
    const removedListener = vi.fn()
    store.message("removed").subscribe(removedListener)
    store.publishMessagesNow([message("removed", "old")])
    removedListener.mockClear()

    store.publishMessagesNow([])

    expect(store.message("removed").getSnapshot()).toBeUndefined()
    expect(removedListener).toHaveBeenCalledOnce()
    expect(store.order().getSnapshot()).toEqual([])
  })

  it("keeps a 500-turn history quiet during a 120-chunk stream", () => {
    const { clock, flushFrame, pendingFrames } = createClock()
    const store = new ChatRenderStore(clock)
    const history = Array.from({ length: 1_000 }, (_, index) =>
      message(`history-${index}`, `message ${index}`, index % 2 === 0 ? "user" : "assistant")
    )
    const activeId = "active"
    const orderListener = vi.fn()
    const firstHistoryListener = vi.fn()
    const activeListener = vi.fn()
    store.publishMessagesNow([...history, message(activeId, "chunk 0")])
    store.order().subscribe(orderListener)
    store.message(history[0]?.id ?? "missing").subscribe(firstHistoryListener)
    store.message(activeId).subscribe(activeListener)

    for (let index = 1; index <= 120; index += 1) {
      store.enqueueMessages([...history, message(activeId, `chunk ${index}`)])
    }

    expect(pendingFrames()).toBe(1)
    flushFrame()
    expect(orderListener).not.toHaveBeenCalled()
    expect(firstHistoryListener).not.toHaveBeenCalled()
    expect(activeListener).toHaveBeenCalledOnce()
    expect(store.message(activeId).getSnapshot()?.parts).toEqual([
      { type: "text", text: "chunk 120" }
    ])
  })
})
