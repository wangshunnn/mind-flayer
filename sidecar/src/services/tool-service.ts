import type { AllTools } from "../tools"
import { toolRegistry } from "../tools"

/**
 * Service for managing tool instances and configurations.
 * Handles tool instance caching and updates based on API key changes.
 */
export class ToolService {
  private toolInstances = new Map<string, unknown>()

  /**
   * Update a tool's configuration (recreate instance with new API key).
   *
   * @param toolName - Name of the tool to update
   * @param apiKey - New API key for the tool
   */
  updateToolConfig(toolName: string, apiKey: string): void {
    console.log(`[ToolService] Updating tool '${toolName}' with new API key`)

    const toolPlugin = toolRegistry.get(toolName)
    const toolInstance = toolPlugin.createInstance(apiKey)

    this.toolInstances.set(toolName, toolInstance)
  }

  /**
   * Get request-specific tools object for AI SDK.
   * Returns enabled tools based on configuration.
   *
   * @param options - Tool configuration options
   * @param options.useWebSearch - Whether to enable web search
   * @returns Tools object for AI SDK
   */
  getRequestTools(options: { useWebSearch: boolean }): AllTools {
    const { useWebSearch } = options

    if (useWebSearch) {
      let webSearchInstance = this.toolInstances.get("webSearch") as AllTools["webSearch"]

      if (!webSearchInstance) {
        console.warn(
          "[ToolService] Web search requested but instance not available; initializing with empty API key"
        )
        this.updateToolConfig("webSearch", "")
        webSearchInstance = this.toolInstances.get("webSearch") as AllTools["webSearch"]
      }

      return { webSearch: webSearchInstance }
    }

    return {}
  }

  /**
   * Check if a tool instance exists.
   *
   * @param toolName - Name of the tool
   * @returns True if tool instance exists
   */
  hasToolInstance(toolName: string): boolean {
    return this.toolInstances.has(toolName)
  }
}

/**
 * Global tool service instance.
 */
export const toolService = new ToolService()
