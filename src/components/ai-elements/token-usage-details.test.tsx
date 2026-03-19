import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { TokenUsageDetails } from "@/components/ai-elements/token-usage-details"
import i18n from "@/lib/i18n"

const createUsage = () => ({
  inputTokens: 100,
  outputTokens: 60,
  totalTokens: 160,
  inputTokenDetails: {
    noCacheTokens: undefined,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined
  },
  outputTokenDetails: {
    textTokens: undefined,
    reasoningTokens: undefined
  }
})

async function wait(ms: number) {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

async function hover(element: Element, delayMs = 0) {
  await act(async () => {
    element.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }))
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }))
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    if (element instanceof HTMLElement) {
      element.focus()
    }
    await wait(delayMs > 0 ? delayMs : 10)
  })
}

describe("TokenUsageDetails", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let previousPointerEvent: typeof PointerEvent | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    previousPointerEvent = globalThis.PointerEvent
    if (typeof globalThis.PointerEvent === "undefined") {
      ;(globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent =
        MouseEvent as typeof PointerEvent
    }
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
    ;(globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent = previousPointerEvent
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ""
  })

  it("shows TTFT, TTLT, TPS, and their descriptions inside the hover card", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <TokenUsageDetails
            usage={createUsage()}
            createdAt={1_000}
            firstTokenAt={1_400}
            lastTokenAt={3_400}
            modelProvider="openai"
            modelProviderLabel="OpenAI"
            modelId="gpt-5"
            modelLabel="GPT-5"
          />
        </I18nextProvider>
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="View token, cost, and speed details"]'
    )
    expect(trigger?.getAttribute("aria-label")).toContain("TTFT 400ms")
    expect(trigger?.getAttribute("aria-label")).toContain("TTLT 2.40s")
    expect(trigger?.getAttribute("aria-label")).toContain("TPS 30.00")

    expect(trigger).not.toBeNull()
    await hover(trigger as HTMLButtonElement, 100)

    const summary = document.body.querySelector<HTMLElement>(
      '[data-testid="token-performance-summary"]'
    )
    expect(summary?.textContent).toContain("Token Performance")
    expect(summary?.textContent).toContain("TTFT")
    expect(summary?.textContent).toContain("400ms")
    expect(summary?.textContent).toContain("TTLT")
    expect(summary?.textContent).toContain("2.40s")
    expect(summary?.textContent).toContain("TPS")
    expect(summary?.textContent).toContain("30.00")

    const ttftInfoTrigger = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="token-performance-info-ttft"]'
    )
    const ttltInfoTrigger = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="token-performance-info-ttlt"]'
    )
    const tpsInfoTrigger = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="token-performance-info-tps"]'
    )
    expect(ttftInfoTrigger).not.toBeNull()
    expect(ttltInfoTrigger).not.toBeNull()
    expect(tpsInfoTrigger).not.toBeNull()

    expect(ttftInfoTrigger?.getAttribute("aria-label")).toContain("TTFT")
    expect(ttltInfoTrigger?.getAttribute("aria-label")).toContain("TTLT")
    expect(tpsInfoTrigger?.getAttribute("aria-label")).toContain("TPS")
  })

  it("shows N/A when timing data is missing or TPS cannot be computed", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <TokenUsageDetails
            usage={createUsage()}
            createdAt={1_000}
            firstTokenAt={1_500}
            lastTokenAt={1_500}
          />
        </I18nextProvider>
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="View token, cost, and speed details"]'
    )
    expect(trigger?.getAttribute("aria-label")).toContain("TTFT 500ms")
    expect(trigger?.getAttribute("aria-label")).toContain("TTLT 500ms")
    expect(trigger?.getAttribute("aria-label")).toContain("TPS N/A")

    expect(trigger).not.toBeNull()
    await hover(trigger as HTMLButtonElement, 100)

    const summary = document.body.querySelector<HTMLElement>(
      '[data-testid="token-performance-summary"]'
    )
    expect(summary?.textContent).toContain("Token Performance")
    expect(summary?.textContent).toContain("TTFT")
    expect(summary?.textContent).toContain("500ms")
    expect(summary?.textContent).toContain("TTLT")
    expect(summary?.textContent).toContain("TPS")
    expect(summary?.textContent).toContain("N/A")
  })
})
