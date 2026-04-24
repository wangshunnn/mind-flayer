import {
  convertToModelMessages,
  type ModelMessage,
  pruneMessages,
  type ToolSet,
  type UIMessage
} from "ai"

/** Default number of recent user turns to keep unpruned */
const DEFAULT_WINDOW_SIZE = 3

export interface CompactMessagesOptions {
  pruneAllReasoningAndToolCalls?: boolean
}

function pruneReasoningAndToolCalls(messages: ModelMessage[]) {
  return pruneMessages({
    messages,
    reasoning: "all",
    toolCalls: "all",
    emptyMessages: "remove"
  })
}

/**
 * Find the split index in UIMessages to separate older history from the recent window.
 * Counts user-role messages from the end; the split point is the index of the Nth user message.
 * Everything before this index is "older", everything from this index onward is "recent".
 *
 * @returns The index to split at, or 0 if all messages fall within the window.
 */
export function findWindowSplitIndex(messages: UIMessage[], windowSize: number): number {
  let userCount = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userCount++
      if (userCount === windowSize) {
        return i
      }
    }
  }
  // All messages fall within the window
  return 0
}

/**
 * Convert and prune UI messages for AI model consumption.
 * Uses a sliding window strategy on UIMessage turns:
 * - Recent N user turns (and their assistant replies): kept intact, no pruning.
 * - Older turns: reasoning and tool calls fully pruned to save tokens.
 *
 * @param messages - UI messages from the client
 * @param tools - Optional tools configuration for message conversion
 * @param windowSize - Number of recent user turns to keep unpruned (default: 3)
 * @param options - Provider-specific pruning options
 * @returns Compacted model messages ready for AI SDK
 */
export async function compactMessages(
  messages: UIMessage[],
  tools: ToolSet = {},
  windowSize: number = DEFAULT_WINDOW_SIZE,
  options: CompactMessagesOptions = {}
) {
  if (options.pruneAllReasoningAndToolCalls) {
    const modelMessages = await convertToModelMessages(messages, {
      tools,
      ignoreIncompleteToolCalls: true
    })
    return pruneReasoningAndToolCalls(modelMessages)
  }

  const splitIndex = findWindowSplitIndex(messages, windowSize)

  // If all messages fall within the window, convert directly without pruning
  if (splitIndex === 0) {
    return convertToModelMessages(messages, {
      tools,
      ignoreIncompleteToolCalls: true
    })
  }

  const olderMessages = messages.slice(0, splitIndex)
  const recentMessages = messages.slice(splitIndex)

  // Convert both segments separately to preserve tool-call integrity within each segment
  const [olderModelMessages, recentModelMessages] = await Promise.all([
    convertToModelMessages(olderMessages, { tools, ignoreIncompleteToolCalls: true }),
    convertToModelMessages(recentMessages, { tools, ignoreIncompleteToolCalls: true })
  ])

  // Aggressively prune older history
  const compactedOlderModelMessages = pruneReasoningAndToolCalls(olderModelMessages)

  return compactedOlderModelMessages.concat(recentModelMessages)
}
