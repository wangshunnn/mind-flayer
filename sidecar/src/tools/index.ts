import { BashExecutionTool, bashExecutionTool } from "./bash-exec"
import { ToolRegistry } from "./registry"
import { WebSearchTool, webSearchTool } from "./web-search"

/**
 * Global tool registry instance.
 * All built-in tools are automatically registered on import.
 */
export const toolRegistry = new ToolRegistry()

// Register built-in tools
toolRegistry.register(new WebSearchTool())
toolRegistry.register(new BashExecutionTool())

export type { ITool } from "./base-tool"
// Export types and classes for external use
export { ToolRegistry } from "./registry"

// Keep exporting tool factories for backward compatibility during refactoring
export { webSearchTool, bashExecutionTool }

// Type for all available tools (used by AI SDK)
export type AllTools = {
  webSearch?: ReturnType<typeof webSearchTool>
  bashExecution?: ReturnType<typeof bashExecutionTool>
}
