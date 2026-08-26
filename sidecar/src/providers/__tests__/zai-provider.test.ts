import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart
} from "@ai-sdk/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MODEL_PROVIDERS } from "../../config/constants"
import type { ProviderConfig } from "../../type"
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

    it("normalizes full responses endpoint URLs to the SDK base URL", () => {
      const provider = new ZaiProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4/responses"
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
})
