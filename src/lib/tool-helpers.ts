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
