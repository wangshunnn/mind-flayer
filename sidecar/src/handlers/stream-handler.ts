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
import { discoverSkillsSafely, filterDisabledSkills } from "../skills/catalog"
import type { ReasoningEffort } from "../type"
import { processMessages } from "../utils/message-processor"
import { buildProviderOptions } from "../utils/provider-options"
import { buildSystemPrompt } from "../utils/system-prompt-builder"

/**
 * Options for creating a stream response.
 */
export interface StreamHandlerOptions {
  model: LanguageModel
  modelProvider: string
  modelId: string
  messages: UIMessage[]
  tools: ToolSet
  toolChoice: ToolChoice<ToolSet>
  abortSignal: AbortSignal
  reasoningEnabled: boolean
  reasoningEffort: ReasoningEffort
  disabledSkillIds?: string[]
}

/**
 * Create a streaming AI response with proper error handling.
 * Encapsulates AI SDK streamText call and response formatting.
 *
 * @param options - Stream configuration options
 * @returns Stream response for the client
 */
export async function createStreamResponse(options: StreamHandlerOptions) {
  const {
    model,
    modelProvider,
    modelId,
    messages,
    tools,
    toolChoice,
    abortSignal,
    reasoningEnabled,
    reasoningEffort
  } = options

  const [skills, prunedMessages] = await Promise.all([
    discoverSkillsSafely("stream request"),
    processMessages(messages, tools)
  ])
  const enabledSkills = filterDisabledSkills(skills, options.disabledSkillIds ?? [])
  const systemPrompt = buildSystemPrompt({ modelProvider, modelId, skills: enabledSkills })
  console.info("[sidecar] systemPrompt:", systemPrompt)
  console.dir({ prunedMessages }, { depth: null })

  const providerOptions = buildProviderOptions({
    modelProvider,
    modelId,
    reasoningEnabled,
    reasoningEffort
  })

  // Create streaming response
  const result = streamText({
    model,
    system: systemPrompt,
    messages: prunedMessages,
    tools,
    toolChoice,
    stopWhen: Object.keys(tools).length ? stepCountIs(20) : stepCountIs(1),
    abortSignal,
    providerOptions
  })

  return result.toUIMessageStreamResponse({
    sendSources: true,
    messageMetadata: ({ part }) => {
      if (part.type === "start") {
        return {
          createdAt: Date.now(),
          modelProvider,
          modelId
        }
      }
      if (part.type === "finish") {
        return {
          totalUsage: part.totalUsage,
          modelProvider,
          modelId
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
