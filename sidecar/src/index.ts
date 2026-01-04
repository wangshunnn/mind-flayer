import { convertToModelMessages, streamText, type UIMessage } from "ai"
import cors from "cors"
import express from "express"
import { createMinimax } from "vercel-minimax-ai-provider"

// if you need to use a proxy, uncomment the following lines
// import { ProxyAgent, setGlobalDispatcher } from "undici"
// const proxy = "http://127.0.0.1:7890" // Set to your actual proxy port
// const dispatcher = new ProxyAgent(proxy)
// setGlobalDispatcher(dispatcher)

const app = express()
const PORT = process.env.PORT || 3737

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
    // Read configuration from headers or body
    const apiKey = (req.headers["x-api-key"] as string) || req.body.apiKey
    const model = (req.headers["x-model"] as string) || req.body.model
    const { messages } = req.body

    if (!model) {
      return res.status(400).json({ error: "Model is required" })
    }
    if (!apiKey) {
      return res.status(400).json({ error: "API key is required" })
    }
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" })
    }

    console.log("[sidecar] /api/chat", model, messages)

    const minimax = createMinimax({
      baseURL: "https://api.minimaxi.com/anthropic/v1",
      apiKey
    })

    const result = streamText({
      // @ts-expect-error
      model: minimax(model),
      messages: await convertToModelMessages(messages as UIMessage[])
    })

    const response = result.toUIMessageStreamResponse()

    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    res.setHeader("Access-Control-Allow-Origin", "*")

    const reader = response.body?.getReader()
    if (!reader) {
      return res.status(500).json({ error: "No response body" })
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
