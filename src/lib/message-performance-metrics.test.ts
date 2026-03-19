import { describe, expect, it } from "vitest"
import {
  computeMessagePerformanceMetrics,
  formatMessageLatency,
  formatMessageTokensPerSecond
} from "@/lib/message-performance-metrics"

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

describe("message-performance-metrics", () => {
  it("computes TTFT, TTLT, and TPS from token timings", () => {
    expect(
      computeMessagePerformanceMetrics(createUsage(), {
        createdAt: 1_000,
        firstTokenAt: 1_400,
        lastTokenAt: 3_400
      })
    ).toEqual({
      ttftMs: 400,
      ttltMs: 2_400,
      tps: 30
    })
  })

  it("returns null metrics when timings are missing or invalid for TPS", () => {
    expect(
      computeMessagePerformanceMetrics(createUsage(), {
        createdAt: 1_000
      })
    ).toEqual({
      ttftMs: null,
      ttltMs: null,
      tps: null
    })

    expect(
      computeMessagePerformanceMetrics(createUsage(), {
        createdAt: 1_000,
        firstTokenAt: 1_500,
        lastTokenAt: 1_500
      })
    ).toEqual({
      ttftMs: 500,
      ttltMs: 500,
      tps: null
    })
  })

  it("formats durations and tokens per second for display", () => {
    expect(formatMessageLatency(450, "N/A")).toBe("450ms")
    expect(formatMessageLatency(2_400, "N/A")).toBe("2.40s")
    expect(formatMessageLatency(null, "N/A")).toBe("N/A")
    expect(formatMessageTokensPerSecond(30, "N/A")).toBe("30.00")
    expect(formatMessageTokensPerSecond(null, "N/A")).toBe("N/A")
  })
})
