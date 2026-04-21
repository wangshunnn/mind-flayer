import {
  AgentSessionReadTool,
  AgentSessionStartTool,
  AgentSessionStopTool,
  agentSessionReadTool,
  agentSessionStartTool,
  agentSessionStopTool
} from "./agent-session"
import { AppendDailyMemoryTool, appendDailyMemoryTool } from "./append-daily-memory"
import { AppendWorkspaceSectionTool, appendWorkspaceSectionTool } from "./append-workspace-section"
import { BashExecutionTool, bashExecutionTool } from "./bash-exec"
import { DeleteWorkspaceFileTool, deleteWorkspaceFileTool } from "./delete-workspace-file"
import { MemoryGetTool, memoryGetTool } from "./memory-get"
import { MemorySearchTool, memorySearchTool } from "./memory-search"
import { ReadTool, readTool } from "./read"
import { ToolRegistry } from "./registry"
import {
  ReplaceWorkspaceSectionTool,
  replaceWorkspaceSectionTool
} from "./replace-workspace-section"
import { WebSearchTool, webSearchTool } from "./web-search"

/**
 * Global tool registry instance.
 * All built-in tools are automatically registered on import.
 */
export const toolRegistry = new ToolRegistry()

// Register built-in tools
toolRegistry.register(new WebSearchTool())
toolRegistry.register(new BashExecutionTool())
toolRegistry.register(new ReadTool())
toolRegistry.register(new AppendWorkspaceSectionTool())
toolRegistry.register(new ReplaceWorkspaceSectionTool())
toolRegistry.register(new AppendDailyMemoryTool())
toolRegistry.register(new DeleteWorkspaceFileTool())
toolRegistry.register(new MemorySearchTool())
toolRegistry.register(new MemoryGetTool())
toolRegistry.register(new AgentSessionStartTool())
toolRegistry.register(new AgentSessionReadTool())
toolRegistry.register(new AgentSessionStopTool())

export type { ITool } from "./base-tool"
// Export types and classes for external use
export { ToolRegistry } from "./registry"

// Keep exporting tool factories for backward compatibility during refactoring
export {
  agentSessionReadTool,
  agentSessionStartTool,
  agentSessionStopTool,
  appendDailyMemoryTool,
  appendWorkspaceSectionTool,
  bashExecutionTool,
  deleteWorkspaceFileTool,
  memoryGetTool,
  memorySearchTool,
  readTool,
  replaceWorkspaceSectionTool,
  webSearchTool
}

// Type for all available tools (used by AI SDK)
export type AllTools = {
  appendWorkspaceSection?: ReturnType<typeof appendWorkspaceSectionTool>
  replaceWorkspaceSection?: ReturnType<typeof replaceWorkspaceSectionTool>
  appendDailyMemory?: ReturnType<typeof appendDailyMemoryTool>
  deleteWorkspaceFile?: ReturnType<typeof deleteWorkspaceFileTool>
  webSearch?: ReturnType<typeof webSearchTool>
  bashExecution?: ReturnType<typeof bashExecutionTool>
  read?: ReturnType<typeof readTool>
  memorySearch?: ReturnType<typeof memorySearchTool>
  memoryGet?: ReturnType<typeof memoryGetTool>
  agentSessionStart?: ReturnType<typeof agentSessionStartTool>
  agentSessionRead?: ReturnType<typeof agentSessionReadTool>
  agentSessionStop?: ReturnType<typeof agentSessionStopTool>
}
