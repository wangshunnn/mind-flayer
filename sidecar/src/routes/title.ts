import { generateText } from "ai"
import type { Context } from "hono"
import { providerService } from "../services/provider-service"
import { BadRequestError, mapErrorToResponse, UnauthorizedError } from "../utils/http-errors"

const TITLE_SYSTEM_PROMPT = `Generate a short, concise title for a conversation that starts with the following user message.
Rules:
- The title should be in the same language as the user message
- Maximum 20 characters
- No quotes, no punctuation at the end
- Return ONLY the title text, nothing else`

const TITLE_MAX_LENGTH = 50

/**
 * Generate a chat title using LLM.
 * Uses generateText (non-streaming) to produce a concise title from the user message.
 */
export async function handleTitleGenerator(c: Context) {
  try {
    const body = await c.req.json()

    const provider = (c.req.header("x-model-provider") || body.provider || "minimax").toLowerCase()
    const modelId = c.req.header("x-model-id") || body.model
    const messageText = body?.messageText as string

    if (!modelId) {
      throw new BadRequestError("Model is required")
    }
    if (!messageText || typeof messageText !== "string" || !messageText.trim()) {
      throw new BadRequestError("messageText is required")
    }

    if (!providerService.hasConfig(provider)) {
      throw new UnauthorizedError(
        `Please configure your ${provider} API key in settings`,
        "API_KEY_NOT_CONFIGURED"
      )
    }

    const model = providerService.createModel(provider, modelId)

    const result = await generateText({
      model,
      system: TITLE_SYSTEM_PROMPT,
      prompt: messageText.trim()
    })

    let title = result.text.trim()
    if (title.length > TITLE_MAX_LENGTH) {
      title = `${title.substring(0, TITLE_MAX_LENGTH)}...`
    }

    return c.json({ title })
  } catch (error) {
    console.error("[sidecar] Title generation error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
