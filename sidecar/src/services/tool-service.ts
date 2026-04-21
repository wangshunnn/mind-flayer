import type { AllTools } from "../tools"
import { toolRegistry } from "../tools"
import { isBashExecSupportedPlatform } from "../tools/bash-exec/platform"

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
   * @param options.chatId - Chat session ID for bash execution sandbox isolation
   * @param options.includeBashExecution - Whether to include bash tool (default true)
   * @returns Tools object for AI SDK
   */
  getRequestTools(options: {
    useWebSearch: boolean
    chatId?: string
    includeBashExecution?: boolean
    source?: "channel" | "desktop"
  }): AllTools {
    const { useWebSearch, chatId, includeBashExecution = true, source = "desktop" } = options
    const tools: AllTools = {}
    const readToolPlugin = toolRegistry.get("read")
    tools.read = readToolPlugin.createInstance("") as AllTools["read"]
    tools.appendWorkspaceSection = toolRegistry
      .get("appendWorkspaceSection")
      .createInstance("") as AllTools["appendWorkspaceSection"]
    tools.replaceWorkspaceSection = toolRegistry
      .get("replaceWorkspaceSection")
      .createInstance("") as AllTools["replaceWorkspaceSection"]
    tools.appendDailyMemory = toolRegistry
      .get("appendDailyMemory")
      .createInstance("") as AllTools["appendDailyMemory"]
    tools.deleteWorkspaceFile = toolRegistry
      .get("deleteWorkspaceFile")
      .createInstance("") as AllTools["deleteWorkspaceFile"]
    tools.memorySearch = toolRegistry
      .get("memorySearch")
      .createInstance("") as AllTools["memorySearch"]
    tools.memoryGet = toolRegistry.get("memoryGet").createInstance("") as AllTools["memoryGet"]

    // Add web search tool if enabled
    if (useWebSearch) {
      let webSearchInstance = this.toolInstances.get("webSearch") as AllTools["webSearch"]

      if (!webSearchInstance) {
        console.warn(
          "[ToolService] Web search requested but instance not available; initializing with empty API key"
        )
        this.updateToolConfig("webSearch", "")
        webSearchInstance = this.toolInstances.get("webSearch") as AllTools["webSearch"]
      }

      tools.webSearch = webSearchInstance
    }

    // Add bash execution tool only on supported platforms
    if (includeBashExecution && isBashExecSupportedPlatform()) {
      const toolPlugin = toolRegistry.get("bashExecution")
      const effectiveChatId = chatId || ""
      const bashInstance = toolPlugin.createInstance(
        effectiveChatId,
        source
      ) as AllTools["bashExecution"]
      tools.bashExecution = bashInstance
    }

    if (source === "desktop") {
      tools.agentSessionStart = toolRegistry
        .get("agentSessionStart")
        .createInstance("") as AllTools["agentSessionStart"]
      tools.agentSessionRead = toolRegistry
        .get("agentSessionRead")
        .createInstance("") as AllTools["agentSessionRead"]
      tools.agentSessionStop = toolRegistry
        .get("agentSessionStop")
        .createInstance("") as AllTools["agentSessionStop"]
    }

    return tools
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
