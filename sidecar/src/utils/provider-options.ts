import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic"
import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek"
import type { OpenAILanguageModelChatOptions } from "@ai-sdk/openai"
import type { SharedV4ProviderOptions } from "@ai-sdk/provider"
import type { ProviderType, ReasoningEffort } from "../type"

type ProviderOptions = SharedV4ProviderOptions

const OPENAI_REASONING_MODEL_PREFIXES = ["o1", "o3", "o4", "gpt-5"] as const
const MINIMAX_ADJUSTABLE_REASONING_MODEL_PREFIXES = ["MiniMax-M3"] as const
const ZAI_ADJUSTABLE_REASONING_MODEL_PREFIXES = ["glm-5.2"] as const
const ANTHROPIC_REASONING_MODEL_PATTERNS = [
  /^claude-(sonnet|opus|haiku)-4(?:[.-]|$)/u,
  /^claude-(sonnet|opus)-4-5(?:[.-]|$)/u,
  /^claude-(sonnet|opus)-4-6(?:[.-]|$)/u
] as const
const DEEPSEEK_REASONING_MODEL_PREFIXES = ["deepseek-v4"] as const

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

  if (provider === "minimax") {
    return MINIMAX_ADJUSTABLE_REASONING_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix))
  }

  if (provider === "zhipu") {
    return ZAI_ADJUSTABLE_REASONING_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix))
  }

  if (provider === "anthropic") {
    return ANTHROPIC_REASONING_MODEL_PATTERNS.some(pattern => pattern.test(modelId))
  }

  if (provider === "deepseek") {
    return DEEPSEEK_REASONING_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix))
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
    return {
      thinking: { type: "adaptive" }
    } satisfies AnthropicLanguageModelOptions
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
    thinking: { type: "adaptive" },
    effort: effortMap[reasoningEffort]
  } satisfies AnthropicLanguageModelOptions
}

function mapDeepSeekThinking(reasoningEnabled: boolean): DeepSeekLanguageModelOptions {
  return {
    thinking: {
      type: reasoningEnabled ? "enabled" : "disabled"
    }
  } satisfies DeepSeekLanguageModelOptions
}

function mapMiniMaxThinking(reasoningEnabled: boolean): ProviderOptions["minimax"] {
  return {
    thinking: {
      type: reasoningEnabled ? "adaptive" : "disabled"
    }
  }
}

export function buildProviderOptions({
  modelProvider,
  modelId,
  reasoningEnabled,
  reasoningEffort
}: ProviderOptionsConfig): ProviderOptions | undefined {
  if (modelProvider === "anthropic") {
    return {
      anthropic: {
        cacheControl: { type: "ephemeral" },
        ...(supportsAdjustableReasoningEffort(modelProvider, modelId)
          ? mapAnthropicReasoningEffort(reasoningEnabled, reasoningEffort)
          : {})
      }
    } as ProviderOptions
  }

  if (!supportsAdjustableReasoningEffort(modelProvider, modelId)) {
    return undefined
  }

  if (modelProvider === "openai") {
    const openai = mapOpenAIReasoningEffort(reasoningEnabled, reasoningEffort)
    return Object.keys(openai).length ? { openai } : undefined
  }

  if (modelProvider === "minimax") {
    return { minimax: mapMiniMaxThinking(reasoningEnabled) }
  }

  if (modelProvider === "zhipu") {
    return {
      zhipu: {
        thinking: { type: reasoningEnabled ? "enabled" : "disabled" },
        ...(reasoningEnabled && reasoningEffort !== "default" ? { reasoningEffort } : {})
      }
    }
  }

  if (modelProvider === "deepseek") {
    return { deepseek: mapDeepSeekThinking(reasoningEnabled) } as ProviderOptions
  }

  return undefined
}
