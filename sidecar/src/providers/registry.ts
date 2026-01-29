import type { IProvider } from "./base"

/**
 * Lightweight registry for AI provider plugins.
 * Uses a simple Map-based design with initialization lock to prevent duplicate registrations.
 */
export class ProviderRegistry {
  private providers = new Map<string, IProvider>()
  private initialized = false

  /**
   * Register a provider plugin.
   * Can only be called during initialization (before first get() call).
   *
   * @param provider - Provider plugin instance to register
   * @throws Error if called after initialization
   */
  register(provider: IProvider): void {
    if (this.initialized) {
      throw new Error(`Cannot register provider '${provider.name}' after registry initialization`)
    }

    if (this.providers.has(provider.name)) {
      console.warn(`[ProviderRegistry] Provider '${provider.name}' is already registered`)
      return
    }

    this.providers.set(provider.name, provider)
    console.log(`[ProviderRegistry] Registered provider: ${provider.name}`)
  }

  /**
   * Get a registered provider by name.
   * First call locks the registry (no more registrations allowed).
   *
   * @param name - Provider name
   * @returns Provider instance
   * @throws Error if provider not found
   */
  get(name: string): IProvider {
    this.initialized = true

    const provider = this.providers.get(name)
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(", ")
      throw new Error(`Provider '${name}' not found. Available providers: ${available}`)
    }

    return provider
  }

  /**
   * Check if a provider is registered.
   *
   * @param name - Provider name
   * @returns True if provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name)
  }

  /**
   * Get all registered provider names.
   *
   * @returns Array of provider names
   */
  list(): string[] {
    return Array.from(this.providers.keys())
  }
}
