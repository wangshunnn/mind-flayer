import type { LanguageModel } from "ai"
import {
  InvalidToolInputError,
  NoSuchToolError,
  stepCountIs,
  streamText,
  type ToolChoice,
  type ToolSet,
  type UIMessage
} from "ai"
import { processMessages } from "../utils/message-processor"
import { buildSystemPrompt } from "../utils/system-prompt-builder"

/**
 * Options for creating a stream response.
 */
export interface StreamHandlerOptions {
  model: LanguageModel
  messages: UIMessage[]
  tools: ToolSet
  toolChoice: ToolChoice<ToolSet>
  abortSignal: AbortSignal
}

/**
 * Create a streaming AI response with proper error handling.
 * Encapsulates AI SDK streamText call and response formatting.
 *
 * @param options - Stream configuration options
 * @returns Stream response for the client
 */
export async function createStreamResponse(options: StreamHandlerOptions) {
  const { model, messages, tools, toolChoice, abortSignal } = options

  // Process system prompt
  const systemPrompt = buildSystemPrompt()
  console.info("[sidecar] systemPrompt:", systemPrompt)

  // Process and prune messages
  const prunedMessages = await processMessages(messages, tools)
  console.dir({ prunedMessages }, { depth: null })

  // Create streaming response
  const result = streamText({
    model,
    system: systemPrompt,
    messages: prunedMessages,
    tools,
    toolChoice,
    stopWhen: Object.keys(tools).length ? stepCountIs(5) : stepCountIs(1),
    abortSignal
  })

  return result.toUIMessageStreamResponse({
    sendSources: true,
    messageMetadata: ({ part }) => {
      if (part.type === "start") {
        return {
          createdAt: Date.now()
        }
      }
      if (part.type === "finish") {
        return {
          totalUsage: part.totalUsage
        }
      }
    },
    onError: error => {
      console.info("[sidecar] Stream handler caught error:", error)
      // Handle abort as normal control flow
      if (error instanceof Error && error.name === "AbortError") {
        console.info("[sidecar] Request aborted by client or server shutdown")
        return "Request cancelled"
      }
      if (NoSuchToolError.isInstance(error)) {
        return "Error: The model tried to call a unknown tool."
      }
      if (InvalidToolInputError.isInstance(error)) {
        return "Error: The model called a tool with invalid inputs."
      }
      if (error instanceof Error && error.message) {
        return `Error: ${error?.message}`
      }
      return "Error: An unknown error occurred."
    }
  })
}
