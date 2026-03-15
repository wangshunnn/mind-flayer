export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
}

export interface SelectedModelRuntime {
  provider: string
  modelId: string
}

export interface RuntimeConfig {
  selectedModel: SelectedModelRuntime | null
  channels: {
    telegram: {
      enabled: boolean
      allowedUserIds: string[]
    }
  }
  disabledSkills: string[]
}

export type ChannelRuntimeConfig = RuntimeConfig

export type WebSearchMode = "auto" | "always"
export type ReasoningEffort = "default" | "low" | "medium" | "high" | "xhigh"

export type ProviderType = "minimax" | "anthropic" | "openai"

export interface ConfigUpdateMessage {
  type: "config_update"
  configs: Record<string, ProviderConfig>
}
