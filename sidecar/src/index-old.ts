import { serve } from "@hono/node-server"
import { InvalidToolInputError, NoSuchToolError, stepCountIs, streamText, type UIMessage } from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { devOrigins, prodOrigins } from "./config/constants"
import { providerService } from "./services/provider-service"
import { toolService } from "./services/tool-service"
import type { ConfigUpdateMessage, WebSearchMode } from "./type"
import { processMessages } from "./utils/message-processing"
import { buildToolChoice } from "./utils/tool-choice"

// if you need to use a proxy, uncomment the following lines
// import { ProxyAgent, setGlobalDispatcher } from "undici"
// const proxy = "http://127.0.0.1:7890" // Set to your actual proxy port
// const dispatcher = new ProxyAgent(proxy)
// setGlobalDispatcher(dispatcher)

const app = new Hono()
const PORT = process.env.PORT || 3737
const isDev = process.env.NODE_ENV !== "production"
const globalAbortController = new AbortController()

// Configure environment-aware CORS
app.use(
  cors({
    origin: origin => {
      if (!origin) {
        // Non-browser request (e.g., curl)
        return "*"
      }
      if (isDev && devOrigins.has(origin)) {
        return origin
      }
      if (!isDev && prodOrigins.has(origin)) {
        return origin
      }
      // Disallow other origins
      return ""
    }
  })
)

// Health check endpoint
app.get("/health", c => {
  return c.json({ status: "ok", version: "0.1.0" })
})

// AI streaming chat endpoint
app.post("/api/chat", async c => {
  try {
    const body = await c.req.json()

    // Get provider from header or body (default to minimax) - normalize to lowercase
    const provider = (
      c.req.header("x-model-provider") ||
      body.provider ||
      "minimax"
    ).toLowerCase() as string
    const modelId = c.req.header("x-model-id") || body.model
    const useWebSearch = c.req.header("x-use-web-search") === "true" || body.useWebSearch
    const webSearchMode = (c.req.header("x-web-search-mode") as WebSearchMode) || "auto"
    const messages = body?.messages as UIMessage[]

    if (!modelId) {
      return c.json({ error: "Model is required" }, 400)
    }
    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: "Messages array is required" }, 401)
    }

    if (!providerService.hasConfig(provider)) {
      console.error(`[sidecar] API key not found for provider: ${provider}`)
      return c.json(
        {
          error: "API key not configured",
          provider,
          message: `Please configure your ${provider} API key in settings`
        },
        402
      )
    }

    console.log("[sidecar] /api/chat", {
      provider,
      modelId,
      useWebSearch,
      webSearchMode
    })

    const model = providerService.createModel(provider, modelId)

    /** Tools */
    const requestTools = toolService.getRequestTools({ useWebSearch })

    /** Tool choice strategy */
    const toolChoice = buildToolChoice({
      useWebSearch,
      webSearchMode,
      messages
    })

    /** Messages */
    const prunedMessages = await processMessages(messages, requestTools)
    console.dir({ prunedMessages }, { depth: null })

    // Combine request abort signal with global abort controller
    const abortSignal = AbortSignal.any([c.req.raw.signal, globalAbortController.signal])

    const result = streamText({
      model,
      messages: prunedMessages,
      tools: requestTools,
      toolChoice,
      stopWhen: Object.keys(requestTools).length ? stepCountIs(5) : stepCountIs(1),
      abortSignal
    })

    return result.toUIMessageStreamResponse({
      sendSources: true,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return {
            createdAt: Date.now()
          }
        }
        if (part.type === "finish") {
          return {
            totalUsage: part.totalUsage
          }
        }
      },
      onError: error => {
        // Handle abort as normal control flow
        if (error instanceof Error && error.name === "AbortError") {
          console.info("[sidecar] Request aborted by client or server shutdown")
          return "Request cancelled"
        }
        if (NoSuchToolError.isInstance(error)) {
          return "Error: The model tried to call a unknown tool."
        }
        if (InvalidToolInputError.isInstance(error)) {
          return "Error: The model called a tool with invalid inputs."
        }
        if (error instanceof Error && error.message) {
          return `Error: ${error?.message}`
        }
        return "Error: An unknown error occurred."
      }
    })
  } catch (error) {
    // Handle abort errors at info level
    if (error instanceof Error && error.name === "AbortError") {
      console.info("[sidecar] Request aborted")
      return c.json({ error: "Request cancelled" }, 400)
    }
    console.error("[sidecar] Chat error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return c.json({ error: errorMessage }, 500)
  }
})

const server = serve({
  fetch: app.fetch,
  port: Number(PORT)
})

console.log(`Sidecar running on http://localhost:${PORT}`)
console.log(`API endpoint: http://localhost:${PORT}/api/chat`)

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down gracefully...")

  // Abort all active AI requests
  globalAbortController.abort()
  console.info("[sidecar] All active requests cancelled")

  server.close(() => {
    console.log("Server closed, port released")
    process.exit(0)
  })

  // Force exit if server doesn't close within 5 seconds
  setTimeout(() => {
    console.error("Forced shutdown")
    process.exit(1)
  }, 5000)
}

// Listen to stdin for configuration updates from Tauri
process.stdin.setEncoding("utf8")

process.stdin.on("data", (data: string) => {
  try {
    console.log("[sidecar] Received stdin data:", data.substring(0, 200)) // Log first 200 chars
    const lines = data.trim().split("\n")
    for (const line of lines) {
      if (!line.trim()) continue

      const message = JSON.parse(line) as ConfigUpdateMessage
      console.log("[sidecar] Parsed message type:", message.type)

      if (message.type === "config_update" && message.configs) {
        const lastParallelApiKey = providerService.getConfig("parallel")?.apiKey ?? ""
        const newParallelApiKey = message.configs.parallel?.apiKey ?? ""

        if (lastParallelApiKey !== newParallelApiKey) {
          console.log("[sidecar] Parallel API key updated, refreshing web search tool")
          toolService.updateToolConfig("webSearch", newParallelApiKey)
        }

        providerService.updateConfigs(message)
      }
    }
  } catch (error) {
    console.error("[sidecar] Error parsing stdin message:", error)
  }
})

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
process.on("exit", () => {
  console.log("Sidecar process exiting...")
})
