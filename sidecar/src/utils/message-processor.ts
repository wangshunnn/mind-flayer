import { convertToModelMessages, pruneMessages, type ToolSet, type UIMessage } from "ai"

/**
 * Convert and prune UI messages for AI model consumption.
 * Removes incomplete tool calls and optimizes message context.
 *
 * @param messages - UI messages from the client
 * @param tools - Optional tools configuration for message conversion
 * @returns Pruned model messages ready for AI SDK
 */
export async function processMessages(messages: UIMessage[], tools: ToolSet = {}) {
  const modelMessages = await convertToModelMessages(messages, {
    tools,
    ignoreIncompleteToolCalls: true
  })

  console.dir({ modelMessages }, { depth: null })

  // Only prune history messages before the last user question
  if (modelMessages.length <= 1) {
    return modelMessages
  }

  // Find the last user message index
  let lastUserIndex = -1
  for (let i = modelMessages.length - 1; i >= 0; i--) {
    if (modelMessages[i].role === "user") {
      lastUserIndex = i
      break
    }
  }

  // If no user message found or it's the first message, return as is
  if (lastUserIndex <= 0) {
    return modelMessages
  }

  // Split: history (up to and including last user msg) and after (tool calls, etc.)
  const historyMessages = modelMessages.slice(0, lastUserIndex + 1)
  const currentMessages = modelMessages.slice(lastUserIndex + 1)

  // Prune only history messages
  const prunedHistory = pruneMessages({
    messages: historyMessages,
    reasoning: "all",
    toolCalls: "all", // Keep all tool calls to preserve approval workflow
    emptyMessages: "remove"
  })

  // Merge pruned history with messages after last user question
  return prunedHistory.concat(currentMessages)
}
