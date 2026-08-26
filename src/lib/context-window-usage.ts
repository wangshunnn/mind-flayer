import type { LanguageModelUsage, UIMessage } from "ai"
import type { ContextState, ContextUsage } from "../../shared/context"
import { contextUsageSchema } from "../../shared/context"

export type ContextTokenUsage = Pick<LanguageModelUsage, "inputTokens"> &
  Partial<Pick<LanguageModelUsage, "inputTokenDetails">>

export type UsageLevel = "green" | "yellow" | "red"

/** Cumulative billing usage from older messages is deliberately not a capacity fallback. */
export function resolveConversationContextUsage(
  messages: UIMessage[],
  state?: ContextState
): ContextUsage | undefined {
  if (state?.usage) {
    return state.usage
  }
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== "assistant") {
      continue
    }
    const metadata = message.metadata as { contextUsage?: unknown } | undefined
    const usage = contextUsageSchema.safeParse(metadata?.contextUsage)
    if (usage.success) {
      return usage.data
    }
  }
  return undefined
}

export interface ContextWindowUsageViewModel {
  usedTokens: number
  limitTokens: number
  percent: number
  level: UsageLevel
}

const englishIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
})

const normalizeTokenCount = (value: number | undefined): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined
  }
  return Math.max(0, value)
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

export function resolveUsedTokens(usage: ContextTokenUsage): number {
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
  usage: ContextTokenUsage,
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

export function formatContextWindowTokens(value: number): string {
  return englishIntegerFormatter.format(Math.max(0, Math.round(value)))
}
