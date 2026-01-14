import {
  convertToModelMessages,
  InvalidToolInputError,
  NoSuchToolError,
  pruneMessages,
  stepCountIs,
  streamText,
  type Tool,
  type UIMessage
} from "ai"
import cors from "cors"
import express from "express"
import { createMinimax } from "vercel-minimax-ai-provider"
import { webSearchTool } from "./tools"

// if you need to use a proxy, uncomment the following lines
// import { ProxyAgent, setGlobalDispatcher } from "undici"
// const proxy = "http://127.0.0.1:7890" // Set to your actual proxy port
// const dispatcher = new ProxyAgent(proxy)
// setGlobalDispatcher(dispatcher)

interface ProviderConfig {
  apiKey: string
  baseUrl?: string
}

const app = express()
const PORT = process.env.PORT || 3737
const apiKeyCache = new Map<string, ProviderConfig>()

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
        console.log("[sidecar] Config update with providers:", Object.keys(message.configs))
        // Update API key cache
        apiKeyCache.clear()
        for (const [provider, config] of Object.entries(message.configs) as [
          string,
          ProviderConfig
        ][]) {
          apiKeyCache.set(provider, config)
          console.log(`[sidecar] Updated API key for provider: ${provider}`)
        }
        console.log(`[sidecar] API key cache updated with ${apiKeyCache.size} providers`)
      }
    }
  } catch (error) {
    console.error("[sidecar] Error parsing stdin message:", error)
  }
})

// Configure CORS to allow frontend access
app.use(
  cors({
    origin: "*", // Should be restricted to specific domains in production
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: "*",
    exposedHeaders: ["*"]
  })
)
app.use(express.json())

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.0" })
})

// AI streaming chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    // Get provider from header or body (default to minimax) - normalize to lowercase
    const provider = (
      (req.headers["x-model-provider"] as string) ||
      req.body.provider ||
      "minimax"
    ).toLowerCase()
    const modelId = (req.headers["x-model-id"] as string) || req.body.model
    const useWebSearch = req.headers["x-use-web-search"] === "true" || req.body.useWebSearch
    const webSearchMode = (req.headers["x-web-search-mode"] as string) || "auto"
    const messages = req.body?.messages as UIMessage[]

    if (!modelId) {
      return res.status(400).json({ error: "Model is required" })
    }
    if (!messages || !Array.isArray(messages)) {
      return res.status(401).json({ error: "Messages array is required" })
    }

    const providerConfig = apiKeyCache.get(provider)
    if (!providerConfig) {
      console.error(`[sidecar] API key not found for provider: ${provider}`)
      return res.status(402).json({
        error: "API key not configured",
        provider,
        message: `Please configure your ${provider} API key in settings`
      })
    }

    const apiKey = providerConfig.apiKey
    const baseUrl = providerConfig.baseUrl || "https://api.minimaxi.com/anthropic/v1"

    console.log("[sidecar] /api/chat", { provider, modelId, useWebSearch, webSearchMode })

    const minimax = createMinimax({
      baseURL: baseUrl,
      apiKey
    })

    // Build tools object based on user preferences
    const tools: Record<string, Tool> = {}
    if (useWebSearch) {
      const parallelConfig = apiKeyCache.get("parallel")
      if (parallelConfig) {
        tools.webSearch = webSearchTool(parallelConfig.apiKey)
      } else {
        console.warn("[sidecar] Parallel API key not configured, web search disabled")
      }
    }

    const toolsCount = Object.keys(tools).length
    let toolChoice: "auto" | { type: "tool"; toolName: string } = "auto"

    if (useWebSearch && webSearchMode === "always") {
      toolChoice = { type: "tool", toolName: "webSearch" }
    }

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

    const result = streamText({
      model: minimax(modelId),
      messages: prunedMessages,
      tools,
      toolChoice,
      stopWhen: toolsCount ? stepCountIs(5) : stepCountIs(1)
    })

    const response = result.toUIMessageStreamResponse({
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
        if (NoSuchToolError.isInstance(error)) {
          return "Error: The model tried to call a unknown tool."
        } else if (InvalidToolInputError.isInstance(error)) {
          return "Error: The model called a tool with invalid inputs."
        } else {
          if (error instanceof Error && error.message) {
            return `Error: ${error?.message}`
          }
          return "Error: An unknown error occurred."
        }
      }
    })

    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    res.setHeader("Access-Control-Allow-Origin", "*")

    const reader = response.body?.getReader()
    if (!reader) {
      return res.status(501).json({ error: "No response body" })
    }
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read()
      if (done) {
        res.end()
        return
      }
      res.write(value)
      return pump()
    }
    await pump()
  } catch (error) {
    console.error("Chat error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage })
    }
  }
})

const server = app.listen(PORT, () => {
  console.log(`Sidecar running on http://localhost:${PORT}`)
  console.log(`API endpoint: http://localhost:${PORT}/api/chat`)
})

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down gracefully...")
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
