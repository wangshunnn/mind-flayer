import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart
} from "@ai-sdk/provider"
import type { ToolSet, UIMessage } from "ai"
import { generateText, isStepCount, jsonSchema, streamText, tool } from "ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MODEL_PROVIDERS } from "../../config/constants"
import { createContextEntries } from "../../context/engine"
import type { ProviderConfig } from "../../type"

async function convertHistory(messages: UIMessage[], tools: ToolSet = {}) {
  return (await createContextEntries(messages, tools)).flatMap(entry => entry.models)
}

import { buildProviderOptions } from "../../utils/provider-options"
import { withZaiReasoningStream, ZaiProvider } from "../zai-provider"

const { createOpenAIMock, zhipuChatModelFactoryMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(),
  zhipuChatModelFactoryMock: vi.fn()
}))

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock
}))

function streamFromParts(
  parts: LanguageModelV4StreamPart[]
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part)
      }
      controller.close()
    }
  })
}

function createMockLanguageModel(
  modelId: string,
  parts: LanguageModelV4StreamPart[] = []
): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "zhipu",
    modelId,
    supportedUrls: {},
    doGenerate: vi.fn(async () => {
      return {
        content: [],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: {
            total: 0,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined
          },
          outputTokens: {
            total: 0,
            text: undefined,
            reasoning: undefined
          }
        },
        warnings: []
      } satisfies LanguageModelV4GenerateResult
    }),
    doStream: vi.fn(async (options: LanguageModelV4CallOptions) => ({
      stream: streamFromParts(parts),
      request: {
        body: {
          includeRawChunks: options.includeRawChunks
        }
      },
      response: {
        headers: {}
      }
    }))
  }
}

async function collectStream(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const parts: LanguageModelV4StreamPart[] = []

  for await (const part of stream) {
    parts.push(part)
  }

  return parts
}

function createChatResponse(
  streaming: boolean,
  deltas: Record<string, unknown>[] = [{ content: "Done." }],
  finishReason = "stop"
) {
  const response = {
    id: "zai-response",
    created: 1,
    model: "glm-5.2",
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
  }
  if (!streaming) {
    return new Response(
      JSON.stringify({
        ...response,
        choices: [
          { index: 0, message: { role: "assistant", ...deltas[0] }, finish_reason: finishReason }
        ]
      }),
      { headers: { "content-type": "application/json" } }
    )
  }

  const chunks = deltas.map((delta, index) => ({
    ...response,
    choices: [{ index: 0, delta, finish_reason: index === deltas.length - 1 ? finishReason : null }]
  }))
  return new Response(
    `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } }
  )
}

describe("ZaiProvider", () => {
  beforeEach(() => {
    createOpenAIMock.mockReset()
    zhipuChatModelFactoryMock.mockReset()

    createOpenAIMock.mockReturnValue({
      chat: zhipuChatModelFactoryMock
    })
    zhipuChatModelFactoryMock.mockImplementation((modelId: string) =>
      createMockLanguageModel(modelId)
    )
  })

  it("should have correct name", () => {
    const provider = new ZaiProvider()
    expect(provider.name).toBe("zhipu")
  })

  describe("createModel", () => {
    it("passes the API key and selected model ID to createOpenAI", () => {
      const provider = new ZaiProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }
      const modelId = "glm-5.2"

      const model = provider.createModel(modelId, config)

      expect(createOpenAIMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: MODEL_PROVIDERS.zhipu.defaultBaseUrl,
        name: "zhipu"
      })
      expect(zhipuChatModelFactoryMock).toHaveBeenCalledWith(modelId)
      expect(model).toMatchObject({
        provider: "zhipu",
        modelId
      })
    })

    it("uses a custom base URL when provided", () => {
      const provider = new ZaiProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: " https://custom.bigmodel.cn/api/paas/v4/ "
      }
      const modelId = "glm-5.2"

      provider.createModel(modelId, config)

      expect(createOpenAIMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: "https://custom.bigmodel.cn/api/paas/v4",
        name: "zhipu"
      })
      expect(zhipuChatModelFactoryMock).toHaveBeenCalledWith(modelId)
    })

    it("normalizes full chat completions endpoint URLs to the SDK base URL", () => {
      const provider = new ZaiProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions"
      }
      const modelId = "glm-5.2"

      provider.createModel(modelId, config)

      expect(createOpenAIMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: "https://open.bigmodel.cn/api/paas/v4",
        name: "zhipu"
      })
      expect(zhipuChatModelFactoryMock).toHaveBeenCalledWith(modelId)
    })

    it("rejects Responses endpoint URLs", () => {
      const provider = new ZaiProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4/responses"
      }
      const modelId = "glm-5.2"

      expect(() => provider.createModel(modelId, config)).toThrow(
        "Invalid Z.AI Chat Completions Base URL: responsesUnsupported"
      )
      expect(createOpenAIMock).not.toHaveBeenCalled()
    })

    it("falls back to the domestic default base URL and uses chat completions", () => {
      const provider = new ZaiProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }
      const modelId = "glm-5.2"

      provider.createModel(modelId, config)

      expect(createOpenAIMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: "https://open.bigmodel.cn/api/paas/v4",
        name: "zhipu"
      })
      expect(zhipuChatModelFactoryMock).toHaveBeenCalledWith(modelId)
    })
  })

  describe("withZaiReasoningStream", () => {
    it("converts GLM reasoning_content raw chunks into AI SDK reasoning stream parts", async () => {
      const baseModel = createMockLanguageModel("glm-5.2", [
        {
          type: "stream-start",
          warnings: []
        },
        {
          type: "raw",
          rawValue: {
            choices: [
              {
                delta: {
                  reasoning_content: "Think "
                }
              }
            ]
          }
        },
        {
          type: "raw",
          rawValue: {
            choices: [
              {
                delta: {
                  reasoning_content: "carefully."
                }
              }
            ]
          }
        },
        {
          type: "text-start",
          id: "0"
        },
        {
          type: "text-delta",
          id: "0",
          delta: "Answer"
        },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: 1,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined
            },
            outputTokens: {
              total: 1,
              text: 1,
              reasoning: 1
            }
          }
        }
      ])
      const model = withZaiReasoningStream(baseModel)

      const result = await model.doStream({
        prompt: [],
        includeRawChunks: false
      })
      const parts = await collectStream(result.stream)

      expect(baseModel.doStream).toHaveBeenCalledWith({
        prompt: [],
        includeRawChunks: true
      })
      expect(parts).toEqual([
        {
          type: "stream-start",
          warnings: []
        },
        {
          type: "reasoning-start",
          id: "zai-reasoning-0"
        },
        {
          type: "reasoning-delta",
          id: "zai-reasoning-0",
          delta: "Think "
        },
        {
          type: "reasoning-delta",
          id: "zai-reasoning-0",
          delta: "carefully."
        },
        {
          type: "text-start",
          id: "0"
        },
        {
          type: "text-delta",
          id: "0",
          delta: "Answer"
        },
        {
          type: "reasoning-end",
          id: "zai-reasoning-0"
        },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: 1,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined
            },
            outputTokens: {
              total: 1,
              text: 1,
              reasoning: 1
            }
          }
        }
      ])
    })

    it("forwards raw chunks only when the caller requested them", async () => {
      const rawPart: LanguageModelV4StreamPart = {
        type: "raw",
        rawValue: {
          choices: [
            {
              delta: {
                reasoning_content: "visible"
              }
            }
          ]
        }
      }
      const baseModel = createMockLanguageModel("glm-5.2", [
        rawPart,
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined
            }
          }
        }
      ])
      const model = withZaiReasoningStream(baseModel)

      const result = await model.doStream({
        prompt: [],
        includeRawChunks: true
      })
      const parts = await collectStream(result.stream)

      expect(parts).toContain(rawPart)
    })
  })

  describe("real SDK requests", () => {
    beforeEach(async () => {
      const actual = await vi.importActual<typeof import("@ai-sdk/openai")>("@ai-sdk/openai")
      createOpenAIMock.mockImplementation(actual.createOpenAI)
    })

    afterEach(() => vi.unstubAllGlobals())

    it.each([
      {
        streaming: false,
        enabled: false,
        effort: "high",
        thinking: "disabled",
        expectedEffort: undefined
      },
      {
        streaming: true,
        enabled: true,
        effort: "default",
        thinking: "enabled",
        expectedEffort: undefined
      },
      {
        streaming: false,
        enabled: true,
        effort: "low",
        thinking: "enabled",
        expectedEffort: "low"
      },
      {
        streaming: true,
        enabled: true,
        effort: "xhigh",
        thinking: "enabled",
        expectedEffort: "xhigh"
      }
    ] as const)("sends thinking=$thinking and effort=$effort (stream=$streaming)", async ({
      streaming,
      enabled,
      effort,
      thinking,
      expectedEffort
    }) => {
      const fetchMock = vi.fn<typeof fetch>(async () => createChatResponse(streaming))
      vi.stubGlobal("fetch", fetchMock)
      const options = {
        model: new ZaiProvider().createModel("glm-5.2", { apiKey: "test-api-key" }),
        prompt: "Hello",
        providerOptions: buildProviderOptions({
          modelProvider: "zhipu",
          modelId: "glm-5.2",
          reasoningEnabled: enabled,
          reasoningEffort: effort
        }),
        maxRetries: 0
      }
      const result = streaming ? streamText(options) : await generateText(options)
      expect(await result.text).toBe("Done.")
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
      expect(body.thinking).toEqual({ type: thinking })
      expect(body.reasoning_effort).toBe(expectedEffort)
    })

    it.each([
      "glm-5.3",
      "glm-5.3-flash"
    ])("forces reasoning and tool streaming for %s", async modelId => {
      const fetchMock = vi.fn<typeof fetch>(async () => createChatResponse(true))
      vi.stubGlobal("fetch", fetchMock)
      const result = streamText({
        model: new ZaiProvider().createModel(modelId, { apiKey: "test-api-key" }),
        prompt: "Hello",
        providerOptions: buildProviderOptions({
          modelProvider: "zhipu",
          modelId,
          reasoningEnabled: false,
          reasoningEffort: "xhigh"
        }),
        maxRetries: 0
      })

      expect(await result.text).toBe("Done.")
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
      expect(body.thinking).toEqual({ type: "enabled", clear_thinking: false })
      expect(body.reasoning_effort).toBe("low")
      expect(body.tool_stream).toBe(true)
    })

    it("serializes GLM-5.3-Flash image and PDF inputs through Chat Completions", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => createChatResponse(false))
      vi.stubGlobal("fetch", fetchMock)
      const messages = await convertHistory([
        {
          id: "user-1",
          role: "user",
          parts: [
            {
              type: "file",
              mediaType: "image/png",
              filename: "mockup.png",
              url: "data:image/png;base64,aW1hZ2U="
            },
            {
              type: "file",
              mediaType: "image/jpeg",
              filename: "detail.jpg",
              url: "data:image/jpeg;base64,ZGV0YWls"
            },
            {
              type: "file",
              mediaType: "application/pdf",
              filename: "spec.pdf",
              url: "data:application/pdf;base64,cGRm"
            },
            { type: "text", text: "Review these files." }
          ]
        }
      ])
      const modelId = "glm-5.3-flash"

      await generateText({
        model: new ZaiProvider().createModel(modelId, { apiKey: "test-api-key" }),
        messages,
        providerOptions: buildProviderOptions({
          modelProvider: "zhipu",
          modelId,
          reasoningEnabled: true,
          reasoningEffort: "default"
        }),
        maxRetries: 0
      })

      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
      expect(body.messages[0]).toMatchObject({
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,aW1hZ2U=" }
          },
          {
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,ZGV0YWls" }
          },
          {
            type: "file",
            file: {
              filename: "spec.pdf",
              file_data: "data:application/pdf;base64,cGRm"
            }
          },
          { type: "text", text: "Review these files." }
        ]
      })
    })

    it("replays complete reasoning alongside tool results in the next streaming step", async () => {
      const fetchMock = vi.fn<typeof fetch>()
      fetchMock.mockImplementationOnce(async () =>
        createChatResponse(
          true,
          [
            { role: "assistant", reasoning_content: " Think first. " },
            { reasoning_content: "\nRead the file." },
            {
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  type: "function",
                  function: { name: "readFile", arguments: "{}" }
                }
              ]
            }
          ],
          "tool_calls"
        )
      )
      fetchMock.mockImplementationOnce(async () => createChatResponse(true))
      vi.stubGlobal("fetch", fetchMock)
      const readFile = tool({
        inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }),
        execute: async () => "File contents"
      })
      const result = streamText({
        model: new ZaiProvider().createModel("glm-5.2", { apiKey: "test-api-key" }),
        prompt: "Read the file.",
        tools: { readFile },
        stopWhen: isStepCount(2),
        maxRetries: 0
      })

      expect(await result.text).toBe("Done.")
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
        messages: [
          { role: "user", content: "Read the file." },
          {
            role: "assistant",
            reasoning_content: " Think first. \nRead the file.",
            tool_calls: [{ id: "call-1", function: { name: "readFile", arguments: "{}" } }]
          },
          { role: "tool", tool_call_id: "call-1", content: "File contents" }
        ]
      })
    })

    it("keeps restored reasoning isolated across concurrent requests on the same model", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => {
        await Promise.resolve()
        return createChatResponse(false)
      })
      vi.stubGlobal("fetch", fetchMock)
      const model = new ZaiProvider().createModel("glm-5.2", { apiKey: "test-api-key" })

      await Promise.all(
        ["Reasoning A", "Reasoning B"].map(async reasoning => {
          const messages = await convertHistory([
            { id: "user-1", role: "user", parts: [{ type: "text", text: "First question" }] },
            {
              id: "assistant-1",
              role: "assistant",
              parts: [
                { type: "reasoning", text: reasoning, state: "done" },
                { type: "text", text: "Same answer", state: "done" }
              ]
            },
            { id: "user-2", role: "user", parts: [{ type: "text", text: "Continue" }] }
          ])
          await generateText({ model, messages, maxRetries: 0 })
        })
      )

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const replayedReasoning = fetchMock.mock.calls.map(
        ([, init]) => JSON.parse(String(init?.body)).messages[1].reasoning_content
      )
      expect(replayedReasoning.sort()).toEqual(["Reasoning A", "Reasoning B"])
    })

    it("replays reasoning when resuming an approved tool call from UI history", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => createChatResponse(true))
      vi.stubGlobal("fetch", fetchMock)
      const execute = vi.fn(async () => "Approved file contents")
      const tools = {
        readFile: tool({
          inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }),
          needsApproval: true,
          execute
        })
      }
      const messages = await convertHistory(
        [
          { id: "user-1", role: "user", parts: [{ type: "text", text: "Read the file." }] },
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              { type: "step-start" },
              { type: "reasoning", text: "Ask permission before reading.", state: "done" },
              {
                type: "tool-readFile",
                toolCallId: "approved-call",
                input: {},
                state: "approval-responded",
                approval: { id: "approval-1", approved: true }
              }
            ]
          }
        ],
        tools
      )
      const result = streamText({
        model: new ZaiProvider().createModel("glm-5.2", { apiKey: "test-api-key" }),
        messages,
        tools,
        maxRetries: 0
      })

      expect(await result.text).toBe("Done.")
      expect(execute).toHaveBeenCalledOnce()
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
        messages: [
          { role: "user", content: "Read the file." },
          {
            role: "assistant",
            reasoning_content: "Ask permission before reading.",
            tool_calls: [{ id: "approved-call" }]
          },
          { role: "tool", tool_call_id: "approved-call", content: "Approved file contents" }
        ]
      })
    })
  })
})
