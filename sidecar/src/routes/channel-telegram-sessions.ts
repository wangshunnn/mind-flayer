import type { Context } from "hono"
import type { TelegramBotService } from "../services/telegram-bot-service"
import { BadRequestError, mapErrorToResponse } from "../utils/http-errors"

export async function handleTelegramChannelSessions(
  c: Context,
  telegramBotService: TelegramBotService
) {
  try {
    const sessions = telegramBotService.listSessions()
    return c.json({
      success: true,
      sessions
    })
  } catch (error) {
    console.error("[sidecar] Telegram channel sessions error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}

export async function handleTelegramChannelSessionMessages(
  c: Context,
  telegramBotService: TelegramBotService
) {
  try {
    const sessionKey = c.req.query("sessionKey")?.trim() ?? ""
    if (!sessionKey) {
      throw new BadRequestError("Query parameter 'sessionKey' is required")
    }

    const messages = telegramBotService.getSessionMessages(sessionKey)
    if (!messages) {
      return c.json({ error: "Telegram session not found", code: "NOT_FOUND" }, 404)
    }

    return c.json({
      success: true,
      sessionKey,
      messages
    })
  } catch (error) {
    console.error("[sidecar] Telegram channel session messages error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}

export async function handleDeleteTelegramChannelSession(
  c: Context,
  telegramBotService: TelegramBotService
) {
  try {
    const sessionKey = c.req.query("sessionKey")?.trim() ?? ""
    if (!sessionKey) {
      throw new BadRequestError("Query parameter 'sessionKey' is required")
    }

    await telegramBotService.deleteSession(sessionKey)

    return c.json({
      success: true,
      deletedSessionKey: sessionKey
    })
  } catch (error) {
    console.error("[sidecar] Telegram delete session error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
