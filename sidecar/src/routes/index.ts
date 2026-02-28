import type { Hono } from "hono"
import type { ChannelRuntimeConfigService } from "../services/channel-runtime-config-service"
import type { ProviderService } from "../services/provider-service"
import type { TelegramBotService } from "../services/telegram-bot-service"
import { handleChannelRuntimeConfig } from "./channel-runtime-config"
import { handleTelegramChannelTest } from "./channel-telegram-test"
import { handleChat } from "./chat"
import { handleCleanupWorkspace } from "./cleanup"
import { handleHealth } from "./health"
import { handleLocalImage } from "./local-image"
import { handleTitleGenerator } from "./title"

/**
 * Register all application routes.
 *
 * @param app - Hono application instance
 * @param globalAbortController - Global abort controller for shutdown
 */
export function registerRoutes(
  app: Hono,
  globalAbortController: AbortController,
  channelRuntimeConfigService: ChannelRuntimeConfigService,
  telegramBotService: TelegramBotService,
  providerService: ProviderService
) {
  // Health check endpoint
  app.get("/health", handleHealth)

  // AI streaming chat endpoint
  app.post("/api/chat", c => handleChat(c, globalAbortController))

  // Chat title generation endpoint
  app.post("/api/title", handleTitleGenerator)

  // Local image proxy endpoint
  app.get("/api/local-image", handleLocalImage)

  // Workspace cleanup endpoint
  app.post("/api/cleanup-workspace", handleCleanupWorkspace)

  // Runtime config endpoint for channel services
  app.post("/api/channel-runtime-config", c =>
    handleChannelRuntimeConfig(c, channelRuntimeConfigService, telegramBotService)
  )

  // Telegram test endpoint (connectivity + token check)
  app.post("/api/channels/telegram/test", c => handleTelegramChannelTest(c, providerService))
}
