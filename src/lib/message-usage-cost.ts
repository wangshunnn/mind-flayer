import type { LanguageModelUsage } from "ai"
import type { ModelPricing } from "@/lib/provider-constants"

const TOKENS_PER_MILLION = 1_000_000

export type PricingField = "input" | "output" | "cachedRead" | "cachedWrite"

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

export interface MessageUsageCostBreakdown {
  input: number | null
  cachedRead: number | null
  cachedWrite: number | null
  output: number | null
  total: number | null
}

export interface MessageUsageCostResult {
  tokens: MessageUsageTokenBreakdown
  costs: MessageUsageCostBreakdown
  missingPricingFields: PricingField[]
  hasAnyPricing: boolean
  isEstimated: boolean
}

const normalizeTokenCount = (value: number | undefined): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined
  }

  return Math.max(0, value)
}

const normalizePrice = (value: number | null | undefined): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value) || value < 0) {
    return undefined
  }

  return value
}

const sumDefined = (values: Array<number | null>) =>
  values.reduce<number>((acc, value) => acc + (value ?? 0), 0)

const costFor = (tokenCount: number, pricePerMillion: number | undefined): number | null => {
  if (pricePerMillion === undefined) {
    return null
  }

  return (tokenCount * pricePerMillion) / TOKENS_PER_MILLION
}

export function getMessageUsageTokenBreakdown(
  usage: LanguageModelUsage
): MessageUsageTokenBreakdown {
  const normalizedInput = normalizeTokenCount(usage.inputTokens)
  const normalizedNoCacheInput = normalizeTokenCount(usage.inputTokenDetails?.noCacheTokens)
  const normalizedCachedReadInput =
    normalizeTokenCount(usage.inputTokenDetails?.cacheReadTokens) ?? 0
  const normalizedCachedWriteInput =
    normalizeTokenCount(usage.inputTokenDetails?.cacheWriteTokens) ?? 0
  const hasAnyInputDetails =
    usage.inputTokenDetails?.noCacheTokens !== undefined ||
    usage.inputTokenDetails?.cacheReadTokens !== undefined ||
    usage.inputTokenDetails?.cacheWriteTokens !== undefined

  const noCacheInput =
    normalizedNoCacheInput ??
    (normalizedInput !== undefined
      ? Math.max(0, normalizedInput - normalizedCachedReadInput - normalizedCachedWriteInput)
      : 0)

  const input =
    normalizedInput ??
    (hasAnyInputDetails
      ? noCacheInput + normalizedCachedReadInput + normalizedCachedWriteInput
      : noCacheInput)

  const textOutput = normalizeTokenCount(usage.outputTokenDetails?.textTokens) ?? 0
  const reasoningOutput = normalizeTokenCount(usage.outputTokenDetails?.reasoningTokens) ?? 0
  const normalizedOutput = normalizeTokenCount(usage.outputTokens)
  const hasAnyOutputDetails =
    usage.outputTokenDetails?.textTokens !== undefined ||
    usage.outputTokenDetails?.reasoningTokens !== undefined
  const output = normalizedOutput ?? (hasAnyOutputDetails ? textOutput + reasoningOutput : 0)

  const total = normalizeTokenCount(usage.totalTokens) ?? input + output

  return {
    input,
    output,
    noCacheInput,
    cachedReadInput: normalizedCachedReadInput,
    cachedWriteInput: normalizedCachedWriteInput,
    textOutput,
    reasoningOutput,
    total
  }
}

export function computeMessageUsageCost(
  usage: LanguageModelUsage,
  pricing?: ModelPricing
): MessageUsageCostResult {
  const tokens = getMessageUsageTokenBreakdown(usage)

  const inputPrice = normalizePrice(pricing?.input)
  const outputPrice = normalizePrice(pricing?.output)
  const cachedReadPrice = normalizePrice(pricing?.cachedRead)
  const cachedWritePrice = normalizePrice(pricing?.cachedWrite)

  const missingPricingFields: PricingField[] = []
  if (tokens.noCacheInput > 0 && inputPrice === undefined) {
    missingPricingFields.push("input")
  }
  if (tokens.output > 0 && outputPrice === undefined) {
    missingPricingFields.push("output")
  }
  if (tokens.cachedReadInput > 0 && cachedReadPrice === undefined) {
    missingPricingFields.push("cachedRead")
  }
  if (tokens.cachedWriteInput > 0 && cachedWritePrice === undefined) {
    missingPricingFields.push("cachedWrite")
  }

  const hasAnyPricing =
    inputPrice !== undefined ||
    outputPrice !== undefined ||
    cachedReadPrice !== undefined ||
    cachedWritePrice !== undefined

  const costs: MessageUsageCostBreakdown = {
    input: costFor(tokens.noCacheInput, inputPrice),
    cachedRead: costFor(tokens.cachedReadInput, cachedReadPrice),
    cachedWrite: costFor(tokens.cachedWriteInput, cachedWritePrice),
    output: costFor(tokens.output, outputPrice),
    total: null
  }

  costs.total = hasAnyPricing
    ? sumDefined([costs.input, costs.cachedRead, costs.cachedWrite, costs.output])
    : null

  return {
    tokens,
    costs,
    missingPricingFields,
    hasAnyPricing,
    isEstimated: hasAnyPricing && missingPricingFields.length > 0
  }
}
