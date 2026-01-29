export type Theme = "dark" | "light" | "system"
export type Language = "en" | "zh-CN" | "system"
export type WebSearchMode = "auto" | "always"

export interface AppSettings {
  // Theme settings
  theme: Theme

  // Language settings
  language: Language

  // Model settings
  selectedModelApiId: string

  // Provider settings
  enabledProviders: Record<string, boolean>

  // Tool settings
  webSearchEnabled: boolean
  webSearchMode: WebSearchMode
  deepThinkEnabled: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  language: "system",
  selectedModelApiId: "MiniMax-M2.1",
  enabledProviders: {
    minimax: false,
    parallel: false
  },
  webSearchEnabled: true,
  webSearchMode: "auto",
  deepThinkEnabled: true
}

export interface ProviderFormData {
  apiKey: string
  baseUrl: string
  enabled: boolean
}
