import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { createCorsMiddleware } from "./middleware/cors"
import { errorHandler } from "./middleware/error-handler"
import { registerRoutes } from "./routes"
import { providerService } from "./services/provider-service"
import { toolService } from "./services/tool-service"
import type { ConfigUpdateMessage } from "./type"
import { createShutdownHandler, setupStdinListener } from "./utils/lifecycle"

// if you need to use a proxy, uncomment the following lines
// import { ProxyAgent, setGlobalDispatcher } from "undici"
// const proxy = "http://127.0.0.1:7890" // Set to your actual proxy port
// const dispatcher = new ProxyAgent(proxy)
// setGlobalDispatcher(dispatcher)

const app = new Hono()
const PORT = process.env.PORT || 3737
const isDev = process.env.NODE_ENV !== "production"
const globalAbortController = new AbortController()

// Register middleware
app.use(createCorsMiddleware(isDev))
app.use(errorHandler)

// Register routes
registerRoutes(app, globalAbortController)

// Start server
const server = serve({
  fetch: app.fetch,
  port: Number(PORT)
})

console.log(`Sidecar running on http://localhost:${PORT}`)
console.log(`API endpoint: http://localhost:${PORT}/api/chat`)

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
})

// Register shutdown handlers
const shutdown = createShutdownHandler(globalAbortController, server)
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
process.on("exit", () => {
  console.log("Sidecar process exiting...")
})
