export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
}

export type WebSearchMode = "auto" | "always"

export type ProviderType = "minimax" | "anthropic" | "openai"

export interface ConfigUpdateMessage {
  type: "config_update"
  configs: Record<string, ProviderConfig>
}
