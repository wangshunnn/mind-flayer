import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const { useShortcutConfig } = vi.hoisted(() => ({
  useShortcutConfig: vi.fn()
}))

vi.mock("@/hooks/use-shortcut-config", () => ({
  useShortcutConfig
}))

import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea
} from "@/components/ai-elements/prompt-input"
import i18n from "@/lib/i18n"
import type { ShortcutConfig } from "@/types/settings"
import { ShortcutAction } from "@/types/settings"

const shortcutConfig = {
  [ShortcutAction.SEND_MESSAGE]: {
    id: ShortcutAction.SEND_MESSAGE,
    key: "Enter",
    enabled: true,
    scope: "local"
  },
  [ShortcutAction.NEW_LINE]: {
    id: ShortcutAction.NEW_LINE,
    key: "CommandOrControl+Enter",
    enabled: true,
    scope: "local"
  }
} as Partial<Record<ShortcutAction, ShortcutConfig>> as Record<ShortcutAction, ShortcutConfig>

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function dispatchCompositionEvent(
  target: HTMLTextAreaElement,
  type: "compositionstart" | "compositionend"
) {
  target.dispatchEvent(new CompositionEvent(type, { bubbles: true }))
}

function dispatchEnterKey(
  target: HTMLTextAreaElement,
  options?: {
    isComposing?: boolean
    keyCode?: number
    which?: number
  }
) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  })

  if (options?.isComposing !== undefined) {
    Object.defineProperty(event, "isComposing", {
      configurable: true,
      value: options.isComposing
    })
  }

  if (options?.keyCode !== undefined) {
    Object.defineProperty(event, "keyCode", {
      configurable: true,
      value: options.keyCode
    })
  }

  if (options?.which !== undefined) {
    Object.defineProperty(event, "which", {
      configurable: true,
      value: options.which
    })
  }

  target.dispatchEvent(event)
}

describe("PromptInputTextarea IME Enter handling", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let previousResizeObserver: typeof ResizeObserver | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    previousResizeObserver = globalThis.ResizeObserver
    vi.stubGlobal("ResizeObserver", ResizeObserverMock)
  })

  beforeEach(() => {
    vi.mocked(useShortcutConfig).mockReturnValue(shortcutConfig)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment

    if (previousResizeObserver) {
      vi.stubGlobal("ResizeObserver", previousResizeObserver)
    } else {
      vi.unstubAllGlobals()
    }
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    vi.restoreAllMocks()
    container.remove()
  })

  async function renderPromptInput() {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <PromptInput onSubmit={vi.fn()}>
            <PromptInputBody>
              <PromptInputTextarea />
            </PromptInputBody>
            <button type="submit">Send</button>
          </PromptInput>
        </I18nextProvider>
      )
    })

    const textarea = container.querySelector("textarea")
    expect(textarea).not.toBeNull()

    return textarea as HTMLTextAreaElement
  }

  it("does not submit when Enter confirms an active IME composition", async () => {
    const requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {})
    const textarea = await renderPromptInput()

    await act(async () => {
      dispatchCompositionEvent(textarea, "compositionstart")
      dispatchEnterKey(textarea, { isComposing: true })
    })

    expect(requestSubmitSpy).not.toHaveBeenCalled()
  })

  it("does not submit when Enter arrives immediately after compositionend", async () => {
    const requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {})
    const textarea = await renderPromptInput()

    await act(async () => {
      dispatchCompositionEvent(textarea, "compositionstart")
      dispatchCompositionEvent(textarea, "compositionend")
      dispatchEnterKey(textarea)
    })

    expect(requestSubmitSpy).not.toHaveBeenCalled()

    await act(
      async () =>
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve())
        })
    )

    await act(async () => {
      dispatchEnterKey(textarea)
    })

    expect(requestSubmitSpy).toHaveBeenCalledTimes(1)
  })

  it("does not submit when the browser reports IME processing keycode 229", async () => {
    const requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {})
    const textarea = await renderPromptInput()

    await act(async () => {
      dispatchEnterKey(textarea, { keyCode: 229, which: 229 })
    })

    expect(requestSubmitSpy).not.toHaveBeenCalled()
  })

  it("rejects file selection when attachments are disabled", async () => {
    const onError = vi.fn()
    await act(async () => {
      root.render(
        <PromptInput attachmentsDisabled onError={onError} onSubmit={vi.fn()}>
          <button type="submit">Send</button>
        </PromptInput>
      )
    })
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input?.disabled).toBe(true)
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["image"], "mockup.png", { type: "image/png" })]
    })

    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })))

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "attachments_disabled" }))
  })

  it("accepts images and PDFs while rejecting other media types", async () => {
    const onError = vi.fn()
    await act(async () => {
      root.render(
        <PromptInput accept="image/*,application/pdf" multiple onError={onError} onSubmit={vi.fn()}>
          <button type="submit">Send</button>
        </PromptInput>
      )
    })
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["video"], "demo.mp4", { type: "video/mp4" })]
    })

    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })))

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "accept" }))
  })
})
