import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { streamText } from "ai"
import dotenv from "dotenv"
import { createMinimax } from "vercel-minimax-ai-provider"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: `${__dirname}/../../.env.local` })

const minimax = createMinimax({
  baseURL: "https://api.minimaxi.com/anthropic/v1",
  apiKey: process.env.MINIMAX_API_KEY
})
const model = minimax("MiniMax-M2")
const prompt = "What is the capital of Singapore?"

// const result_text = await generateText({
//   model,
//   prompt,
//   onFinish(res) {
//     console.log("generateText", res.usage, res.totalUsage)
//   }
// })
// console.dir(result_text, { depth: null })

const result = await streamText({
  model,
  prompt,
  onFinish(res) {
    console.log("streamText", res.usage, res.totalUsage)
  }
})

result.reasoningText.then(reasoning => {
  console.log("Reasoning:", reasoning)
})

for await (const chunk of result.textStream) {
  console.log(chunk)
}

// const response = result.toUIMessageStreamResponse()
// console.dir(response, { depth: null })
