import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ContextWindowUsageDetails,
  ContextWindowUsageIndicator
} from "@/components/ai-elements/context-window-usage-indicator"
import type { ContextTokenUsage } from "@/lib/context-window-usage"
import i18n from "@/lib/i18n"
import type { ContextState } from "../../../shared/context"

function createUsage(overrides?: Partial<ContextTokenUsage>): ContextTokenUsage {
  return { tokens: 32_000, baselineTokens: 32_000, source: "measured", ...overrides }
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

  it("marks estimates and clamps only the progress graphic", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails
            usage={createUsage({ tokens: 150, source: "estimated" })}
            contextWindow={100}
          />
        </I18nextProvider>
      )
    })
    expect(
      container.querySelector('[data-testid="context-window-usage-percent"]')?.textContent
    ).toBe("~150%")
    expect(container.textContent).toContain("~150 / 100")
    expect(
      container.querySelector<HTMLElement>('[data-testid="context-window-usage-progress-fill"]')
        ?.style.width
    ).toBe("100%")
  })

  it("keeps used tokens precise while abbreviating the model capacity", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails
            usage={createUsage({ tokens: 6897 })}
            contextWindow={1000000}
          />
        </I18nextProvider>
      )
    })
    expect(container.textContent).toContain("6,897 / 1.0M tokens")
    expect(container.textContent).not.toContain("1,000,000")
  })

  it("shows unknown after compaction rather than a stale percentage", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails
            usage={createUsage({
              tokens: 100,
              baselineTokens: undefined,
              source: "estimated",
              compactionId: "c1",
              breakdown: { systemTokens: 20, toolsTokens: 30, messageTokens: 50 }
            })}
            contextWindow={1000}
          />
        </I18nextProvider>
      )
    })
    expect(container.textContent).toContain("unknown")
    expect(container.querySelector('[data-testid="context-window-usage-percent"]')).toBeNull()
    expect(container.querySelectorAll("dd")).toHaveLength(3)
    expect(Array.from(container.querySelectorAll("dd"), node => node.textContent)).toEqual([
      "~20",
      "~30",
      "~50"
    ])
  })

  it("marks every component as estimated and proportions colors without changing the measured total", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails
            usage={createUsage({
              breakdown: { systemTokens: 1000, toolsTokens: 1000, messageTokens: 2000 }
            })}
            contextWindow={128000}
          />
        </I18nextProvider>
      )
    })
    expect(
      container.querySelector('[data-testid="context-window-usage-percent"]')?.textContent
    ).toBe("25%")
    expect(container.textContent).toContain("32,000 / 128.0k tokens")
    expect(Array.from(container.querySelectorAll("dt"), node => node.textContent)).toEqual([
      "System prompt",
      "Tools",
      "Messages"
    ])
    expect(Array.from(container.querySelectorAll("dd"), node => node.textContent)).toEqual([
      "~1.0k",
      "~1.0k",
      "~2.0k"
    ])
    const fill = container.querySelector<HTMLElement>(
      '[data-testid="context-window-usage-progress-fill"]'
    )
    expect(fill?.style.width).toBe("25%")
    expect(Array.from(fill?.children ?? [], child => (child as HTMLElement).style.width)).toEqual([
      "25%",
      "25%",
      "50%"
    ])
    expect(container.textContent).not.toContain(
      "Component estimates may not add up to total usage."
    )
  })

  it("shows localized composition when the model capacity is unknown", async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails
            usage={createUsage({
              contextWindow: null,
              source: "estimated",
              breakdown: { systemTokens: 100, toolsTokens: 0, messageTokens: 200 }
            })}
          />
        </I18nextProvider>
      )
    })
    expect(Array.from(container.querySelectorAll("dt"), node => node.textContent)).toEqual([
      "系统提示词",
      "工具",
      "对话消息"
    ])
    expect(container.textContent).toContain("~32,000")
    expect(container.textContent).toContain("~0")
    expect(container.querySelector('[data-testid="context-window-usage-percent"]')).toBeNull()
    expect(container.querySelector('[data-testid="context-window-usage-progress"]')).toBeNull()
  })

  it.each([
    { tokens: 150, systemTokens: 20, messageTokens: 30, width: "100%", segments: 2 },
    { tokens: 0, systemTokens: 20, messageTokens: 30, width: "0%", segments: 0 },
    { tokens: 50, systemTokens: 0, messageTokens: 0, width: "50%", segments: 0 }
  ])("handles zero categories and clamped occupancy for $tokens tokens", async ({
    tokens,
    systemTokens,
    messageTokens,
    width,
    segments
  }) => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails
            usage={createUsage({
              tokens,
              breakdown: { systemTokens, toolsTokens: 0, messageTokens }
            })}
            contextWindow={100}
          />
        </I18nextProvider>
      )
    })
    const fill = container.querySelector<HTMLElement>(
      '[data-testid="context-window-usage-progress-fill"]'
    )
    expect(fill?.style.width).toBe(width)
    expect(fill?.children).toHaveLength(segments)
    expect(
      container.querySelector('[data-testid="context-window-usage-segment-toolsTokens"]')
    ).toBeNull()
    expect(container.textContent).not.toContain("NaN")
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
    expect(trigger?.getAttribute("aria-label")).toContain("32,000 / 128.0k tokens · 25%")
  })

  it.each([
    "measured",
    "estimated"
  ] as const)("keeps %s hover details concise and manual compaction available", async source => {
    const onCompact = vi.fn()
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageIndicator
            usage={createUsage({
              source,
              breakdown: { systemTokens: 1000, toolsTokens: 1000, messageTokens: 30000 }
            })}
            contextWindow={128000}
            onCompact={onCompact}
          />
        </I18nextProvider>
      )
    })
    await act(async () => {
      container.querySelector("button")?.focus()
      await new Promise(resolve => setTimeout(resolve, 150))
    })

    const panel = document.body.querySelector('[data-slot="hover-card-content"]')
    expect(panel).not.toBeNull()
    expect(panel?.textContent).toContain(source === "estimated" ? "~25%" : "25%")
    expect(panel?.querySelectorAll("p")).toHaveLength(2)
    expect(panel?.textContent).not.toMatch(
      /marks estimates|compacted automatically|Reported usage|Estimated usage/
    )

    const compactButton = panel?.querySelector<HTMLButtonElement>("button")
    expect(compactButton?.textContent).toBe("Compact context")
    await act(async () => compactButton?.click())
    expect(onCompact).toHaveBeenCalledOnce()
  })

  it("shows the icon and separator together when only manual compaction is available", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageIndicator onCompact={vi.fn()} withSeparator />
        </I18nextProvider>
      )
    })
    expect(container.querySelector("button")?.getAttribute("aria-label")).toContain(
      "No usage statistics yet"
    )
    expect(container.querySelector('[data-testid="context-window-usage-separator"]')).not.toBeNull()
    expect(container.textContent).not.toContain("0%")
  })

  it("hides both the icon and separator when neither usage nor an action exists", async () => {
    await act(async () => {
      root.render(<ContextWindowUsageIndicator withSeparator />)
    })
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector('[data-testid="context-window-usage-separator"]')).toBeNull()
  })

  it("uses independent context statistics for both the icon and separator", async () => {
    const contextState: ContextState = {
      version: 1,
      events: [],
      usage: {
        tokens: 48000,
        contextWindow: 128000,
        source: "estimated",
        prefixHash: "source",
        entryCount: 2,
        requestFingerprint: "request"
      }
    }
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageIndicator
            contextState={contextState}
            contextWindow={128000}
            usage={contextState.usage}
            withSeparator
          />
        </I18nextProvider>
      )
    })
    expect(container.querySelector("button")?.getAttribute("aria-label")).toContain(
      "~48,000 / 128.0k"
    )
    expect(container.querySelector('[data-testid="context-window-usage-separator"]')).not.toBeNull()
  })

  it("shows an explicit empty state instead of blank details or zero usage", async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails contextWindow={128000} />
        </I18nextProvider>
      )
    })
    expect(container.querySelector('[data-testid="context-window-usage-empty"]')?.textContent).toBe(
      "暂无统计"
    )
    expect(container.querySelector('[data-testid="context-window-usage-percent"]')).toBeNull()
  })

  it("keeps a genuine zero-token measurement distinct from missing statistics", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ContextWindowUsageDetails
            contextWindow={128000}
            usage={{ tokens: 0, source: "measured" }}
          />
        </I18nextProvider>
      )
    })
    expect(container.querySelector('[data-testid="context-window-usage-empty"]')).toBeNull()
    expect(
      container.querySelector('[data-testid="context-window-usage-percent"]')?.textContent
    ).toBe("0%")
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
    expect(details?.textContent).toContain("32,000 / 128.0k tokens")
    expect(percent?.textContent).toBe("25%")
    expect(progress).not.toBeNull()
    expect(progressFill?.style.width).toBe("25%")
    expect(progressFill?.style.backgroundColor).toBe("var(--color-status-positive)")
    expect(container.textContent).not.toContain("Context is compacted automatically.")
    expect(container.querySelector('[data-testid="context-window-usage-breakdown"]')).toBeNull()
  })
})
