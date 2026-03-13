import type { Hono } from "hono"
import type { ChannelRuntimeConfigService } from "../services/channel-runtime-config-service"
import type { ProviderService } from "../services/provider-service"
import type { TelegramBotService } from "../services/telegram-bot-service"
import { handleChannelRuntimeConfig } from "./channel-runtime-config"
import {
  handleTelegramChannelSessionMessages,
  handleTelegramChannelSessions
} from "./channel-telegram-sessions"
import { handleTelegramChannelTest } from "./channel-telegram-test"
import {
  handleTelegramWhitelistRequestDecision,
  handleTelegramWhitelistRequests
} from "./channel-telegram-whitelist-requests"
import { handleChat } from "./chat"
import { handleCleanupWorkspace } from "./cleanup"
import { handleHealth } from "./health"
import { handleLocalImage } from "./local-image"
import { handleDeleteSkill, handleGetSkillDetail, handleListSkills } from "./skills"
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
  app.post("/api/chat", c => handleChat(c, globalAbortController, channelRuntimeConfigService))

  // Chat title generation endpoint
  app.post("/api/title", handleTitleGenerator)

  // Local image proxy endpoint
  app.get("/api/local-image", handleLocalImage)

  // Workspace cleanup endpoint
  app.post("/api/cleanup-workspace", handleCleanupWorkspace)

  // Skills management endpoints
  app.get("/api/skills", handleListSkills)
  app.get("/api/skills/:skillId", handleGetSkillDetail)
  app.delete("/api/skills/:skillId", handleDeleteSkill)

  // Runtime config endpoint for channel services
  app.post("/api/channel-runtime-config", c =>
    handleChannelRuntimeConfig(c, channelRuntimeConfigService, telegramBotService)
  )

  // Telegram test endpoint (connectivity + token check)
  app.post("/api/channels/telegram/test", c => handleTelegramChannelTest(c, providerService))

  // Telegram channel session debug endpoints
  app.get("/api/channels/telegram/sessions", c =>
    handleTelegramChannelSessions(c, telegramBotService)
  )
  app.get("/api/channels/telegram/session-messages", c =>
    handleTelegramChannelSessionMessages(c, telegramBotService)
  )

  // Telegram whitelist approval endpoints
  app.get("/api/channels/telegram/whitelist-requests", c =>
    handleTelegramWhitelistRequests(c, telegramBotService)
  )
  app.post("/api/channels/telegram/whitelist-requests/decision", c =>
    handleTelegramWhitelistRequestDecision(c, telegramBotService)
  )
}
