import { ToolRegistry } from "./registry"
import { WebSearchTool, webSearchTool } from "./web-search"

/**
 * Global tool registry instance.
 * All built-in tools are automatically registered on import.
 */
export const toolRegistry = new ToolRegistry()

// Register built-in tools
toolRegistry.register(new WebSearchTool())

export type { ITool } from "./base-tool"
// Export types and classes for external use
export { ToolRegistry } from "./registry"

// Keep exporting webSearchTool for backward compatibility during refactoring
export { webSearchTool }

// Type for all available tools (used by AI SDK)
export type AllTools = { webSearch?: ReturnType<typeof webSearchTool> }
