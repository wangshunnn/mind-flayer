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

  it("uses the theme brand color for the assistant reply placeholder", async () => {
    const { clock } = createClock()
    const store = new ChatRenderStore(clock)
    store.publishMessagesNow([message("user", "question", "user")])
    store.publishStatus("submitted")

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChatTranscript
            store={store}
            getMessageNodeRef={() => undefined}
            onRegenerate={() => {}}
            onToolApprovalResponse={async () => {}}
          />
        </I18nextProvider>
      )
    })

    const indicator = container.querySelector<SVGElement>(
      '[data-slot="assistant-reply-loading-indicator"]'
    )

    expect(indicator).not.toBeNull()
    expect(indicator?.classList.contains("text-brand")).toBe(true)
    store.dispose()
  })

  it("renders only user file parts above the user text bubble", async () => {
    const { clock } = createClock()
    const store = new ChatRenderStore(clock)
    const userMessage: UIMessage = {
      id: "user-with-files",
      role: "user",
      parts: [
        {
          type: "file",
          mediaType: "image/png",
          filename: "photo.png",
          url: "data:image/png;base64,abc"
        },
        {
          type: "file",
          mediaType: "application/pdf",
          filename: "brief.pdf",
          url: "data:application/pdf;base64,abc"
        },
        { type: "text", text: "Review these files" }
      ]
    }
    store.publishMessagesNow([userMessage])
    store.publishStatus("ready")

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChatTranscript
            store={store}
            getMessageNodeRef={() => undefined}
            onRegenerate={() => {}}
            onToolApprovalResponse={async () => {}}
          />
        </I18nextProvider>
      )
    })

    const row = container.querySelector<HTMLElement>('[data-message-id="user-with-files"]')
    const attachments = row?.querySelector<HTMLElement>('[data-slot="message-attachments"]')
    const content = row?.querySelector<HTMLElement>('[data-slot="message-content"]')
    const image = attachments?.querySelector<HTMLElement>('[data-slot="message-attachment-image"]')

    expect(attachments).not.toBeNull()
    expect(content?.textContent).toBe("Review these files")
    const attachmentPosition = attachments?.compareDocumentPosition(content as Node) ?? 0
    expect(attachmentPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(image?.dataset.attachmentVariant).toBe("tile")
    expect(attachments?.textContent).toContain("brief.pdf")
    store.dispose()
  })

  it("does not create an empty text bubble or empty-text actions for attachment-only messages", async () => {
    const { clock } = createClock()
    const store = new ChatRenderStore(clock)
    const userMessage: UIMessage = {
      id: "attachment-only",
      role: "user",
      parts: [
        {
          type: "file",
          mediaType: "image/png",
          filename: "photo.png",
          url: "data:image/png;base64,abc"
        }
      ],
      metadata: { createdAt: Date.now() }
    }
    store.publishMessagesNow([userMessage])
    store.publishStatus("ready")

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChatTranscript
            store={store}
            getMessageNodeRef={() => undefined}
            onRegenerate={() => {}}
            onToolApprovalResponse={async () => {}}
          />
        </I18nextProvider>
      )
    })

    const row = container.querySelector<HTMLElement>('[data-message-id="attachment-only"]')
    expect(row?.querySelector('[data-slot="message-content"]')).toBeNull()
    expect(row?.querySelector('[aria-label="Copy"]')).toBeNull()
    expect(
      row
        ?.querySelector('[data-slot="message-attachment-image"]')
        ?.getAttribute("data-attachment-variant")
    ).toBe("single")
    store.dispose()
  })

  it("leaves assistant file parts on the existing assistant rendering path", async () => {
    const { clock } = createClock()
    const store = new ChatRenderStore(clock)
    const assistantMessage: UIMessage = {
      id: "assistant-with-file",
      role: "assistant",
      parts: [
        { type: "text", text: "Generated file" },
        {
          type: "file",
          mediaType: "application/pdf",
          filename: "result.pdf",
          url: "https://example.com/result.pdf"
        }
      ]
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    store.publishMessagesNow([assistantMessage])
    store.publishStatus("ready")

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChatTranscript
            store={store}
            getMessageNodeRef={() => undefined}
            onRegenerate={() => {}}
            onToolApprovalResponse={async () => {}}
          />
        </I18nextProvider>
      )
    })

    const row = container.querySelector<HTMLElement>('[data-message-id="assistant-with-file"]')
    expect(row?.querySelector('[data-slot="message-attachments"]')).toBeNull()
    expect(row?.textContent).toContain("Generated file")
    expect(row?.textContent).toContain("result.pdf")
    warn.mockRestore()
    store.dispose()
  })
})
