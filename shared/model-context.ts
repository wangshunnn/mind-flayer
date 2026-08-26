/** Provider/model keys match the model catalogue; unknown models have no assumed limit. */
const CONTEXT_WINDOWS: Record<string, number> = {
  "minimax/MiniMax-M3": 1_000_000,
  "minimax/MiniMax-M2.7": 204_800,
  "minimax/MiniMax-M2.7-highspeed": 204_800,
  "openai/gpt-5.4-pro": 1_050_000,
  "openai/gpt-5.4": 1_050_000,
  "openai/gpt-5.3-chat-latest": 128_000,
  "anthropic/claude-opus-4-6": 1_000_000,
  "anthropic/claude-sonnet-4-6": 1_000_000,
  "deepseek/deepseek-v4-flash": 1_000_000,
  "deepseek/deepseek-v4-pro": 1_000_000,
  "zhipu/glm-5.2": 1_000_000
}

export function getModelContextWindow(provider: string, modelId: string): number | null {
  return CONTEXT_WINDOWS[`${provider}/${modelId}`] ?? null
}
