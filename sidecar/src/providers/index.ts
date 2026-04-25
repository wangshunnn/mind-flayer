import { AnthropicProvider } from "./anthropic-provider"
import { DeepSeekProvider } from "./deepseek-provider"
import { MinimaxProvider } from "./minimax-provider"
import { OpenAIProvider } from "./openai-provider"
import { ProviderRegistry } from "./registry"

/**
 * Global provider registry instance.
 * All built-in providers are automatically registered on import.
 */
export const providerRegistry = new ProviderRegistry()

// Register built-in providers
providerRegistry.register(new AnthropicProvider())
providerRegistry.register(new DeepSeekProvider())
providerRegistry.register(new MinimaxProvider())
providerRegistry.register(new OpenAIProvider())

export type { IProvider, ProviderRuntimeOptions } from "./base"
// Export types and classes for external use
export { ProviderRegistry } from "./registry"
