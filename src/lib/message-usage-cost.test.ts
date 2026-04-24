import type { LanguageModelUsage } from "ai"
import { describe, expect, it } from "vitest"
import { computeMessageUsageCost, getMessageUsageTokenBreakdown } from "@/lib/message-usage-cost"
import { findModelPricing, type ModelPricing } from "@/lib/provider-constants"

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

function createPricing(overrides?: Partial<ModelPricing>): ModelPricing {
  return {
    currency: "USD",
    input: 0.3,
    output: 1.2,
    cachedRead: 0.03,
    cachedWrite: 0.375,
    ...overrides
  }
}

describe("getMessageUsageTokenBreakdown", () => {
  it("resolves full usage breakdown with direct totals", () => {
    const usage = createUsage({
      inputTokens: 1200,
      inputTokenDetails: {
        noCacheTokens: 1000,
        cacheReadTokens: 100,
        cacheWriteTokens: 100
      },
      outputTokens: 500,
      outputTokenDetails: {
        textTokens: 300,
        reasoningTokens: 200
      },
      totalTokens: 1700
    })

    expect(getMessageUsageTokenBreakdown(usage)).toEqual({
      input: 1200,
      output: 500,
      noCacheInput: 1000,
      cachedReadInput: 100,
      cachedWriteInput: 100,
      textOutput: 300,
      reasoningOutput: 200,
      total: 1700
    })
  })

  it("infers no-cache input when detailed noCacheTokens is missing", () => {
    const usage = createUsage({
      inputTokens: 1000,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: 200,
        cacheWriteTokens: 300
      }
    })

    expect(getMessageUsageTokenBreakdown(usage)).toMatchObject({
      input: 1000,
      noCacheInput: 500,
      cachedReadInput: 200,
      cachedWriteInput: 300
    })
  })

  it("falls back to treating inputTokens as no-cache when input details are unavailable", () => {
    const usage = createUsage({
      inputTokens: 700,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined
      }
    })

    expect(getMessageUsageTokenBreakdown(usage)).toMatchObject({
      input: 700,
      noCacheInput: 700,
      cachedReadInput: 0,
      cachedWriteInput: 0
    })
  })
})

describe("computeMessageUsageCost", () => {
  it("computes full cost with complete pricing", () => {
    const usage = createUsage({
      inputTokens: 1200,
      inputTokenDetails: {
        noCacheTokens: 1000,
        cacheReadTokens: 100,
        cacheWriteTokens: 100
      },
      outputTokens: 500,
      outputTokenDetails: {
        textTokens: 300,
        reasoningTokens: 200
      },
      totalTokens: 1700
    })

    const result = computeMessageUsageCost(usage, createPricing())

    expect(result.costs.input).toBeCloseTo(0.0003, 10)
    expect(result.costs.cachedRead).toBeCloseTo(0.000003, 10)
    expect(result.costs.cachedWrite).toBeCloseTo(0.0000375, 10)
    expect(result.costs.output).toBeCloseTo(0.0006, 10)
    expect(result.costs.total).toBeCloseTo(0.0009405, 10)
    expect(result.isEstimated).toBe(false)
    expect(result.hasAnyPricing).toBe(true)
    expect(result.missingPricingFields).toEqual([])
  })

  it("returns partial estimated cost when pricing is incomplete", () => {
    const usage = createUsage({
      inputTokens: 1700,
      inputTokenDetails: {
        noCacheTokens: 1000,
        cacheReadTokens: 500,
        cacheWriteTokens: 200
      },
      outputTokens: 100
    })

    const result = computeMessageUsageCost(
      usage,
      createPricing({
        input: 0.5,
        cachedRead: 0.1,
        output: null,
        cachedWrite: null
      })
    )

    expect(result.costs.input).toBeCloseTo(0.0005, 10)
    expect(result.costs.cachedRead).toBeCloseTo(0.00005, 10)
    expect(result.costs.cachedWrite).toBeNull()
    expect(result.costs.output).toBeNull()
    expect(result.costs.total).toBeCloseTo(0.00055, 10)
    expect(result.isEstimated).toBe(true)
    expect(result.hasAnyPricing).toBe(true)
    expect(result.missingPricingFields).toEqual(["output", "cachedWrite"])
  })

  it("returns null total cost when no pricing is available", () => {
    const usage = createUsage({
      inputTokens: 500,
      outputTokens: 200,
      totalTokens: 700
    })

    const result = computeMessageUsageCost(usage)

    expect(result.costs).toEqual({
      input: null,
      cachedRead: null,
      cachedWrite: null,
      output: null,
      total: null
    })
    expect(result.isEstimated).toBe(false)
    expect(result.hasAnyPricing).toBe(false)
    expect(result.missingPricingFields).toEqual(["input", "output", "cachedRead", "cachedWrite"])
  })

  it("treats DeepSeek cache write tokens as cache miss input", () => {
    const usage = createUsage({
      inputTokens: 3_000_000,
      inputTokenDetails: {
        noCacheTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000
      },
      outputTokens: 1_000_000,
      totalTokens: 4_000_000
    })

    const result = computeMessageUsageCost(usage, findModelPricing("deepseek", "deepseek-v4-flash"))

    expect(result.costs.input).toBeCloseTo(0.14, 10)
    expect(result.costs.cachedRead).toBeCloseTo(0.028, 10)
    expect(result.costs.cachedWrite).toBeCloseTo(0.14, 10)
    expect(result.costs.output).toBeCloseTo(0.28, 10)
    expect(result.costs.total).toBeCloseTo(0.588, 10)
    expect(result.isEstimated).toBe(false)
  })
})
