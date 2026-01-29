import type { ToolChoice, UIMessage } from "ai"
import type { AllTools } from "../tools"
import type { WebSearchMode } from "../type"

/**
 * Build tool choice strategy based on web search configuration and conversation state.
 *
 * @param options - Configuration options
 * @param options.useWebSearch - Whether web search is enabled
 * @param options.webSearchMode - Web search mode: "auto" or "always"
 * @param options.messages - Current conversation messages
 * @returns Tool choice strategy for AI SDK
 */
export function buildToolChoice(options: {
  useWebSearch: boolean
  webSearchMode: WebSearchMode
  messages: UIMessage[]
}): ToolChoice<AllTools> {
  const { useWebSearch, webSearchMode, messages } = options

  if (useWebSearch && webSearchMode === "always") {
    const isUserFirstAsking = messages.at(-1)?.role === "user"
    if (isUserFirstAsking) {
      return { type: "tool", toolName: "webSearch" }
    }
  }
  return "auto"
}
