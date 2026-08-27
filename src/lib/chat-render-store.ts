import type { ChatStatus, UIMessage } from "ai"
import { FrameScheduler, type FrameSchedulerClock } from "@/lib/frame-scheduler"

export interface ObservableValue<T> {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
}

class ValueChannel<T> implements ObservableValue<T> {
  private readonly listeners = new Set<() => void>()

  constructor(private value: T) {}

  getSnapshot = (): T => this.value

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  set(nextValue: T): void {
    if (Object.is(this.value, nextValue)) {
      return
    }
    this.value = nextValue
    this.notify()
  }

  notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

function sameOrder(previous: readonly string[], next: readonly string[]): boolean {
  return (
    previous.length === next.length &&
    previous.every((messageId, index) => next[index] === messageId)
  )
}

/**
 * Frame-published visual projection of an AI SDK chat.
 *
 * The SDK remains the source of truth. This store retains its latest message
 * references, publishes streamed changes at most once per frame, and exposes
 * one observable channel per message so settled siblings do not re-render.
 */
export class ChatRenderStore {
  private readonly scheduler: FrameScheduler
  private readonly orderChannel = new ValueChannel<readonly string[]>([])
  private readonly statusChannel = new ValueChannel<ChatStatus>("ready")
  private readonly errorChannel = new ValueChannel<Error | undefined>(undefined)
  private readonly messageChannels = new Map<string, ValueChannel<UIMessage | undefined>>()
  private readonly publishedMessages = new Map<string, UIMessage>()
  private latestMessages: readonly UIMessage[] = []
  private publishedOrder: readonly string[] = []
  private visible = true
  private messagesDirty = false
  private disposed = false

  constructor(clock?: FrameSchedulerClock) {
    this.scheduler = new FrameScheduler(clock)
  }

  order(): ObservableValue<readonly string[]> {
    return this.orderChannel
  }

  status(): ObservableValue<ChatStatus> {
    return this.statusChannel
  }

  error(): ObservableValue<Error | undefined> {
    return this.errorChannel
  }

  message(messageId: string): ObservableValue<UIMessage | undefined> {
    let channel = this.messageChannels.get(messageId)
    if (!channel) {
      channel = new ValueChannel(this.publishedMessages.get(messageId))
      this.messageChannels.set(messageId, channel)
    }
    return channel
  }

  enqueueMessages(messages: readonly UIMessage[]): void {
    if (this.disposed) {
      return
    }
    this.latestMessages = messages
    this.messagesDirty = true
    if (!this.visible) {
      return
    }
    this.scheduler.scheduleFrame(() => this.publishMessages())
  }

  publishMessagesNow(messages: readonly UIMessage[] = this.latestMessages): void {
    if (this.disposed) {
      return
    }
    this.latestMessages = messages
    this.messagesDirty = true
    this.scheduler.flushNow(() => this.publishMessages())
  }

  publishStatus(status: ChatStatus): void {
    if (this.disposed) {
      return
    }
    if (status === "ready" || status === "error") {
      this.publishMessagesNow()
    }
    this.statusChannel.set(status)
  }

  publishError(error: Error | undefined): void {
    if (this.disposed) {
      return
    }
    this.errorChannel.set(error)
  }

  setVisible(visible: boolean): void {
    if (this.disposed || this.visible === visible) {
      return
    }
    this.visible = visible
    if (visible && this.messagesDirty) {
      this.publishMessagesNow()
    }
  }

  latest(): readonly UIMessage[] {
    return this.latestMessages
  }

  notifyMessage(messageId: string): void {
    if (this.disposed || !this.publishedMessages.has(messageId)) {
      return
    }
    this.messageChannels.get(messageId)?.notify()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.scheduler.dispose()
    this.orderChannel.clear()
    this.statusChannel.clear()
    this.errorChannel.clear()
    for (const channel of this.messageChannels.values()) {
      channel.clear()
    }
    this.messageChannels.clear()
    this.publishedMessages.clear()
  }

  private publishMessages(): void {
    if (!this.messagesDirty || this.disposed) {
      return
    }
    this.messagesDirty = false

    const nextOrder = this.latestMessages.map(message => message.id)
    const nextIds = new Set(nextOrder)

    for (const message of this.latestMessages) {
      if (this.publishedMessages.get(message.id) === message) {
        continue
      }
      this.publishedMessages.set(message.id, message)
      this.messageChannels.get(message.id)?.set(message)
    }

    for (const messageId of this.publishedOrder) {
      if (nextIds.has(messageId)) {
        continue
      }
      this.publishedMessages.delete(messageId)
      this.messageChannels.get(messageId)?.set(undefined)
    }

    if (!sameOrder(this.publishedOrder, nextOrder)) {
      this.publishedOrder = Object.freeze(nextOrder)
      this.orderChannel.set(this.publishedOrder)
    }
  }
}
