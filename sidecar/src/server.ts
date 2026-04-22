import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { ProxyAgent, setGlobalDispatcher } from "undici"
import { createCorsMiddleware } from "./middleware/cors"
import { errorHandler } from "./middleware/error-handler"
import { registerRoutes } from "./routes"
import { agentSessionService } from "./services/agent-session-service"
import { ChannelRuntimeConfigService } from "./services/channel-runtime-config-service"
import { providerService } from "./services/provider-service"
import { TelegramBotService } from "./services/telegram-bot-service"
import { createTelegramSessionStoreFromEnv } from "./services/telegram-session-store"
import { toolService } from "./services/tool-service"
import { cleanupTransientSandboxes } from "./tools/bash-exec/sandbox"
import type { ConfigUpdateMessage } from "./type"
import { createShutdownHandler, setupStdinListener } from "./utils/lifecycle"
import { getConfiguredProxyUrl } from "./utils/proxy-url"

function setupGlobalProxyIfConfigured() {
  const { rawProxyUrl, proxyUrl } = getConfiguredProxyUrl()

  if (!proxyUrl) {
    return
  }

  try {
    const dispatcher = new ProxyAgent(proxyUrl)
    setGlobalDispatcher(dispatcher)

    if (rawProxyUrl !== proxyUrl) {
      console.log(`[sidecar] Normalized proxy URL: ${rawProxyUrl} -> ${proxyUrl}`)
    }

    console.log(`[sidecar] Global HTTP proxy enabled: ${proxyUrl}`)
  } catch (error) {
    console.error("[sidecar] Failed to initialize proxy agent:", error)
    console.error(
      `[sidecar] Invalid proxy configuration: ${rawProxyUrl}. Use a full URL like http://127.0.0.1:7897.`
    )
  }
}

export const normalizeErrorMessage = (message: string): string =>
  message.replace(/\s+/g, " ").trim()

export async function startSidecar() {
  setupGlobalProxyIfConfigured()

  const app = new Hono()
  // Use the SIDECAR_PORT environment variable set by the Rust sidecar setup
  const PORT = process.env.SIDECAR_PORT
  const globalAbortController = new AbortController()
  const channelRuntimeConfigService = new ChannelRuntimeConfigService()
  const telegramSessionStore = createTelegramSessionStoreFromEnv()
  const telegramBotService = new TelegramBotService(
    providerService,
    toolService,
    channelRuntimeConfigService,
    telegramSessionStore
  )

  await telegramBotService.initialize()

  // Register middleware
  app.use(createCorsMiddleware())
  app.use(errorHandler)

  // Register routes
  registerRoutes(
    app,
    globalAbortController,
    channelRuntimeConfigService,
    telegramBotService,
    providerService
  )

  // Start server
  const server = serve(
    {
      fetch: app.fetch,
      port: Number(PORT)
    },
    () => {
      console.log(`Sidecar running on http://localhost:${PORT}`)
      console.log(`API endpoint: http://localhost:${PORT}/api/chat`)
    }
  )

  server.on("error", (error: NodeJS.ErrnoException) => {
    const code = String(error.code ?? "UNKNOWN")
    const message = normalizeErrorMessage(error.message || String(error))
    console.error(`[sidecar] BIND_ERROR code=${code} message=${message}`)
    process.exit(1)
  })

  // Setup stdin listener for config updates
  setupStdinListener((message: unknown) => {
    const configMessage = message as ConfigUpdateMessage
    const lastParallelApiKey = providerService.getConfig("parallel")?.apiKey ?? ""
    const newParallelApiKey = configMessage.configs.parallel?.apiKey ?? ""

    if (lastParallelApiKey !== newParallelApiKey) {
      console.log("[sidecar] Parallel API key updated, refreshing web search tool")
      toolService.updateToolConfig("webSearch", newParallelApiKey)
    }

    providerService.updateConfigs(configMessage)
    void telegramBotService.refresh()
  })

  // Register shutdown handlers
  const shutdown = createShutdownHandler(globalAbortController, server, async () => {
    await agentSessionService.stopAll()
    await telegramBotService.stop()
    await cleanupTransientSandboxes()
  })
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
  process.on("exit", () => {
    console.log("Sidecar process exiting...")
  })
}
