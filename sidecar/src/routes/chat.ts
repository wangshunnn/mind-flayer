import type { UIMessage } from "ai"
import type { Context } from "hono"
import { createStreamResponse } from "../handlers/stream-handler"
import { providerService } from "../services/provider-service"
import { toolService } from "../services/tool-service"
import type { WebSearchMode } from "../type"
import { BadRequestError, mapErrorToResponse, UnauthorizedError } from "../utils/http-errors"
import { buildToolChoice } from "../utils/tool-choice"

/**
 * AI chat streaming route handler.
 * Processes chat requests and returns streaming AI responses.
 */
export async function handleChat(c: Context, globalAbortController: AbortController) {
  try {
    const body = await c.req.json()

    // Extract request parameters
    const provider = (c.req.header("x-model-provider") || body.provider || "minimax").toLowerCase()
    const modelId = c.req.header("x-model-id") || body.model
    const useWebSearch = c.req.header("x-use-web-search") === "true" || body.useWebSearch
    const webSearchMode = (c.req.header("x-web-search-mode") as WebSearchMode) || "auto"
    const chatId = c.req.header("x-chat-id") || body.chatId
    const messages = body?.messages as UIMessage[]

    // Validate request
    if (!modelId) {
      throw new BadRequestError("Model is required")
    }
    if (!messages || !Array.isArray(messages)) {
      throw new BadRequestError("Messages array is required")
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
      modelId,
      useWebSearch,
      webSearchMode,
      chatId
    })

    // Create model instance
    const model = providerService.createModel(provider, modelId)

    // Get tools
    const requestTools = toolService.getRequestTools({ useWebSearch, chatId })

    // Determine tool choice strategy
    const toolChoice = buildToolChoice({
      useWebSearch,
      webSearchMode,
      messages
    })
    console.log("[sidecar] Tool choice:", toolChoice)

    // Combine request abort signal with global abort controller
    const abortSignal = AbortSignal.any([c.req.raw.signal, globalAbortController.signal])

    // Create and return streaming response
    return await createStreamResponse({
      model,
      messages,
      tools: requestTools,
      toolChoice,
      abortSignal
    })
  } catch (error) {
    // Handle abort errors at info level
    if (error instanceof Error && error.name === "AbortError") {
      console.info("[sidecar] Request aborted")
      return c.json({ error: "Request cancelled" }, 400)
    }

    console.error("[sidecar] Chat error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
