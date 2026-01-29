import type { LanguageModel } from "ai"
import { providerRegistry } from "../providers"
import type { ConfigUpdateMessage, ProviderConfig } from "../type"

/**
 * Service for managing provider configurations and model creation.
 * Handles API key cache and delegates model creation to provider plugins.
 */
export class ProviderService {
  private apiKeyCache = new Map<string, ProviderConfig>()

  /**
   * Get provider configuration.
   *
   * @param provider - Provider name
   * @returns Provider configuration or undefined if not found
   */
  getConfig(provider: string): ProviderConfig | undefined {
    return this.apiKeyCache.get(provider)
  }

  /**
   * Check if provider configuration exists.
   *
   * @param provider - Provider name
   * @returns True if configuration exists
   */
  hasConfig(provider: string): boolean {
    return this.apiKeyCache.has(provider)
  }

  /**
   * Update provider configurations from stdin message.
   * Replaces all existing configurations with new ones.
   *
   * @param message - Configuration update message from Tauri
   */
  updateConfigs(message: ConfigUpdateMessage): void {
    console.log("[ProviderService] Updating provider configurations")

    this.apiKeyCache.clear()

    for (const [provider, config] of Object.entries(message.configs)) {
      this.apiKeyCache.set(provider, config)
      console.log(`[ProviderService] Updated config for provider: ${provider}`)
    }
  }

  /**
   * Create a language model instance using the registered provider.
   *
   * @param provider - Provider name (e.g., "minimax")
   * @param modelId - Model identifier (e.g., "abab6.5s-chat")
   * @returns Language model instance
   * @throws Error if provider not registered or configured
   */
  createModel(provider: string, modelId: string): LanguageModel {
    const config = this.getConfig(provider)
    if (!config) {
      throw new Error(`Provider '${provider}' is not configured`)
    }

    const providerPlugin = providerRegistry.get(provider)
    return providerPlugin.createModel(modelId, config)
  }
}

/**
 * Global provider service instance.
 */
export const providerService = new ProviderService()
