import { huggingface } from "@ai-sdk/huggingface"
import { generateText } from "ai"

import { ProxyAgent, setGlobalDispatcher } from "undici"

const proxy = "http://127.0.0.1:7890" // Set to your actual proxy port
const dispatcher = new ProxyAgent(proxy)
setGlobalDispatcher(dispatcher)

const model = huggingface("zai-org/GLM-4.7:novita")
const prompt = "What is the capital of Singapore?"
const { text } = await generateText({
  model,
  prompt,
  maxRetries: 2,
  onFinish: output => {
    console.log("---> debug output=", output)
  }
})
console.log("---> debug result=", text)
