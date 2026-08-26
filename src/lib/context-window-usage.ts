import type { UIMessage } from "ai"
import type { ContextState, ContextUsage } from "../../shared/context"
import { contextUsageSchema } from "../../shared/context"
import { normalizeTokenCount } from "../../shared/message-usage"

export type ContextTokenUsage = Pick<ContextUsage, "tokens" | "source"> &
  Partial<
    Pick<
      ContextUsage,
      | "baselineTokens"
      | "contextWindow"
      | "compactionId"
      | "modelProvider"
      | "modelId"
      | "breakdown"
    >
  >

export type UsageLevel = "green" | "yellow" | "red"

/** Cumulative billing usage is never a capacity fallback. */
export function resolveConversationContextUsage(
  messages: UIMessage[],
  state?: ContextState
): ContextUsage | undefined {
  if (state?.usage) {
    return state.usage
  }
  if (state?.events.some(event => event.type === "compaction")) {
    return undefined
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

const englishIntegerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

export function resolveUsedTokens(usage: ContextTokenUsage): number | undefined {
  if (usage.compactionId && !usage.baselineTokens) {
    return undefined
  }
  return normalizeTokenCount(usage.tokens)
}

export function getContextUsageForModel(
  usage: ContextUsage | undefined,
  modelProvider: string | undefined,
  modelId: string | undefined
): ContextUsage | undefined {
  if (!usage || usage.modelProvider !== modelProvider || usage.modelId !== modelId) {
    return undefined
  }
  return usage
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
  contextWindow: number | null | undefined = usage.contextWindow
): ContextWindowUsageViewModel | null {
  const usedTokens = resolveUsedTokens(usage)
  if (
    usedTokens === undefined ||
    typeof contextWindow !== "number" ||
    !Number.isFinite(contextWindow) ||
    contextWindow <= 0
  ) {
    return null
  }
  const percent = (usedTokens / contextWindow) * 100
  return { usedTokens, limitTokens: contextWindow, percent, level: getUsageLevel(percent) }
}

export function formatContextWindowPercent(
  percent: number,
  source: ContextUsage["source"]
): string {
  return `${source === "estimated" ? "~" : ""}${percentFormatter.format(percent)}`
}

export function formatContextWindowTokens(value: number): string {
  return englishIntegerFormatter.format(Math.max(0, Math.round(value)))
}

export function formatContextWindowLimit(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }
  return formatContextWindowTokens(value)
}
