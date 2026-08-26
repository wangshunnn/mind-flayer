import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { streamText } from "ai"
import dotenv from "dotenv"
import { DeepSeekProvider } from "../src/providers/deepseek-provider"

// Run from the repository root: node --import tsx sidecar/tests/provider.example.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: `${__dirname}/../../.env.local` })

const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
if (!apiKey) {
  throw new Error(
    "Set DEEPSEEK_API_KEY in .env.local or the environment before running this example."
  )
}

const model = new DeepSeekProvider().createModel("deepseek-v4-pro", {
  baseUrl: "https://api.deepseek.com",
  apiKey
})
const prompt = "What model are you? Please answer in Chinese and explain your reasoning."

const result = streamText({
  model,
  prompt,
  onEnd(res) {
    console.log("streamText", res.usage, res.totalUsage)
  }
})

for await (const chunk of result.textStream) {
  console.log(chunk)
}

result.finalStep.then(res => {
  console.log("Final result:", res.text)
})
