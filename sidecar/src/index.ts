import { serve } from "@hono/node-server"
import {
  convertToModelMessages,
  InvalidToolInputError,
  NoSuchToolError,
  pruneMessages,
  stepCountIs,
  streamText,
  type ToolChoice,
  type UIMessage
} from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { createMinimax } from "vercel-minimax-ai-provider"
import { type AllTools, webSearchTool } from "./tools"
import type { ProviderConfig, WebSearchMode } from "./type"

// if you need to use a proxy, uncomment the following lines
// import { ProxyAgent, setGlobalDispatcher } from "undici"
// const proxy = "http://127.0.0.1:7890" // Set to your actual proxy port
// const dispatcher = new ProxyAgent(proxy)
// setGlobalDispatcher(dispatcher)

const MODEL_PROVIDERS = {
  minimax: {
    defaultBaseUrl: "https://api.minimaxi.com/anthropic/v1"
  }
}
const apiKeyCache = new Map<string, ProviderConfig>()
const allTools: AllTools = {
  webSearch: webSearchTool("")
}

// Listen to stdin for configuration updates from Tauri
process.stdin.setEncoding("utf8")
process.stdin.on("data", (data: string) => {
  try {
    console.log("[sidecar] Received stdin data:", data.substring(0, 200)) // Log first 200 chars
    const lines = data.trim().split("\n")
    for (const line of lines) {
      if (!line.trim()) continue

      const message = JSON.parse(line)
      console.log("[sidecar] Parsed message type:", message.type)

      if (message.type === "config_update" && message.configs) {
        const lastParallelApiKey = apiKeyCache.get("parallel")?.apiKey ?? ""
        const newParallelApiKey = message.configs.parallel?.apiKey ?? ""

        if (lastParallelApiKey !== newParallelApiKey) {
          console.log("[sidecar] Parallel API key updated, refreshing web search tool")
          allTools.webSearch = webSearchTool(newParallelApiKey)
        }

        apiKeyCache.clear()
        for (const [provider, config] of Object.entries(message.configs) as [
          string,
          ProviderConfig
        ][]) {
          apiKeyCache.set(provider, config)
        }
      }
    }
  } catch (error) {
    console.error("[sidecar] Error parsing stdin message:", error)
  }
})

const app = new Hono()
const PORT = process.env.PORT || 3737
const isDev = process.env.NODE_ENV !== "production"
const globalAbortController = new AbortController()

const devOrigins = new Set([
  "http://localhost:1420" // tauri dev
])

const prodOrigins = new Set([
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost"
])

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
    ).toLowerCase() as keyof typeof MODEL_PROVIDERS
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

    const providerConfig = apiKeyCache.get(provider)
    if (!providerConfig) {
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

    const apiKey = providerConfig.apiKey
    const baseUrl = providerConfig.baseUrl || MODEL_PROVIDERS[provider]?.defaultBaseUrl || ""

    console.log("[sidecar] /api/chat", {
      provider,
      modelId,
      baseUrl,
      useWebSearch,
      webSearchMode
    })

    const minimax = createMinimax({
      baseURL: baseUrl,
      apiKey
    })

    /** Tools */
    let toolChoice: ToolChoice<AllTools> = "auto"

    if (useWebSearch) {
      if (!allTools.webSearch) {
        allTools.webSearch = webSearchTool(apiKeyCache.get("parallel")?.apiKey ?? "")
      }
      if (webSearchMode === "always") {
        const isUserFirstAsking = messages.at(-1)?.role === "user"
        if (isUserFirstAsking) {
          toolChoice = { type: "tool", toolName: "webSearch" }
        }
      }
    } else {
      if (allTools.webSearch) {
        delete allTools.webSearch
      }
    }

    /** Messages */
    const modelMessage = await convertToModelMessages(messages, {
      ignoreIncompleteToolCalls: true
    })
    const prunedMessages = pruneMessages({
      messages: modelMessage,
      reasoning: "all",
      toolCalls: "before-last-1-messages",
      emptyMessages: "remove"
    })
    console.dir({ prunedMessages }, { depth: null })

    // Combine request abort signal with global abort controller
    const abortSignal = AbortSignal.any([c.req.raw.signal, globalAbortController.signal])

    const result = streamText({
      model: minimax(modelId),
      messages: prunedMessages,
      tools: allTools,
      toolChoice,
      stopWhen: Object.keys(allTools).length ? stepCountIs(5) : stepCountIs(1),
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

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
process.on("exit", () => {
  console.log("Sidecar process exiting...")
})
