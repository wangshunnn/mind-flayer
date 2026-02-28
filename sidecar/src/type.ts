export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
}

export interface SelectedModelRuntime {
  provider: string
  modelId: string
}

export interface ChannelRuntimeConfig {
  selectedModel: SelectedModelRuntime | null
  channels: {
    telegram: {
      enabled: boolean
    }
  }
}

export type WebSearchMode = "auto" | "always"

export type ProviderType = "minimax" | "anthropic" | "openai"

export interface ConfigUpdateMessage {
  type: "config_update"
  configs: Record<string, ProviderConfig>
}
