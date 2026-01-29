import { MinimaxProvider } from "./minimax-provider"
import { ProviderRegistry } from "./registry"

/**
 * Global provider registry instance.
 * All built-in providers are automatically registered on import.
 */
export const providerRegistry = new ProviderRegistry()

// Register built-in providers
providerRegistry.register(new MinimaxProvider())

export type { IProvider } from "./base"
// Export types and classes for external use
export { ProviderRegistry } from "./registry"
