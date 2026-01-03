import { createHuggingFace } from "@ai-sdk/huggingface"
import { convertToModelMessages, streamText, type UIMessage } from "ai"
import cors from "cors"
import express from "express"
import { ProxyAgent, setGlobalDispatcher } from "undici"

const proxy = "http://127.0.0.1:7890" // Set to your actual proxy port
const dispatcher = new ProxyAgent(proxy)
setGlobalDispatcher(dispatcher)

const app = express()
const PORT = process.env.PORT || 3737

// Configure CORS to allow frontend access
app.use(
  cors({
    origin: "*", // Should be restricted to specific domains in production
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
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
    const model = (req.headers["x-model"] as string) || req.body.model || "zai-org/GLM-4.7:novita"
    const { messages } = req.body

    if (!apiKey) {
      return res.status(400).json({ error: "API key is required" })
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" })
    }

    console.log("---> debug", { model, messages })

    const huggingface = createHuggingFace({
      apiKey
    })

    const result = streamText({
      model: huggingface(model),
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

app.listen(PORT, () => {
  console.log(`🚀 Mind Flayer Sidecar running on http://localhost:${PORT}`)
  console.log(`📝 API endpoint: http://localhost:${PORT}/api/chat`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...")
  process.exit(0)
})

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...")
  process.exit(0)
})
