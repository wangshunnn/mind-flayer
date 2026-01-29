import type { LanguageModel } from "ai"
import type { ProviderConfig } from "../type"

/**
 * Base interface for AI provider plugins.
 * Each provider plugin must implement this interface.
 */
export interface IProvider {
  /**
   * Unique identifier for the provider (e.g., "minimax", "anthropic", "openai")
   */
  readonly name: string

  /**
   * Create a language model instance with the given configuration.
   *
   * @param modelId - The specific model ID to use (e.g., "abab6.5s-chat")
   * @param config - Provider configuration including API key and optional base URL
   * @returns Language model instance ready for use with AI SDK
   */
  createModel(modelId: string, config: ProviderConfig): LanguageModel
}
