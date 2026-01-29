/**
 * Provider configurations with default base URLs
 */
export const MODEL_PROVIDERS = {
  minimax: {
    defaultBaseUrl: "https://api.minimaxi.com/anthropic/v1"
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
