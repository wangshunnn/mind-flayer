import { generateText } from "ai"
import type { Context } from "hono"
import { providerService } from "../services/provider-service"
import { BadRequestError, mapErrorToResponse, UnauthorizedError } from "../utils/http-errors"

const TITLE_MAX_LENGTH = 20

const TITLE_SYSTEM_PROMPT = `Generate a short, concise title for a conversation based on the first user message.
You are generating a title, not replying to the user.
If the user message is a question, request, or command, convert it into a topic/title instead of answering it.

Rules:
- The title should be in the same language as the user message
- Maximum ${TITLE_MAX_LENGTH} characters
- Prefer a noun phrase or short topic, not a full sentence
- No quotes, no emojis, no markdown
- No punctuation at the end
- Return ONLY the title text, nothing else`

function buildTitlePrompt(messageText: string): string {
  return `First user message for title generation only. Do not answer it.
<user_message>
${messageText}
</user_message>`
}

function sanitizeGeneratedTitle(text: string): string {
  return (
    text
      .trim()
      .split(/\r?\n/u)[0]
      ?.trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "")
      .replace(/[.。!?！？:：;,，、]+$/gu, "")
      .slice(0, TITLE_MAX_LENGTH) ?? ""
  )
}

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
      prompt: buildTitlePrompt(messageText.trim())
    })

    const title = sanitizeGeneratedTitle(result.text)

    return c.json({ title })
  } catch (error) {
    console.error("[sidecar] Title generation error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
