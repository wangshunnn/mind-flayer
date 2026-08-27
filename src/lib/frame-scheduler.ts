export interface FrameSchedulerClock {
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (frameId: number) => void
  queueMicrotask: (callback: () => void) => void
}

function createDefaultClock(): FrameSchedulerClock {
  const fallbackTimers = new Map<number, ReturnType<typeof globalThis.setTimeout>>()
  let nextFallbackFrameId = 1

  return {
    requestFrame: callback => {
      if (typeof globalThis.requestAnimationFrame === "function") {
        return globalThis.requestAnimationFrame(callback)
      }
      const frameId = nextFallbackFrameId
      nextFallbackFrameId += 1
      const timer = globalThis.setTimeout(() => {
        fallbackTimers.delete(frameId)
        callback(performance.now())
      }, 16)
      fallbackTimers.set(frameId, timer)
      return frameId
    },
    cancelFrame: frameId => {
      if (typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(frameId)
        return
      }
      const timer = fallbackTimers.get(frameId)
      if (timer) {
        globalThis.clearTimeout(timer)
        fallbackTimers.delete(frameId)
      }
    },
    queueMicrotask: callback => globalThis.queueMicrotask(callback)
  }
}

/**
 * Coalesces replaceable work into either the next browser frame or microtask.
 * Immediate work invalidates scheduled callbacks and publishes synchronously.
 */
export class FrameScheduler {
  private readonly clock: FrameSchedulerClock
  private frameId: number | null = null
  private generation = 0
  private pendingWork: (() => void) | null = null
  private scheduled: "none" | "frame" | "microtask" = "none"
  private disposed = false

  constructor(clock: FrameSchedulerClock = createDefaultClock()) {
    this.clock = clock
  }

  scheduleFrame(work: () => void): void {
    if (this.disposed) {
      return
    }
    this.pendingWork = work
    if (this.scheduled !== "none") {
      return
    }

    const generation = ++this.generation
    this.scheduled = "frame"
    this.frameId = this.clock.requestFrame(() => {
      if (generation !== this.generation || this.disposed) {
        return
      }
      this.frameId = null
      this.scheduled = "none"
      this.runPendingWork()
    })
  }

  scheduleMicrotask(work: () => void): void {
    if (this.disposed) {
      return
    }
    this.pendingWork = work
    if (this.scheduled === "microtask") {
      return
    }

    this.invalidateSchedule()
    const generation = ++this.generation
    this.scheduled = "microtask"
    this.clock.queueMicrotask(() => {
      if (generation !== this.generation || this.disposed) {
        return
      }
      this.scheduled = "none"
      this.runPendingWork()
    })
  }

  flushNow(work?: () => void): void {
    if (this.disposed) {
      return
    }
    if (work) {
      this.pendingWork = work
    }
    this.invalidateSchedule()
    this.runPendingWork()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.invalidateSchedule()
    this.pendingWork = null
  }

  private invalidateSchedule(): void {
    this.generation += 1
    if (this.frameId !== null) {
      this.clock.cancelFrame(this.frameId)
      this.frameId = null
    }
    this.scheduled = "none"
  }

  private runPendingWork(): void {
    const work = this.pendingWork
    this.pendingWork = null
    work?.()
  }
}
