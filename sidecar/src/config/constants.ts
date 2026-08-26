/**
 * Provider configurations with default base URLs
 */
export const MODEL_PROVIDERS = {
  minimax: {
    defaultBaseUrl: "https://api.minimaxi.com/v1"
  },
  openai: {
    defaultBaseUrl: "https://api.openai.com/v1"
  },
  anthropic: {
    defaultBaseUrl: "https://api.anthropic.com/v1"
  },
  deepseek: {
    defaultBaseUrl: "https://api.deepseek.com"
  },
  zhipu: {
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4"
  }
} as const

/**
 * Allowed CORS origins for development environment
 */
export const devOrigins = new Set([
  "http://localhost:1420" // tauri dev
])

/**
 * Allowed CORS origins for production environment
 */
export const prodOrigins = new Set([
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost"
])
