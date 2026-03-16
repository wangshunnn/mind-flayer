import type { LanguageModelUsage } from "ai"

export type UsageLevel = "green" | "yellow" | "red"

export interface ContextWindowUsageViewModel {
  usedTokens: number
  limitTokens: number
  percent: number
  level: UsageLevel
}

const englishIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
})

const englishKiloFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
})

const englishMegaFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
})

const normalizeTokenCount = (value: number | undefined): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined
  }
  return Math.max(0, value)
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

export function resolveUsedTokens(usage: LanguageModelUsage): number {
  const directInputTokens = normalizeTokenCount(usage.inputTokens)
  if (directInputTokens !== undefined) {
    return directInputTokens
  }

  const details = usage.inputTokenDetails
  const noCacheTokens = normalizeTokenCount(details?.noCacheTokens) ?? 0
  const cacheReadTokens = normalizeTokenCount(details?.cacheReadTokens) ?? 0
  const cacheWriteTokens = normalizeTokenCount(details?.cacheWriteTokens) ?? 0

  return noCacheTokens + cacheReadTokens + cacheWriteTokens
}

export function getUsageLevel(percent: number): UsageLevel {
  if (percent < 50) {
    return "green"
  }
  if (percent < 80) {
    return "yellow"
  }
  return "red"
}

export function computeContextWindowUsage(
  usage: LanguageModelUsage,
  contextWindow: number | null | undefined
): ContextWindowUsageViewModel | null {
  if (
    contextWindow === null ||
    contextWindow === undefined ||
    Number.isNaN(contextWindow) ||
    !Number.isFinite(contextWindow) ||
    contextWindow <= 0
  ) {
    return null
  }

  const usedTokens = resolveUsedTokens(usage)
  const percent = clampPercent((usedTokens / contextWindow) * 100)

  return {
    usedTokens,
    limitTokens: contextWindow,
    percent,
    level: getUsageLevel(percent)
  }
}

export function formatCompactTokens(value: number): string {
  const safeValue = Math.max(0, Math.round(value))

  if (safeValue < 1000) {
    return englishIntegerFormatter.format(safeValue)
  }

  if (safeValue >= 1_000_000) {
    const valueInMega = Math.round((safeValue / 1_000_000) * 100) / 100
    return `${englishMegaFormatter.format(valueInMega)}M`
  }

  const valueInKilo = Math.round((safeValue / 1000) * 10) / 10
  return `${englishKiloFormatter.format(valueInKilo)}K`
}
