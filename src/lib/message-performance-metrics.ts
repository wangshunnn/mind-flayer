import type { LanguageModelUsage } from "ai"
import { getMessageUsageTokenBreakdown } from "@/lib/message-usage-cost"

export interface MessagePerformanceTimings {
  createdAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
}

export interface MessagePerformanceMetrics {
  ttftMs: number | null
  ttltMs: number | null
  tps: number | null
}

const englishDurationFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const englishMillisecondFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
})

const englishTokensPerSecondFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const isValidTimestamp = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

const getElapsedMs = (start: number | undefined, end: number | undefined): number | null => {
  if (!isValidTimestamp(start) || !isValidTimestamp(end)) {
    return null
  }

  const elapsedMs = end - start
  return elapsedMs >= 0 ? elapsedMs : null
}

export function computeMessagePerformanceMetrics(
  usage: LanguageModelUsage,
  timings: MessagePerformanceTimings
): MessagePerformanceMetrics {
  const outputTokens = getMessageUsageTokenBreakdown(usage).output
  const ttftMs = getElapsedMs(timings.createdAt, timings.firstTokenAt)
  const ttltMs = getElapsedMs(timings.createdAt, timings.lastTokenAt)
  const generationWindowMs = getElapsedMs(timings.firstTokenAt, timings.lastTokenAt)
  const tps =
    outputTokens > 0 && generationWindowMs !== null && generationWindowMs > 0
      ? outputTokens / (generationWindowMs / 1000)
      : null

  return {
    ttftMs,
    ttltMs,
    tps
  }
}

export function formatMessageLatency(valueMs: number | null, unavailableLabel: string): string {
  if (valueMs === null) {
    return unavailableLabel
  }

  if (valueMs < 1000) {
    return `${englishMillisecondFormatter.format(valueMs)}ms`
  }

  return `${englishDurationFormatter.format(valueMs / 1000)}s`
}

export function formatMessageTokensPerSecond(
  value: number | null,
  unavailableLabel: string
): string {
  if (value === null) {
    return unavailableLabel
  }

  return englishTokensPerSecondFormatter.format(value)
}
