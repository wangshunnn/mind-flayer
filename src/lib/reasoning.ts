import type { ReasoningEffort } from "@/types/settings"

const OPENAI_REASONING_MODEL_PREFIXES = ["o1", "o3", "o4", "gpt-5"] as const
const ANTHROPIC_REASONING_MODEL_PATTERNS = [
  /^claude-(sonnet|opus|haiku)-4(?:[.-]|$)/u,
  /^claude-(sonnet|opus)-4-5(?:[.-]|$)/u,
  /^claude-(sonnet|opus)-4-6(?:[.-]|$)/u
] as const

export function supportsAdjustableReasoningEffort(
  provider: string | null | undefined,
  modelId: string | null | undefined
): boolean {
  if (!provider || !modelId) {
    return false
  }

  if (provider === "openai") {
    return OPENAI_REASONING_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix))
  }

  if (provider === "anthropic") {
    return ANTHROPIC_REASONING_MODEL_PATTERNS.some(pattern => pattern.test(modelId))
  }

  return false
}

export function resolveReasoningEffort(
  provider: string | null | undefined,
  modelId: string | null | undefined,
  preferredEffort: ReasoningEffort
): ReasoningEffort {
  if (!supportsAdjustableReasoningEffort(provider, modelId)) {
    return "default"
  }

  return preferredEffort
}
