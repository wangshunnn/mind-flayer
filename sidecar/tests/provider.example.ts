import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { streamText } from "ai"
import dotenv from "dotenv"
import { createMinimax } from "vercel-minimax-ai-provider"
import { z } from "zod"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: `${__dirname}/../../.env.local` })

const minimax = createMinimax({
  baseURL: "https://api.minimaxi.com/anthropic/v1",
  apiKey: process.env.MINIMAX_API_KEY
})
const model = minimax("MiniMax-M2")
const prompt = "What is the capital of Singapore?"

const result = await streamText({
  model,
  prompt,
  onFinish(res) {
    console.log("streamText", res.usage, res.totalUsage)
  },
  tools: {
    // server-side tool with execute function:
    getWeatherInformation: {
      description: "show the weather in a given city to the user",
      inputSchema: z.object({ city: z.string() }),
      // biome-ignore lint/correctness/noEmptyPattern: <any>
      execute: async ({}: { city: string }) => {
        const weatherOptions = ["sunny", "cloudy", "rainy", "snowy", "windy"]
        return weatherOptions[Math.floor(Math.random() * weatherOptions.length)]
      }
    },
    // client-side tool that starts user interaction:
    askForConfirmation: {
      description: "Ask the user for confirmation.",
      inputSchema: z.object({
        message: z.string().describe("The message to ask for confirmation.")
      })
    },
    // client-side tool that is automatically executed on the client:
    getLocation: {
      description: "Get the user location. Always ask for confirmation before using this tool.",
      inputSchema: z.object({})
    }
  }
})

result.reasoningText.then(reasoning => {
  console.log("Reasoning:", reasoning)
})

for await (const chunk of result.textStream) {
  console.log(chunk)
}
