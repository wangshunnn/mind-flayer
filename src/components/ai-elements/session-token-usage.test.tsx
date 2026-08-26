import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { ContextTokenUsage } from "@/lib/context-window-usage"
import i18n from "@/lib/i18n"
import type { SessionUsageSummary } from "@/lib/session-usage"
import { SessionTokenUsage } from "./session-token-usage"

const usage: SessionUsageSummary = {
  turns: 1,
  steps: 2,
  input: 6400,
  output: 474,
  cacheRead: 23000,
  cacheHitPercent: 97.4,
  hasUsage: true,
  cacheDetailsIncomplete: true
}

describe("SessionTokenUsage", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })
  beforeEach(async () => {
    await i18n.changeLanguage("en")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    document.body.innerHTML = ""
  })
  const render = async (
    value = usage,
    contextUsage: ContextTokenUsage | undefined = {
      tokens: 6897,
      source: "measured",
      baselineTokens: 6897
    },
    contextWindow: number | null = 1000000
  ) => {
    await act(async () =>
      root.render(
        <I18nextProvider i18n={i18n}>
          <SessionTokenUsage
            usage={value}
            contextUsage={contextUsage}
            contextWindow={contextWindow}
          />
        </I18nextProvider>
      )
    )
  }
  it("renders turns, steps, token metrics, and current context with complete accessible values", async () => {
    await render()
    expect(container.textContent).toBe("1 turn · 2 steps↑ 6.4k·↓ 474R 23kCH 97.4%0.7%/1.0M")
    expect(container.querySelector("button")?.getAttribute("aria-label")).toContain("23,000")
    expect(container.querySelectorAll('[data-slot="separator"]')).toHaveLength(4)
    expect(container.querySelector(".truncate")).not.toBeNull()
  })
  it("shows only the title and statistics on keyboard focus", async () => {
    await render()
    await act(async () => {
      container.querySelector("button")?.focus()
      await new Promise(resolve => setTimeout(resolve, 30))
    })
    const tooltip = document.body.querySelector('[role="tooltip"]')
    expect(tooltip?.textContent).toContain("6,400")
    expect(tooltip?.textContent).toContain("6,897 / 1.0M")
    expect(tooltip?.textContent).toContain("Completed model steps")
    expect(tooltip?.querySelectorAll("p")).toHaveLength(1)
    expect(tooltip?.lastElementChild?.tagName).toBe("DL")
  })
  it("localizes labels and distinguishes missing values from genuine zero", async () => {
    await i18n.changeLanguage("zh-CN")
    await render({ ...usage, cacheRead: null, cacheHitPercent: null })
    expect(container.textContent).toContain("R —CH —")
    expect(container.querySelector("button")?.getAttribute("aria-label")).toContain("会话")
    await render({ ...usage, cacheRead: 0, cacheHitPercent: 0 })
    expect(container.textContent).toContain("R 0CH 0.0%")
  })
  it("marks estimated context and preserves decimal precision and unknown states", async () => {
    await render({ ...usage, turns: 2, steps: 1 }, { tokens: 30000, source: "estimated" })
    expect(container.textContent).toContain("2 turns · 1 step")
    expect(container.textContent).toContain("~3.0%/1.0M")
    await render(usage, { tokens: 1000, source: "estimated", compactionId: "c1" })
    expect(container.textContent).toContain("?/1.0M")
    await render(usage, undefined, null)
    expect(container.textContent).toContain("?/—")
  })

  it("hides new conversations without recorded usage", async () => {
    await render({ ...usage, hasUsage: false })
    expect(container.childElementCount).toBe(0)
  })
})
