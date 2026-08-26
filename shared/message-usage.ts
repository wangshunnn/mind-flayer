import type { LanguageModelUsage } from "ai"

export interface MessageUsageTokenBreakdown {
  input: number
  output: number
  noCacheInput: number
  cachedReadInput: number
  cachedWriteInput: number
  textOutput: number
  reasoningOutput: number
  total: number
}

export function normalizeTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function getMessageUsageTokenBreakdown(
  usage: LanguageModelUsage
): MessageUsageTokenBreakdown {
  const inputTotal = normalizeTokenCount(usage.inputTokens)
  const cachedReadInput = normalizeTokenCount(usage.inputTokenDetails?.cacheReadTokens) ?? 0
  const cachedWriteInput = normalizeTokenCount(usage.inputTokenDetails?.cacheWriteTokens) ?? 0
  // Aggregated details can be partial when individual steps omit a field.
  const noCacheInput =
    inputTotal !== undefined
      ? Math.max(0, inputTotal - cachedReadInput - cachedWriteInput)
      : (normalizeTokenCount(usage.inputTokenDetails?.noCacheTokens) ?? 0)
  const input = inputTotal ?? noCacheInput + cachedReadInput + cachedWriteInput
  const textOutput = normalizeTokenCount(usage.outputTokenDetails?.textTokens) ?? 0
  const reasoningOutput = normalizeTokenCount(usage.outputTokenDetails?.reasoningTokens) ?? 0
  const output = normalizeTokenCount(usage.outputTokens) ?? textOutput + reasoningOutput
  const total = normalizeTokenCount(usage.totalTokens) || input + output
  return {
    input,
    output,
    noCacheInput,
    cachedReadInput,
    cachedWriteInput,
    textOutput,
    reasoningOutput,
    total
  }
}
