import type { ToolUIPart } from "ai"
import type { useToolConstants } from "@/lib/constants"

/**
 * Get the display text for a tool's current state
 */
export function getToolResultText(
  tool: {
    type: string
    state?: ToolUIPart["state"]
    output?: { totalResults?: number; [key: string]: unknown }
  },
  toolConstants: ReturnType<typeof useToolConstants>
): string {
  const { states, webSearch } = toolConstants
  const isWebSearch = tool.type === "tool-webSearch"

  switch (tool.state) {
    case "output-available": {
      if (tool.output) {
        if (isWebSearch && tool.output.totalResults !== undefined) {
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
      return isWebSearch ? webSearch.searching : states.running
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
