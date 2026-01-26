import { Bot, Brain, Search, Sparkles } from "lucide-react"
import type { ProviderFormData } from "@/types/settings"

export const MODEL_PROVIDERS = [
  {
    id: "minimax",
    name: "MiniMax",
    defaultBaseUrl: "https://api.minimaxi.com/anthropic/v1",
    apiKeyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    icon: Sparkles,
    models: [
      { label: "MiniMax M2.1", api_id: "MiniMax-M2.1" },
      { label: "MiniMax M2.1 lightning", api_id: "MiniMax-M2.1-lightning" },
      { label: "MiniMax M2", api_id: "MiniMax-M2" }
    ]
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    icon: Bot,
    models: [
      { label: "GPT-4", api_id: "gpt-4" },
      { label: "GPT-4 Turbo", api_id: "gpt-4-turbo" },
      { label: "GPT-3.5 Turbo", api_id: "gpt-3.5-turbo" }
    ]
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    icon: Brain,
    models: [
      { label: "Claude Sonnet 4.5", api_id: "claude-sonnet-4-5-20251022" },
      { label: "Claude Opus 4.5", api_id: "claude-opus-4-5-20251101" }
    ]
  }
]

export const WEB_SEARCH_PROVIDERS = [
  {
    id: "parallel",
    name: "Parallel",
    defaultBaseUrl: "",
    apiKeyUrl: "https://platform.parallel.ai/settings?tab=api-keys",
    icon: Search
  }
]

export const ALL_PROVIDERS = [...MODEL_PROVIDERS, ...WEB_SEARCH_PROVIDERS]

export const DEFAULT_FORM_DATA = ALL_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = { apiKey: "", baseUrl: "", enabled: false }
    return acc
  },
  {} as Record<string, ProviderFormData>
)
