import type { Context } from "hono"
import { z } from "zod"
import type { ChannelRuntimeConfigService } from "../services/channel-runtime-config-service"
import type { TelegramBotService } from "../services/telegram-bot-service"
import { BadRequestError, mapErrorToResponse } from "../utils/http-errors"

const selectedModelSchema = z.object({
  provider: z.string().trim().min(1),
  modelId: z.string().trim().min(1)
})

const channelRuntimeConfigSchema = z.object({
  selectedModel: selectedModelSchema.nullable(),
  channels: z.object({
    telegram: z.object({
      enabled: z.boolean(),
      allowedUserIds: z.array(z.string().trim().regex(/^\d+$/))
    })
  }),
  disabledSkills: z.array(z.string().trim().min(1)).optional()
})

/**
 * Runtime config endpoint used by the desktop frontend to sync selected model,
 * channel enablement, and skill availability switches.
 */
export async function handleChannelRuntimeConfig(
  c: Context,
  channelRuntimeConfigService: ChannelRuntimeConfigService,
  telegramBotService: TelegramBotService
) {
  try {
    const body = await c.req.json()
    const parseResult = channelRuntimeConfigSchema.safeParse(body)

    if (!parseResult.success) {
      throw new BadRequestError("Invalid channel runtime config payload")
    }

    channelRuntimeConfigService.update(parseResult.data)
    await telegramBotService.refresh()

    return c.json({
      success: true
    })
  } catch (error) {
    console.error("[sidecar] Channel runtime config error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
