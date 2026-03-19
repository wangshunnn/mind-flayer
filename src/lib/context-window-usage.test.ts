import type { LanguageModelUsage } from "ai"
import { describe, expect, it } from "vitest"
import {
  computeContextWindowUsage,
  formatContextWindowTokens,
  getUsageLevel,
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

describe("resolveUsedTokens", () => {
  it("prefers inputTokens over detailed fallback", () => {
    const usage = createUsage({
      inputTokens: 120,
      inputTokenDetails: {
        noCacheTokens: 10,
        cacheReadTokens: 20,
        cacheWriteTokens: 30
      }
    })

    expect(resolveUsedTokens(usage)).toBe(120)
  })

  it("falls back to input token details when inputTokens is unavailable", () => {
    const usage = createUsage({
      inputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: 10,
        cacheReadTokens: 20,
        cacheWriteTokens: 30
      }
    })

    expect(resolveUsedTokens(usage)).toBe(60)
  })
})

describe("computeContextWindowUsage", () => {
  it("assigns levels at threshold boundaries", () => {
    const contextWindow = 10000
    const green = computeContextWindowUsage(createUsage({ inputTokens: 4999 }), contextWindow)
    const yellowStart = computeContextWindowUsage(createUsage({ inputTokens: 5000 }), contextWindow)
    const yellowEnd = computeContextWindowUsage(createUsage({ inputTokens: 7999 }), contextWindow)
    const red = computeContextWindowUsage(createUsage({ inputTokens: 8000 }), contextWindow)

    expect(green?.level).toBe("green")
    expect(yellowStart?.level).toBe("yellow")
    expect(yellowEnd?.level).toBe("yellow")
    expect(red?.level).toBe("red")
  })

  it("returns null when context window is invalid", () => {
    const usage = createUsage({ inputTokens: 10 })

    expect(computeContextWindowUsage(usage, null)).toBeNull()
    expect(computeContextWindowUsage(usage, undefined)).toBeNull()
    expect(computeContextWindowUsage(usage, 0)).toBeNull()
    expect(computeContextWindowUsage(usage, -1)).toBeNull()
    expect(computeContextWindowUsage(usage, Number.NaN)).toBeNull()
  })

  it("clamps percent to 100 when used tokens exceed context window", () => {
    const usage = createUsage({ inputTokens: 250 })
    const result = computeContextWindowUsage(usage, 100)

    expect(result).toMatchObject({
      usedTokens: 250,
      limitTokens: 100,
      percent: 100,
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
