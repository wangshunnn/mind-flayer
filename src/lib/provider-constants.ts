import type { LucideIcon } from "lucide-react"
import { Bot, Search } from "lucide-react"
import {
  AnthropicIcon,
  GeminiIcon,
  KimiIcon,
  MinimaxIcon,
  OpenAIIcon,
  ZhipuIcon
} from "@/components/icons"
import type { ProviderFormData } from "@/types/settings"

type ProviderIconComponent = React.ComponentType<{ className?: string }>

export type PricingCurrency = "USD" | "CNY"

/**
 * Model pricing per 1M tokens with currency metadata.
 */
export interface ModelPricing {
  currency: PricingCurrency
  input: number | null
  output: number | null
  cachedRead: number | null
  cachedWrite: number | null
}

export interface ProviderModel {
  label: string
  api_id: string
  contextWindow?: number | null
  pricing?: ModelPricing
}

export interface Provider {
  id: string
  name: string
  defaultBaseUrl: string
  apiKeyUrl: string
  icon: LucideIcon
  logo?: ProviderIconComponent
  disabled?: boolean
  models?: ProviderModel[]
}

export const MODEL_PROVIDERS: Provider[] = [
  {
    id: "minimax",
    name: "MiniMax",
    defaultBaseUrl: "https://api.minimaxi.com/anthropic/v1",
    apiKeyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    icon: Bot,
    logo: MinimaxIcon,
    models: [
      {
        label: "MiniMax-M2.5",
        api_id: "MiniMax-M2.5",
        contextWindow: 204_800,
        pricing: {
          currency: "CNY",
          input: 2.1,
          output: 8.4,
          cachedRead: 0.21,
          cachedWrite: 2.625
        }
      },
      {
        label: "MiniMax-M2.5-highspeed",
        api_id: "MiniMax-M2.5-highspeed",
        contextWindow: 204_800,
        pricing: {
          currency: "CNY",
          input: 4.2,
          output: 16.8,
          cachedRead: 0.21,
          cachedWrite: 2.625
        }
      },
      {
        label: "MiniMax-M2.1",
        api_id: "MiniMax-M2.1",
        contextWindow: 204_800,
        pricing: {
          currency: "CNY",
          input: 2.1,
          output: 8.4,
          cachedRead: 0.21,
          cachedWrite: 2.625
        }
      },
      {
        label: "MiniMax-M2.1-highspeed",
        api_id: "MiniMax-M2.1-highspeed",
        contextWindow: 204_800,
        pricing: {
          currency: "CNY",
          input: 4.2,
          output: 16.8,
          cachedRead: 0.21,
          cachedWrite: 2.625
        }
      }
    ]
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    icon: Bot,
    logo: OpenAIIcon,
    models: [
      {
        label: "GPT-5.4-Pro",
        api_id: "gpt-5.4-pro",
        contextWindow: 1050000,
        pricing: {
          currency: "USD",
          input: 30,
          output: 180,
          cachedRead: null,
          cachedWrite: null
        }
      },
      {
        label: "GPT-5.4",
        api_id: "gpt-5.4",
        contextWindow: 1050000,
        pricing: {
          currency: "USD",
          input: 2.5,
          output: 15,
          cachedRead: 0.25,
          cachedWrite: null
        }
      },
      {
        label: "GPT-5.3-Chat-Latest",
        api_id: "gpt-5.3-chat-latest",
        contextWindow: 128000,
        pricing: {
          currency: "USD",
          input: 1.75,
          output: 14,
          cachedRead: 0.175,
          cachedWrite: null
        }
      }
    ]
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    icon: Bot,
    logo: AnthropicIcon,
    models: [
      {
        label: "Claude Opus 4.6",
        api_id: "claude-opus-4-6",
        contextWindow: 1000000,
        pricing: {
          currency: "USD",
          input: 5,
          output: 25,
          cachedRead: 0.5,
          cachedWrite: 6.25
        }
      },
      {
        label: "Claude Sonnet 4.6",
        api_id: "claude-sonnet-4-6",
        contextWindow: 1000000,
        pricing: {
          currency: "USD",
          input: 3,
          output: 15,
          cachedRead: 0.3,
          cachedWrite: 3.75
        }
      }
    ]
  }
]

export const WEB_SEARCH_PROVIDERS: Provider[] = [
  {
    id: "parallel",
    name: "Parallel",
    defaultBaseUrl: "",
    apiKeyUrl: "https://platform.parallel.ai/settings?tab=api-keys",
    icon: Search
  }
]

export const CHANNEL_PROVIDERS: Provider[] = [
  {
    id: "telegram",
    name: "Telegram",
    defaultBaseUrl: "https://api.telegram.org",
    apiKeyUrl: "https://t.me/BotFather",
    icon: Bot
  }
]

export const UPCOMING_PROVIDERS: Provider[] = [
  {
    id: "gemini",
    name: "Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    icon: Bot,
    logo: GeminiIcon,
    disabled: true,
    models: []
  },
  {
    id: "kimi",
    name: "Kimi",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    icon: Bot,
    logo: KimiIcon,
    disabled: true,
    models: []
  },
  {
    id: "zhipu",
    name: "Zhipu",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    icon: Bot,
    logo: ZhipuIcon,
    disabled: true,
    models: []
  }
]

export const ALL_PROVIDERS = [
  ...MODEL_PROVIDERS,
  ...WEB_SEARCH_PROVIDERS,
  ...CHANNEL_PROVIDERS,
  ...UPCOMING_PROVIDERS
]

const providerNameCollator = new Intl.Collator("en", {
  sensitivity: "base"
})

export function sortProvidersByAvailabilityAndName<
  T extends Pick<Provider, "id" | "name" | "disabled">
>(providers: readonly T[], enabledProviders: Record<string, boolean>): T[] {
  return [...providers].sort((left: T, right: T) => {
    const leftAvailable = !(left.disabled ?? false) && (enabledProviders[left.id] ?? false)
    const rightAvailable = !(right.disabled ?? false) && (enabledProviders[right.id] ?? false)

    if (leftAvailable !== rightAvailable) {
      return leftAvailable ? -1 : 1
    }

    return providerNameCollator.compare(left.name, right.name)
  })
}

export function findModelPricing(
  providerId: string | null | undefined,
  modelId: string | null | undefined
): ModelPricing | undefined {
  if (!providerId || !modelId) {
    return undefined
  }

  const provider = ALL_PROVIDERS.find(item => item.id === providerId)
  const model = provider?.models?.find(item => item.api_id === modelId)

  return model?.pricing ? { ...model.pricing } : undefined
}

export const DEFAULT_FORM_DATA = ALL_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = { apiKey: "", baseUrl: "" }
    return acc
  },
  {} as Record<string, ProviderFormData>
)
