import type { LanguageModelUsage, UIMessage } from "ai"
import { describe, expect, it } from "vitest"
import {
  computeContextWindowUsage,
  formatContextWindowLimit,
  formatContextWindowPercent,
  formatContextWindowTokens,
  getContextUsageForModel,
  getUsageLevel,
  resolveConversationContextUsage,
  resolveUsedTokens
} from "@/lib/context-window-usage"

function createUsage(overrides?: Partial<LanguageModelUsage>): LanguageModelUsage {
  return {
    inputTokens: 0,
    inputTokenDetails: {
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    },
    outputTokens: 0,
    outputTokenDetails: {
      textTokens: 0,
      reasoningTokens: 0
    },
    totalTokens: 0,
    ...overrides
  }
}

describe("getUsageLevel", () => {
  it("maps threshold boundaries correctly", () => {
    expect(getUsageLevel(49.99)).toBe("green")
    expect(getUsageLevel(50)).toBe("yellow")
    expect(getUsageLevel(79.99)).toBe("yellow")
    expect(getUsageLevel(80)).toBe("red")
  })
})

describe("resolveConversationContextUsage", () => {
  it("ignores legacy cumulative usage and prefers independent state over message statistics", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "History" }],
        metadata: { totalUsage: createUsage({ inputTokens: 900000 }) }
      }
    ]
    expect(resolveConversationContextUsage(messages)).toBeUndefined()
    const usage = {
      tokens: 1000,
      contextWindow: 128000,
      source: "estimated" as const,
      prefixHash: "source",
      entryCount: 1,
      requestFingerprint: "request"
    }
    messages[0].metadata = { totalUsage: createUsage({ inputTokens: 900000 }), contextUsage: usage }
    expect(resolveConversationContextUsage(messages)?.tokens).toBe(1000)
    expect(
      resolveConversationContextUsage(messages, {
        version: 1,
        events: [],
        usage: { ...usage, tokens: 500 }
      })?.tokens
    ).toBe(500)
  })
})

const contextUsage = (tokens: number) => ({
  tokens,
  baselineTokens: tokens,
  source: "measured" as const
})

describe("resolveUsedTokens", () => {
  it("uses context tokens without substituting cumulative billing data", () => {
    expect(resolveUsedTokens(contextUsage(120))).toBe(120)
    expect(resolveUsedTokens({ ...contextUsage(0), tokens: Number.NaN })).toBeUndefined()
  })

  it("hides post-compaction estimates until a new baseline is available", () => {
    expect(
      resolveUsedTokens({ tokens: 300, source: "estimated", compactionId: "c1" })
    ).toBeUndefined()
    expect(resolveUsedTokens({ ...contextUsage(300), compactionId: "c1" })).toBe(300)
  })

  it("distinguishes estimated and measured percentages", () => {
    expect(formatContextWindowPercent(32.15, "estimated")).toBe("~32.2")
    expect(formatContextWindowPercent(32.15, "measured")).toBe("32.2")
  })

  it("invalidates snapshots after switching models", () => {
    const usage = {
      ...contextUsage(100),
      modelProvider: "openai",
      modelId: "old",
      contextWindow: 1000,
      prefixHash: "p",
      requestFingerprint: "r",
      entryCount: 1
    }
    expect(getContextUsageForModel(usage, "openai", "old")).toBe(usage)
    expect(getContextUsageForModel(usage, "openai", "new")).toBeUndefined()
  })
})

describe("computeContextWindowUsage", () => {
  it("assigns levels at threshold boundaries", () => {
    const contextWindow = 10000
    const green = computeContextWindowUsage(contextUsage(4999), contextWindow)
    const yellowStart = computeContextWindowUsage(contextUsage(5000), contextWindow)
    const yellowEnd = computeContextWindowUsage(contextUsage(7999), contextWindow)
    const red = computeContextWindowUsage(contextUsage(8000), contextWindow)

    expect(green?.level).toBe("green")
    expect(yellowStart?.level).toBe("yellow")
    expect(yellowEnd?.level).toBe("yellow")
    expect(red?.level).toBe("red")
  })

  it("returns null when context window is invalid", () => {
    const usage = contextUsage(10)

    expect(computeContextWindowUsage(usage, null)).toBeNull()
    expect(computeContextWindowUsage(usage, undefined)).toBeNull()
    expect(computeContextWindowUsage(usage, 0)).toBeNull()
    expect(computeContextWindowUsage(usage, -1)).toBeNull()
    expect(computeContextWindowUsage(usage, Number.NaN)).toBeNull()
  })

  it("preserves overflow percentages for text while the UI clamps graphics", () => {
    const usage = contextUsage(250)
    const result = computeContextWindowUsage(usage, 100)

    expect(result).toMatchObject({
      usedTokens: 250,
      limitTokens: 100,
      percent: 250,
      level: "red"
    })
  })
})

describe("formatContextWindowTokens", () => {
  it("formats values using full english digit grouping", () => {
    expect(formatContextWindowTokens(999)).toBe("999")
    expect(formatContextWindowTokens(88600)).toBe("88,600")
    expect(formatContextWindowTokens(500000)).toBe("500,000")
    expect(formatContextWindowTokens(1000000)).toBe("1,000,000")
    expect(formatContextWindowTokens(1050000)).toBe("1,050,000")
    expect(formatContextWindowTokens(2500000)).toBe("2,500,000")
  })
})

describe("formatContextWindowLimit", () => {
  it.each([
    [999, "999"],
    [1000, "1.0k"],
    [128000, "128.0k"],
    [1000000, "1.0M"],
    [2500000, "2.5M"]
  ])("formats a capacity of %s with compact units", (tokens, expected) => {
    expect(formatContextWindowLimit(tokens)).toBe(expected)
  })
})
