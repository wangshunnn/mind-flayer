import { describe, expect, it, vi } from "vitest"
import { FrameScheduler, type FrameSchedulerClock } from "@/lib/frame-scheduler"

function createClock() {
  const frames = new Map<number, FrameRequestCallback>()
  const microtasks: Array<() => void> = []
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
    queueMicrotask: callback => {
      microtasks.push(callback)
    }
  }
  return {
    clock,
    flushFrame: () => {
      const pending = [...frames.entries()]
      frames.clear()
      for (const [, callback] of pending) {
        callback(performance.now())
      }
    },
    flushMicrotasks: () => {
      for (;;) {
        const callback = microtasks.shift()
        if (!callback) {
          return
        }
        callback()
      }
    },
    pendingFrames: () => frames.size
  }
}

describe("FrameScheduler", () => {
  it("coalesces frame work and runs only the latest callback", () => {
    const { clock, flushFrame, pendingFrames } = createClock()
    const scheduler = new FrameScheduler(clock)
    const first = vi.fn()
    const latest = vi.fn()

    scheduler.scheduleFrame(first)
    scheduler.scheduleFrame(latest)

    expect(pendingFrames()).toBe(1)
    flushFrame()
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
  })

  it("lets microtask and immediate work preempt a pending frame", () => {
    const { clock, flushFrame, flushMicrotasks, pendingFrames } = createClock()
    const scheduler = new FrameScheduler(clock)
    const frame = vi.fn()
    const microtask = vi.fn()
    const immediate = vi.fn()

    scheduler.scheduleFrame(frame)
    scheduler.scheduleMicrotask(microtask)
    expect(pendingFrames()).toBe(0)
    flushMicrotasks()
    expect(microtask).toHaveBeenCalledOnce()

    scheduler.scheduleFrame(frame)
    scheduler.flushNow(immediate)
    flushFrame()
    expect(frame).not.toHaveBeenCalled()
    expect(immediate).toHaveBeenCalledOnce()
  })

  it("cancels pending work on dispose", () => {
    const { clock, flushFrame, pendingFrames } = createClock()
    const scheduler = new FrameScheduler(clock)
    const work = vi.fn()

    scheduler.scheduleFrame(work)
    scheduler.dispose()

    expect(pendingFrames()).toBe(0)
    flushFrame()
    expect(work).not.toHaveBeenCalled()
  })
})
