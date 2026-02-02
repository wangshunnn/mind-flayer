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

  const prunedMessages = pruneMessages({
    messages: modelMessages,
    reasoning: "all",
    toolCalls: "before-last-1-messages",
    emptyMessages: "remove"
  })

  return prunedMessages
}
