import type { LanguageModelV4StreamPart } from "@ai-sdk/provider"
import type { UIMessage, UIMessageChunk } from "ai"
import { readUIMessageStream, tool } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { ContextState } from "../../../shared/context"
import { acquireConversation, createConversationStream, isContextOverflow } from "./runner"

function response(parts: LanguageModelV4StreamPart[], input = 100) {
  return {
    stream: new ReadableStream<LanguageModelV4StreamPart>({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] })
        for (const part of parts) controller.enqueue(part)
        controller.enqueue({
          type: "finish",
          finishReason: {
            unified: parts.some(part => part.type === "tool-call") ? "tool-calls" : "stop",
            raw: undefined
          },
          usage: {
            inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 10, text: 10, reasoning: 0 }
          }
        })
        controller.close()
      }
    })
  }
}
const textParts = (text: string): LanguageModelV4StreamPart[] => [
  { type: "text-start", id: "text" },
  { type: "text-delta", id: "text", delta: text },
  { type: "text-end", id: "text" }
]

async function consume(stream: ReadableStream<UIMessageChunk>, initialMessage?: UIMessage) {
  let last: UIMessage | undefined
  for await (const message of readUIMessageStream({
    stream,
    message: initialMessage,
    terminateOnError: true
  }))
    last = message
  return last
}

describe("shared conversation runner", () => {
  it("continues after a tool error instead of treating the failed tool as pending approval", async () => {
    const execute = vi.fn(async (): Promise<string> => {
      throw new Error("File does not exist")
    })
    const model = new MockLanguageModelV4({
      doStream: [
        response([{ type: "tool-call", toolCallId: "c1", toolName: "example", input: "{}" }]),
        response(textParts("I will try another path"))
      ]
    })
    const result = await consume(
      createConversationStream({
        chatId: "tool-error-test",
        model,
        modelProvider: "custom",
        modelId: "model",
        instructions: "System",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Read" }] }],
        tools: { example: tool({ inputSchema: z.object({}), execute }) },
        toolChoice: "auto",
        abortSignal: new AbortController().signal,
        reasoningEnabled: false,
        reasoningEffort: "default"
      })
    )
    expect(model.doStreamCalls).toHaveLength(2)
    expect(result?.parts).toContainEqual(
      expect.objectContaining({ type: "tool-example", state: "output-error" })
    )
    expect(result?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "I will try another path" })
    )
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("pauses for approval and executes the approved tool only once when resumed", async () => {
    const execute = vi.fn(async () => "Approved result")
    const tools = { example: tool({ inputSchema: z.object({}), needsApproval: true, execute }) }
    const model = new MockLanguageModelV4({
      doStream: [
        response([{ type: "tool-call", toolCallId: "c1", toolName: "example", input: "{}" }]),
        response(textParts("Approved work complete"))
      ]
    })
    let history: UIMessage[] = []
    let state: ContextState | undefined
    const base = {
      chatId: "approval-test",
      model,
      modelProvider: "custom",
      modelId: "model",
      instructions: "System",
      tools,
      toolChoice: "auto" as const,
      abortSignal: new AbortController().signal,
      reasoningEnabled: false,
      reasoningEffort: "default" as const,
      onCheckpoint: async (messages: UIMessage[], next: ContextState) => {
        history = structuredClone(messages)
        state = structuredClone(next)
      }
    }
    await consume(
      createConversationStream({
        ...base,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Execute" }] }]
      })
    )
    expect(execute).not.toHaveBeenCalled()
    const assistant = history.at(-1)
    if (!assistant) {
      throw new Error("Missing approval message")
    }
    assistant.parts = assistant.parts.map(part =>
      part.type === "tool-example" && part.state === "approval-requested"
        ? { ...part, state: "approval-responded", approval: { ...part.approval, approved: true } }
        : part
    )
    const result = await consume(
      createConversationStream({ ...base, messages: history, contextState: state }),
      assistant
    )
    expect(execute).toHaveBeenCalledTimes(1)
    expect(model.doStreamCalls).toHaveLength(2)
    expect(result?.parts).toContainEqual(
      expect.objectContaining({
        type: "tool-example",
        state: "output-available",
        output: "Approved result"
      })
    )
  })

  it("compacts an overflow once and resumes without repeating a completed tool", async () => {
    const execute = vi.fn(async () => "Executed exactly once")
    let request = 0
    const model = new MockLanguageModelV4({
      doStream: async () => {
        request++
        if (request === 1) {
          return response(
            [{ type: "tool-call", toolCallId: "once", toolName: "example", input: "{}" }],
            70000
          )
        }
        if (request === 2) {
          throw new Error("maximum context length exceeded")
        }
        return response(textParts("Recovered"), 12000)
      },
      doGenerate: {
        content: [
          {
            type: "text",
            text: "Goal: continue the requested work. Preserve completed tool results."
          }
        ],
        finishReason: { unified: "stop", raw: undefined },
        warnings: [],
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 }
        }
      }
    })
    const history: UIMessage[] = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? "assistant" : "user",
      parts: [{ type: "text", text: `History ${i} `.repeat(2500) }]
    }))
    history.push({ id: "latest", role: "user", parts: [{ type: "text", text: "Continue" }] })
    let saved: UIMessage[] = []
    let state: ContextState | undefined
    const result = await consume(
      createConversationStream({
        chatId: "overflow-test",
        model,
        modelProvider: "custom",
        modelId: "unknown",
        instructions: "System",
        messages: history,
        tools: { example: tool({ inputSchema: z.object({}), execute }) },
        toolChoice: "auto",
        abortSignal: new AbortController().signal,
        reasoningEnabled: false,
        reasoningEffort: "default",
        onCheckpoint: async (messages, next) => {
          saved = structuredClone(messages)
          state = next
        }
      })
    )
    expect(execute).toHaveBeenCalledTimes(1)
    expect(model.doStreamCalls).toHaveLength(3)
    expect(state?.events.filter(event => event.type === "compaction")).toEqual([
      expect.objectContaining({ reason: "overflow" })
    ])
    expect(saved.slice(0, history.length)).toEqual(history)
    expect(result?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Recovered" })
    )
    const retryPrompt = JSON.stringify(model.doStreamCalls[2].prompt)
    expect(retryPrompt).toContain("Executed exactly once")
    expect(retryPrompt).toContain("conversation_summary")
  })

  it("preserves partial output and never retries a failure after output began", async () => {
    const model = new MockLanguageModelV4({
      doStream: response([
        ...textParts("Partial answer"),
        { type: "error", error: new Error("maximum context length exceeded") }
      ])
    })
    let saved: UIMessage[] = []
    await expect(
      consume(
        createConversationStream({
          chatId: "partial-test",
          model,
          modelProvider: "custom",
          modelId: "unknown",
          instructions: "System",
          messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
          tools: {},
          toolChoice: "auto",
          abortSignal: new AbortController().signal,
          reasoningEnabled: false,
          reasoningEffort: "default",
          onCheckpoint: async messages => {
            saved = structuredClone(messages)
          }
        })
      )
    ).rejects.toThrow("maximum context length exceeded")
    expect(model.doStreamCalls).toHaveLength(1)
    expect(saved.at(-1)?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Partial answer" })
    )
  })

  it("streams and persists complete tool history without repeating a tool, and separates usage", async () => {
    const execute = vi.fn(async () => "tool result")
    const model = new MockLanguageModelV4({
      doStream: [
        response([{ type: "tool-call", toolCallId: "call-1", toolName: "example", input: "{}" }]),
        response(textParts("Done"), 150)
      ]
    })
    let saved: UIMessage[] = []
    let state: ContextState | undefined
    const result = await consume(
      createConversationStream({
        chatId: "runner-test",
        model,
        modelProvider: "custom",
        modelId: "test",
        instructions: "System",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Do work" }] }],
        tools: { example: tool({ inputSchema: z.object({}), execute }) },
        toolChoice: "auto",
        abortSignal: new AbortController().signal,
        reasoningEnabled: false,
        reasoningEffort: "default",
        onCheckpoint: async (messages, next) => {
          saved = structuredClone(messages)
          state = next
        }
      })
    )
    expect(execute).toHaveBeenCalledTimes(1)
    expect(model.doStreamCalls).toHaveLength(2)
    expect(result?.parts).toContainEqual(
      expect.objectContaining({ type: "tool-example", output: "tool result" })
    )
    expect(saved.at(-1)?.parts).toEqual(result?.parts)
    expect(result?.metadata).toMatchObject({
      totalUsage: { inputTokens: 250 },
      contextUsage: { tokens: expect.any(Number) }
    })
    expect(state?.usage?.tokens).toBeLessThan(250)
    expect(model.doStreamCalls[1].prompt).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "tool" })])
    )
  })

  it("releases locks after generation errors", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("Authentication failed")
      }
    })
    await expect(
      consume(
        createConversationStream({
          chatId: "failed-test",
          model,
          modelProvider: "custom",
          modelId: "test",
          instructions: "System",
          messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
          tools: {},
          toolChoice: "auto",
          abortSignal: new AbortController().signal,
          reasoningEnabled: false,
          reasoningEffort: "default"
        })
      )
    ).rejects.toThrow("Authentication failed")
    const release = acquireConversation("failed-test")
    release()
  })

  it("distinguishes capacity errors from unrelated failures", () => {
    expect(isContextOverflow(new Error("maximum context length exceeded"))).toBe(true)
    expect(isContextOverflow(new Error("rate limit"))).toBe(false)
  })

  it("keeps the provider-facing prompt prefix after restoring a completed tool conversation", async () => {
    const execute = vi.fn(async () => "Original result")
    const tools = { example: tool({ inputSchema: z.object({}), execute }) }
    const firstModel = new MockLanguageModelV4({
      doStream: [
        response([{ type: "tool-call", toolCallId: "c1", toolName: "example", input: "{}" }]),
        response(textParts("First answer"))
      ]
    })
    let history: UIMessage[] = []
    let state: ContextState | undefined
    const base = {
      chatId: "prefix-test",
      modelProvider: "custom",
      modelId: "model",
      instructions: "Stable system",
      tools,
      toolChoice: "auto" as const,
      abortSignal: new AbortController().signal,
      reasoningEnabled: false,
      reasoningEffort: "default" as const
    }
    await consume(
      createConversationStream({
        ...base,
        model: firstModel,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "First request" }] }],
        onCheckpoint: async (messages, next) => {
          history = structuredClone(messages)
          state = structuredClone(next)
        }
      })
    )
    const secondModel = new MockLanguageModelV4({ doStream: response(textParts("Second answer")) })
    await consume(
      createConversationStream({
        ...base,
        model: secondModel,
        contextState: state,
        messages: [
          ...history,
          { id: "u2", role: "user", parts: [{ type: "text", text: "Next request" }] }
        ]
      })
    )
    const cachedPrompt = firstModel.doStreamCalls[1].prompt
    expect(secondModel.doStreamCalls[0].prompt.slice(0, cachedPrompt.length)).toEqual(cachedPrompt)
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
