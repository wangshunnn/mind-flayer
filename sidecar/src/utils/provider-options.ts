import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic"
import type { OpenAILanguageModelChatOptions } from "@ai-sdk/openai"
import type { ProviderType, ReasoningEffort } from "../type"

type JsonValue = null | string | number | boolean | JsonObject | JsonValue[]
type JsonObject = {
  [key: string]: JsonValue | undefined
}
type ProviderOptions = Record<string, JsonObject>

const OPENAI_REASONING_MODEL_PREFIXES = ["o1", "o3", "o4", "gpt-5"] as const
const ANTHROPIC_REASONING_MODEL_PATTERNS = [
  /^claude-(sonnet|opus|haiku)-4(?:[.-]|$)/u,
  /^claude-(sonnet|opus)-4-5(?:[.-]|$)/u,
  /^claude-(sonnet|opus)-4-6(?:[.-]|$)/u
] as const

export interface ProviderOptionsConfig {
  modelProvider: string
  modelId: string
  reasoningEnabled: boolean
  reasoningEffort: ReasoningEffort
}

function supportsAdjustableReasoningEffort(
  provider: string,
  modelId: string
): provider is ProviderType {
  if (provider === "openai") {
    return OPENAI_REASONING_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix))
  }

  if (provider === "anthropic") {
    return ANTHROPIC_REASONING_MODEL_PATTERNS.some(pattern => pattern.test(modelId))
  }

  return false
}

function mapOpenAIReasoningEffort(
  reasoningEnabled: boolean,
  reasoningEffort: ReasoningEffort
): OpenAILanguageModelChatOptions {
  if (!reasoningEnabled) {
    return {
      reasoningEffort: "none"
    } satisfies OpenAILanguageModelChatOptions
  }

  if (reasoningEffort === "default") {
    return {} satisfies OpenAILanguageModelChatOptions
  }

  return {
    reasoningEffort
  } satisfies OpenAILanguageModelChatOptions
}

function mapAnthropicReasoningEffort(
  reasoningEnabled: boolean,
  reasoningEffort: ReasoningEffort
): AnthropicLanguageModelOptions {
  if (!reasoningEnabled) {
    return {
      thinking: {
        type: "disabled"
      }
    } satisfies AnthropicLanguageModelOptions
  }

  if (reasoningEffort === "default") {
    return {} satisfies AnthropicLanguageModelOptions
  }

  const effortMap: Record<
    Exclude<ReasoningEffort, "default">,
    "low" | "medium" | "high" | "max"
  > = {
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "max"
  }

  return {
    effort: effortMap[reasoningEffort]
  } satisfies AnthropicLanguageModelOptions
}

export function buildProviderOptions({
  modelProvider,
  modelId,
  reasoningEnabled,
  reasoningEffort
}: ProviderOptionsConfig): ProviderOptions | undefined {
  if (!supportsAdjustableReasoningEffort(modelProvider, modelId)) {
    return undefined
  }

  if (modelProvider === "openai") {
    const openai = mapOpenAIReasoningEffort(reasoningEnabled, reasoningEffort)
    return Object.keys(openai).length ? { openai } : undefined
  }

  if (modelProvider === "anthropic") {
    const anthropic = mapAnthropicReasoningEffort(reasoningEnabled, reasoningEffort)
    return Object.keys(anthropic).length ? { anthropic } : undefined
  }

  return undefined
}
