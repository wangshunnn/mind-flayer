import type { UIMessage } from "ai"
import type { Context } from "hono"
import { contextStateSchema, uiMessagesSchema } from "../../../shared/context"
import {
  compactConversation,
  createStreamResponse,
  estimateConversationUsage
} from "../handlers/stream-handler"
import type { ChannelRuntimeConfigService } from "../services/channel-runtime-config-service"
import { providerService } from "../services/provider-service"
import { toolService } from "../services/tool-service"
import type { WebSearchMode } from "../type"
import { BadRequestError, mapErrorToResponse, UnauthorizedError } from "../utils/http-errors"
import { buildToolChoice } from "../utils/tool-choice"

/**
 * AI chat streaming route handler.
 * Processes chat requests and returns streaming AI responses.
 */
export async function handleChat(
  c: Context,
  globalAbortController: AbortController,
  channelRuntimeConfigService: ChannelRuntimeConfigService
) {
  try {
    const body = await c.req.json()

    // Extract request parameters
    const provider = (c.req.header("x-model-provider") || body.provider || "minimax").toLowerCase()
    const modelProviderLabelHeader = c.req.header("x-model-provider-label")
    const modelProviderLabelBody =
      typeof body.modelProviderLabel === "string" ? body.modelProviderLabel : undefined
    const modelProviderLabel =
      (modelProviderLabelHeader || modelProviderLabelBody)?.trim() || undefined
    const modelId = c.req.header("x-model-id") || body.model
    const modelLabelHeader = c.req.header("x-model-label")
    const modelLabelBody = typeof body.modelLabel === "string" ? body.modelLabel : undefined
    const modelLabel = (modelLabelHeader || modelLabelBody)?.trim() || undefined
    const useWebSearch = c.req.header("x-use-web-search") === "true" || body.useWebSearch
    const webSearchMode = (c.req.header("x-web-search-mode") as WebSearchMode) || "auto"
    const reasoningEnabled =
      c.req.header("x-reasoning-enabled") === "true" || body.reasoningEnabled === true
    const reasoningEffort = (c.req.header("x-reasoning-effort") ||
      body.reasoningEffort ||
      "default") as "default" | "low" | "medium" | "high" | "xhigh"
    const chatId = c.req.header("x-chat-id") || body.chatId
    const parsedMessages = uiMessagesSchema.safeParse(body?.messages)
    if (!parsedMessages.success) {
      throw new BadRequestError("Invalid conversation messages")
    }
    const messages = parsedMessages.data
    const parsedContext = contextStateSchema.optional().safeParse(body.contextState)
    if (!parsedContext.success) {
      throw new BadRequestError("Invalid context state")
    }
    if (typeof chatId !== "string" || !chatId) {
      throw new BadRequestError("Chat ID is required")
    }

    // Validate request
    if (!modelId) {
      throw new BadRequestError("Model is required")
    }
    if (!messages || !Array.isArray(messages)) {
      throw new BadRequestError("Messages array is required")
    }

    const requestTools = toolService.getRequestTools({ useWebSearch, chatId })
    const toolChoice = buildToolChoice({ useWebSearch, webSearchMode, messages })
    const abortSignal = AbortSignal.any([c.req.raw.signal, globalAbortController.signal])

    // Usage inspection is local and must also work for unconfigured or retired providers.
    if (c.req.path.endsWith("/context-usage")) {
      return c.json({
        usage: await estimateConversationUsage({
          chatId,
          modelProvider: provider,
          modelProviderLabel,
          modelId,
          modelLabel,
          messages,
          contextState: parsedContext.data,
          tools: requestTools,
          toolChoice,
          abortSignal,
          reasoningEnabled,
          reasoningEffort,
          disabledSkillIds: channelRuntimeConfigService.getDisabledSkillIds()
        })
      })
    }

    // Check provider configuration
    if (!providerService.hasConfig(provider)) {
      console.error(`[sidecar] API key not found for provider: ${provider}`)
      throw new UnauthorizedError(
        `Please configure your ${provider} API key in settings`,
        "API_KEY_NOT_CONFIGURED"
      )
    }

    console.log("[sidecar] /api/chat", {
      provider,
      modelProviderLabel,
      modelId,
      modelLabel,
      useWebSearch,
      webSearchMode,
      reasoningEnabled,
      reasoningEffort,
      chatId
    })

    const shouldReplayDeepSeekReasoning =
      provider === "deepseek" && modelId.startsWith("deepseek-v4") && reasoningEnabled

    // Create model instance
    const model = providerService.createModel(provider, modelId, {
      ...(shouldReplayDeepSeekReasoning ? { deepSeekReasoningReplayMessages: messages } : {})
    })

    // Create and return streaming response
    const options = {
      chatId,
      contextState: parsedContext.data,
      createModel: (replayMessages: UIMessage[]) =>
        providerService.createModel(provider, modelId, {
          ...(shouldReplayDeepSeekReasoning
            ? { deepSeekReasoningReplayMessages: replayMessages }
            : {})
        }),
      model,
      modelProvider: provider,
      modelProviderLabel,
      modelId,
      modelLabel,
      messages,
      tools: requestTools,
      toolChoice,
      abortSignal,
      reasoningEnabled,
      reasoningEffort,
      disabledSkillIds: channelRuntimeConfigService.getDisabledSkillIds()
    }
    if (c.req.path.endsWith("/compact")) {
      return c.json(
        await compactConversation(
          options,
          typeof body.instructions === "string" ? body.instructions : undefined
        )
      )
    }
    return await createStreamResponse(options)
  } catch (error) {
    // Handle abort errors at info level
    if (error instanceof Error && error.name === "AbortError") {
      console.info("[sidecar] Request aborted")
      return c.json({ error: "Request cancelled" }, 400)
    }

    if (error instanceof Error && error.message === "CONVERSATION_BUSY") {
      return c.json({ error: "CONVERSATION_BUSY" }, 409)
    }
    console.error("[sidecar] Chat error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
