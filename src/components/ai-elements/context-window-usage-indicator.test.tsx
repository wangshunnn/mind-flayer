import type { LanguageModelUsage } from "ai"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  ContextWindowUsageDetails,
  ContextWindowUsageIndicator
} from "@/components/ai-elements/context-window-usage-indicator"
import i18n from "@/lib/i18n"

function createUsage(overrides?: Partial<LanguageModelUsage>): LanguageModelUsage {
  return {
    inputTokens: 32_000,
    inputTokenDetails: {
      noCacheTokens: 32_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    },
    outputTokens: 400,
    outputTokenDetails: {
      textTokens: 400,
      reasoningTokens: 0
    },
    totalTokens: 32_400,
    ...overrides
  }
}

describe("ContextWindowUsageIndicator", () => {
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

  it("renders the input-area trigger as an icon-only ghost button", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageIndicator contextWindow={128_000} usage={createUsage()} />
        </I18nextProvider>
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Context window usage:"]'
    )

    expect(trigger).not.toBeNull()
    expect(trigger?.dataset.variant).toBe("ghost")
    expect(trigger?.dataset.size).toBe("icon-xs")
    expect(trigger?.textContent).not.toContain("25%")
    expect(trigger?.getAttribute("aria-label")).toContain("32,000 / 128,000 tokens · 25%")
  })

  it("renders usage details with a percent row and matching progress bar color", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails contextWindow={128_000} usage={createUsage()} />
        </I18nextProvider>
      )
    })

    const details = container.querySelector<HTMLElement>(
      '[data-testid="context-window-usage-details"]'
    )
    const percent = container.querySelector<HTMLElement>(
      '[data-testid="context-window-usage-percent"]'
    )
    const progress = container.querySelector<HTMLElement>(
      '[data-testid="context-window-usage-progress"]'
    )
    const progressFill = container.querySelector<HTMLElement>(
      '[data-testid="context-window-usage-progress-fill"]'
    )
    const note = container.querySelector<HTMLElement>('[data-testid="context-window-usage-note"]')

    expect(details?.textContent).toContain("32,000 / 128,000 tokens")
    expect(percent?.textContent).toBe("25%")
    expect(progress).not.toBeNull()
    expect(progressFill?.style.width).toBe("25%")
    expect(progressFill?.style.backgroundColor).toBe("var(--color-status-positive)")
    expect(note?.textContent).toBe("Conversation context will be compressed automatically.")
  })
})
