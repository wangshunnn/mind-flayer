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

// Determine if tool is in progress
export const isToolUIPartInProgress = (part: ToolUIPart | DynamicToolUIPart): boolean =>
  part.state === "input-streaming" ||
  part.state === "input-available" ||
  part.state === "approval-requested" ||
  part.state === "approval-responded"

export const isWebSearchToolUIPart = (
  tool: ToolUIPart | DynamicToolUIPart
): tool is ToolWebSearch => tool.type === "tool-webSearch"

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
