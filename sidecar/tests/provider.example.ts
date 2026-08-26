import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { streamText } from "ai"
import dotenv from "dotenv"
import { createMinimaxOpenAI } from "vercel-minimax-ai-provider"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: `${__dirname}/../../.env.local` })

const minimax = createMinimaxOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY
})
const model = minimax.chat("MiniMax-M2.7")
const prompt = "你是什么模型？请用中文回答，并解释你的推理过程。"

const result = await streamText({
  model,
  prompt,
  onEnd(res) {
    console.log("streamText", res.usage, res.totalUsage)
  }
})

result.reasoningText.then(reasoning => {
  console.log("Reasoning:", reasoning)
})

for await (const chunk of result.textStream) {
  console.log(chunk)
}
