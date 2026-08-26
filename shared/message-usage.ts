import type { LanguageModelUsage, UIMessage } from "ai"

export interface MessageUsageMetadata {
  totalUsage?: LanguageModelUsage
  lastStepUsage?: LanguageModelUsage
  lastStepAt?: number
  stepCount?: number
  cacheDetailsIncomplete?: boolean
  createdAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
}

export type UsageMessage = Pick<UIMessage, "id" | "role" | "metadata"> & {
  parts?: UIMessage["parts"]
  stepStartCount?: number
}

/** Legacy replies retain SDK step boundaries; explicit counts survive approval continuations. */
export function getMessageStepCount(message: UsageMessage): number {
  if (message.role !== "assistant") {
    return 0
  }
  const metadata = message.metadata as
    | (MessageUsageMetadata & { isError?: boolean; isAbort?: boolean; isDisconnect?: boolean })
    | undefined
  const explicit = normalizeTokenCount(metadata?.stepCount)
  if (explicit !== undefined && Number.isInteger(explicit)) {
    return explicit
  }
  const starts =
    message.stepStartCount ?? message.parts?.filter(part => part.type === "step-start").length ?? 0
  if (starts > 0) {
    const unfinished = metadata?.isError || metadata?.isAbort || metadata?.isDisconnect
    return Math.max(0, starts - (unfinished ? 1 : 0))
  }
  return metadata?.totalUsage && getMessageUsageTokenBreakdown(metadata.totalUsage).total > 0
    ? 1
    : 0
}

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

export function hasCompleteCacheDetails(usage: LanguageModelUsage): boolean {
  return (
    normalizeTokenCount(usage.inputTokenDetails?.cacheReadTokens) !== undefined &&
    normalizeTokenCount(usage.inputTokenDetails?.cacheWriteTokens) !== undefined
  )
}
