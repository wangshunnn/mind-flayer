import { streamText } from "ai"
// import { generateText } from "ai"

import { createMinimax } from "vercel-minimax-ai-provider"

// import { ProxyAgent, setGlobalDispatcher } from "undici"
// const proxy = "http://127.0.0.1:7890" // Set to your actual proxy port
// const dispatcher = new ProxyAgent(proxy)
// setGlobalDispatcher(dispatcher)

const minimax = createMinimax({
  baseURL: "https://api.minimaxi.com/anthropic/v1" //
})
const model = minimax("MiniMax-M2")
const prompt = "What is the capital of Singapore?"

// const { text } = await generateText({
//   // @ts-expect-error
//   model,
//   prompt
// })
// console.log("---> debug result=", text)

const result = await streamText({
  // @ts-expect-error
  model,
  prompt,
  onFinish({ text, finishReason, usage, response, steps, totalUsage, reasoning }) {
    // your own logic, e.g. for saving the chat history or recording usage
    // console.log("---> debug", usage, reasoning)
  }
})

for await (const chunk of result.textStream) {
  console.log(chunk)
}

const response = result.toUIMessageStreamResponse()
console.dir(response, { depth: null })
