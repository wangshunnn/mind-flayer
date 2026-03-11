import type { DynamicToolUIPart, ToolUIPart } from "ai"
import type { useToolConstants } from "@/lib/constants"

export type ToolWebSearch = ToolUIPart & {
  input?: {
    objective: string
    searchQueries: string[]
    maxResults?: number
  }
  output?: {
    totalResults?: number
    searchedAt?: string
    result?: { title: string; url: string; snippet: string; publish_date: string }[]
  }
}

export type ToolBashExecution = ToolUIPart & {
  input?: {
    command: string
    args: string[]
  }
  output?: {
    command: string
    args: string[]
    stdout: string
    stderr: string
    exitCode: number
    workingDir: string
    executedAt: string
    timedOut?: boolean
  }
}

export type ToolRead = ToolUIPart & {
  input?: {
    filePath: string
    offset?: number
  }
  output?: {
    filePath: string
    content: string
    offset: number
    nextOffset: number | null
    truncated: boolean
  }
}

// Determine if tool is in progress
export const isToolUIPartInProgress = (part: ToolUIPart | DynamicToolUIPart): boolean =>
  part.state === "input-streaming" ||
  part.state === "input-available" ||
  part.state === "approval-requested" ||
  part.state === "approval-responded"

export const isWebSearchToolUIPart = (
  tool: ToolUIPart | DynamicToolUIPart
): tool is ToolWebSearch => tool.type === "tool-webSearch"

export const isBashExecutionToolUIPart = (
  tool: ToolUIPart | DynamicToolUIPart
): tool is ToolBashExecution => tool.type === "tool-bashExecution"

export const isReadToolUIPart = (tool: ToolUIPart | DynamicToolUIPart): tool is ToolRead =>
  tool.type === "tool-read"

export function getToolInputMeta(
  tool: ToolUIPart | DynamicToolUIPart
): { content?: string } | null {
  if (isWebSearchToolUIPart(tool) && tool.input) {
    return { content: (isWebSearchToolUIPart(tool) && tool.input?.objective) || "" }
  }
  if (isBashExecutionToolUIPart(tool) && tool.input) {
    return {
      content: `Command: ${tool.input.command} ${tool.input.args?.join(" ")}`
    }
  }
  if (isReadToolUIPart(tool) && tool.input) {
    const offset = typeof tool.input.offset === "number" ? ` (offset ${tool.input.offset})` : ""
    return {
      content: `Read: ${tool.input.filePath}${offset}`
    }
  }
  return null
}

/**
 * Get the display text for a tool's current state
 */
export function getToolResultText(
  tool: ToolUIPart | DynamicToolUIPart,
  toolConstants: ReturnType<typeof useToolConstants>
): string {
  const { states, webSearch } = toolConstants

  switch (tool.state) {
    case "output-available": {
      if (tool.output) {
        if (isWebSearchToolUIPart(tool) && tool.output.totalResults !== undefined) {
          return webSearch.searchedResults(tool.output.totalResults)
        }
        if (isBashExecutionToolUIPart(tool) && tool.output.exitCode !== undefined) {
          return `Exited with code ${tool.output.exitCode}`
        }
        if (isReadToolUIPart(tool) && typeof tool.output.filePath === "string") {
          return tool.output.truncated
            ? `Read chunk, next offset ${tool.output.nextOffset}`
            : "Read complete"
        }

        return states.done
      }
      break
    }
    case "output-error": {
      return states.failed
    }
    case "output-denied": {
      return states.cancelled
    }
    case "input-streaming":
    case "input-available": {
      return isWebSearchToolUIPart(tool) ? webSearch.searching : states.running
    }
    case "approval-requested": {
      return states.awaitingApproval
    }
    default: {
      return states.running
    }
  }

  return states.running
}
