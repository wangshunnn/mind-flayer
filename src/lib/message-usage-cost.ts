import type { LanguageModelUsage } from "ai"
import type { ModelPricing } from "@/lib/provider-constants"
import {
  getMessageUsageTokenBreakdown,
  type MessageUsageTokenBreakdown
} from "../../shared/message-usage"

export {
  getMessageUsageTokenBreakdown,
  type MessageUsageTokenBreakdown
} from "../../shared/message-usage"

const TOKENS_PER_MILLION = 1_000_000

export type PricingField = "input" | "output" | "cachedRead" | "cachedWrite"

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
