import type { ITool } from "./base-tool"

/**
 * Lightweight registry for tool plugins.
 * Uses a simple Map-based design similar to ProviderRegistry.
 */
export class ToolRegistry {
  private tools = new Map<string, ITool>()
  private initialized = false

  /**
   * Register a tool plugin.
   * Can only be called during initialization (before first get() call).
   *
   * @param tool - Tool plugin instance to register
   * @throws Error if called after initialization
   */
  register(tool: ITool): void {
    if (this.initialized) {
      throw new Error(`Cannot register tool '${tool.name}' after registry initialization`)
    }

    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool '${tool.name}' is already registered`)
      return
    }

    this.tools.set(tool.name, tool)
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`)
  }

  /**
   * Get a registered tool by name.
   * First call locks the registry (no more registrations allowed).
   *
   * @param name - Tool name
   * @returns Tool instance
   * @throws Error if tool not found
   */
  get(name: string): ITool {
    this.initialized = true

    const tool = this.tools.get(name)
    if (!tool) {
      const available = Array.from(this.tools.keys()).join(", ")
      throw new Error(`Tool '${name}' not found. Available tools: ${available}`)
    }

    return tool
  }

  /**
   * Check if a tool is registered.
   *
   * @param name - Tool name
   * @returns True if tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * Get all registered tool names.
   *
   * @returns Array of tool names
   */
  list(): string[] {
    return Array.from(this.tools.keys())
  }
}
