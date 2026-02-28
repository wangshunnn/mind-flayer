import type { Context } from "hono"
import type { ProviderService } from "../services/provider-service"
import { BadRequestError, mapErrorToResponse } from "../utils/http-errors"

const TELEGRAM_PROVIDER_ID = "telegram"
const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org"

interface TelegramApiResponse<T> {
  ok: boolean
  result: T
  description?: string
}

interface TelegramBotInfo {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

/**
 * Test Telegram API connectivity and token validity.
 * Uses getMe so users can verify network/proxy/token configuration with one click.
 */
export async function handleTelegramChannelTest(c: Context, providerService: ProviderService) {
  try {
    const telegramConfig = providerService.getConfig(TELEGRAM_PROVIDER_ID)
    const botToken = telegramConfig?.apiKey?.trim() ?? ""
    const apiBaseUrl = telegramConfig?.baseUrl?.trim() || DEFAULT_TELEGRAM_API_BASE_URL

    if (!botToken) {
      throw new BadRequestError("Telegram bot token is not configured")
    }

    const response = await fetch(`${apiBaseUrl}/bot${botToken}/getMe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(15_000)
    })

    if (!response.ok) {
      throw new Error(`Telegram getMe failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TelegramApiResponse<TelegramBotInfo>
    if (!payload.ok) {
      throw new Error(`Telegram getMe failed: ${payload.description || "unknown error"}`)
    }

    return c.json({
      success: true,
      baseUrl: apiBaseUrl,
      bot: {
        id: payload.result.id,
        firstName: payload.result.first_name,
        username: payload.result.username
      }
    })
  } catch (error) {
    console.error("[sidecar] Telegram channel test error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
