import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3DataContent,
  LanguageModelV3StreamPart
} from "@ai-sdk/provider"
import { generateText, streamText } from "ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MODEL_PROVIDERS } from "../../config/constants"
import type { ProviderConfig } from "../../type"
import { compactMessages } from "../../utils/message-compaction"
import {
  MinimaxProvider,
  withMiniMaxAiSdk7Compatibility,
  withMiniMaxStreamUsageFetch
} from "../minimax-provider"

const { createMinimaxOpenAIMock, minimaxChatModelFactoryMock } = vi.hoisted(() => ({
  createMinimaxOpenAIMock: vi.fn(),
  minimaxChatModelFactoryMock: vi.fn()
}))

vi.mock("vercel-minimax-ai-provider", () => ({
  createMinimaxOpenAI: createMinimaxOpenAIMock
}))

function streamFromParts(
  parts: LanguageModelV3StreamPart[]
): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part)
      }
      controller.close()
    }
  })
}

function createLegacyMiniMaxModel(
  modelId: string,
  parts: LanguageModelV3StreamPart[] = []
): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "minimax.chat",
    modelId,
    supportedUrls: {},
    doGenerate: vi.fn(async () => {
      return {
        content: [],
        finishReason: "stop",
        usage: {
          inputTokens: 10,
          outputTokens: 4,
          totalTokens: 14,
          reasoningTokens: 2,
          cachedInputTokens: 3
        },
        warnings: []
      } as unknown as Awaited<ReturnType<LanguageModelV3["doGenerate"]>>
    }),
    doStream: vi.fn(async (_options: LanguageModelV3CallOptions) => ({
      stream: streamFromParts(parts),
      request: {
        body: {}
      },
      response: {
        headers: {}
      }
    }))
  }
}

async function collectStream(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const parts: LanguageModelV3StreamPart[] = []

  for await (const part of stream) {
    parts.push(part)
  }

  return parts
}

describe("MinimaxProvider", () => {
  beforeEach(() => {
    createMinimaxOpenAIMock.mockReset()
    minimaxChatModelFactoryMock.mockReset()

    createMinimaxOpenAIMock.mockReturnValue({
      chat: minimaxChatModelFactoryMock
    })
    minimaxChatModelFactoryMock.mockImplementation((modelId: string) =>
      createLegacyMiniMaxModel(modelId)
    )
  })

  it("should have correct name", () => {
    const provider = new MinimaxProvider()
    expect(provider.name).toBe("minimax")
  })

  describe("createModel", () => {
    it("uses the OpenAI-compatible MiniMax endpoint by default", () => {
      const provider = new MinimaxProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }
      const modelId = "MiniMax-M3"

      const model = provider.createModel(modelId, config)

      expect(createMinimaxOpenAIMock).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: config.apiKey,
          baseURL: MODEL_PROVIDERS.minimax.defaultBaseUrl,
          fetch: expect.any(Function)
        })
      )
      expect(minimaxChatModelFactoryMock).toHaveBeenCalledWith(modelId)
      expect(model).toMatchObject({
        provider: "minimax.chat",
        modelId
      })
    })

    it("uses a custom base URL when provided", () => {
      const provider = new MinimaxProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: " https://custom.api.com/v1/ "
      }

      provider.createModel("MiniMax-M2.7", config)

      expect(createMinimaxOpenAIMock).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: config.apiKey,
          baseURL: "https://custom.api.com/v1",
          fetch: expect.any(Function)
        })
      )
    })

    it("normalizes the legacy Anthropic-compatible MiniMax endpoint to OpenAI-compatible v1", () => {
      const provider = new MinimaxProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://api.minimaxi.com/anthropic/v1"
      }

      provider.createModel("MiniMax-M2.7-highspeed", config)

      expect(createMinimaxOpenAIMock).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: config.apiKey,
          baseURL: "https://api.minimaxi.com/v1",
          fetch: expect.any(Function)
        })
      )
    })

    it("normalizes full chat completions endpoint URLs to the SDK base URL", () => {
      const provider = new MinimaxProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://api.minimaxi.com/v1/chat/completions"
      }

      provider.createModel("MiniMax-M3", config)

      expect(createMinimaxOpenAIMock).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: config.apiKey,
          baseURL: "https://api.minimaxi.com/v1",
          fetch: expect.any(Function)
        })
      )
    })
  })

  describe("withMiniMaxStreamUsageFetch", () => {
    it("adds include_usage to streaming request bodies", async () => {
      const fetchMock = vi.fn(
        async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
          new Response("{}")
      )
      const fetchWithUsage = withMiniMaxStreamUsageFetch(fetchMock as typeof fetch)

      await fetchWithUsage("https://api.minimaxi.com/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "MiniMax-M3",
          stream: true,
          stream_options: {
            existing: true
          },
          messages: []
        })
      })

      const [, init] = fetchMock.mock.calls[0]
      expect(JSON.parse(init?.body as string)).toEqual({
        model: "MiniMax-M3",
        stream: true,
        stream_options: {
          existing: true,
          include_usage: true
        },
        messages: []
      })
    })

    it("does not change non-streaming request bodies", async () => {
      const fetchMock = vi.fn(
        async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
          new Response("{}")
      )
      const fetchWithUsage = withMiniMaxStreamUsageFetch(fetchMock as typeof fetch)
      const body = JSON.stringify({
        model: "MiniMax-M3",
        stream: false,
        messages: []
      })

      await fetchWithUsage("https://api.minimaxi.com/v1/chat/completions", {
        method: "POST",
        body
      })

      const [, init] = fetchMock.mock.calls[0]
      expect(init?.body).toBe(body)
    })
  })

  describe("withMiniMaxAiSdk7Compatibility", () => {
    const imageBytes = new Uint8Array([1, 2, 3])
    const imageUrl = new URL("https://example.com/image.png")

    it.each([
      { name: "legacy bytes", data: imageBytes, expected: imageBytes },
      { name: "legacy base64", data: "AQID", expected: "AQID" },
      { name: "legacy URL", data: imageUrl, expected: imageUrl },
      { name: "v4 bytes", data: { type: "data", data: imageBytes }, expected: imageBytes },
      { name: "v4 base64", data: { type: "data", data: "AQID" }, expected: "AQID" },
      { name: "v4 URL", data: { type: "url", url: imageUrl }, expected: imageUrl }
    ])("normalizes $name without mutating the original prompt", async ({ data, expected }) => {
      const baseModel = createLegacyMiniMaxModel("MiniMax-M3")
      const model = withMiniMaxAiSdk7Compatibility(baseModel)
      const part = {
        type: "file" as const,
        mediaType: "image/png",
        // AI SDK 7 forwards v4 data to v3 models at runtime.
        data: data as LanguageModelV3DataContent
      }
      await model.doGenerate({ prompt: [{ role: "user", content: [part] }] })

      expect(baseModel.doGenerate).toHaveBeenCalledWith({
        prompt: [{ role: "user", content: [{ ...part, data: expected }] }]
      })
      expect(part.data).toBe(data)
    })

    it("rejects unsupported file references before calling the legacy provider", async () => {
      const baseModel = createLegacyMiniMaxModel("MiniMax-M3")
      const model = withMiniMaxAiSdk7Compatibility(baseModel)
      await expect(
        model.doGenerate({
          prompt: [
            {
              role: "user",
              content: [
                {
                  type: "file",
                  mediaType: "image/png",
                  data: {
                    type: "reference",
                    reference: { minimax: "file-1" }
                  } as unknown as LanguageModelV3DataContent
                }
              ]
            }
          ]
        })
      ).rejects.toThrow("MiniMax file inputs other than bytes, base64 data, or URLs")
      expect(baseModel.doGenerate).not.toHaveBeenCalled()
    })

    it("normalizes legacy MiniMax stream finish usage for AI SDK 7", async () => {
      const legacyFinish = {
        type: "finish",
        finishReason: "stop",
        usage: {
          inputTokens: 10,
          outputTokens: 4,
          totalTokens: 14,
          reasoningTokens: 2,
          cachedInputTokens: 3
        }
      } as unknown as LanguageModelV3StreamPart
      const baseModel = createLegacyMiniMaxModel("MiniMax-M3", [
        {
          type: "reasoning-start",
          id: "reasoning-0"
        },
        {
          type: "reasoning-delta",
          id: "reasoning-0",
          delta: "thinking"
        },
        legacyFinish
      ])
      const model = withMiniMaxAiSdk7Compatibility(baseModel)

      const result = await model.doStream({
        prompt: []
      })
      const parts = await collectStream(result.stream)

      expect(parts).toEqual([
        {
          type: "reasoning-start",
          id: "reasoning-0"
        },
        {
          type: "reasoning-delta",
          id: "reasoning-0",
          delta: "thinking"
        },
        {
          type: "finish",
          finishReason: {
            unified: "stop",
            raw: "stop"
          },
          usage: {
            inputTokens: {
              total: 10,
              noCache: undefined,
              cacheRead: 3,
              cacheWrite: undefined
            },
            outputTokens: {
              total: 4,
              text: undefined,
              reasoning: 2
            }
          }
        }
      ])
    })

    it("normalizes legacy MiniMax generate usage for AI SDK 7", async () => {
      const baseModel = createLegacyMiniMaxModel("MiniMax-M3")
      const model = withMiniMaxAiSdk7Compatibility(baseModel)

      const result = await model.doGenerate({
        prompt: []
      })

      expect(result.finishReason).toEqual({
        unified: "stop",
        raw: "stop"
      })
      expect(result.usage).toEqual({
        inputTokens: {
          total: 10,
          noCache: undefined,
          cacheRead: 3,
          cacheWrite: undefined
        },
        outputTokens: {
          total: 4,
          text: undefined,
          reasoning: 2
        }
      })
    })
  })

  describe("real SDK requests", () => {
    beforeEach(async () => {
      const actual = await vi.importActual<typeof import("vercel-minimax-ai-provider")>(
        "vercel-minimax-ai-provider"
      )
      createMinimaxOpenAIMock.mockImplementation(actual.createMinimaxOpenAI)
    })

    afterEach(() => vi.unstubAllGlobals())

    it.each(["generate", "stream"])("preserves image attachments in %s requests", async mode => {
      const imageUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2sUAAAAASUVORK5CYII="
      const usage = { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
      const fetchMock = vi.fn<typeof fetch>(async () => {
        const response = {
          id: "minimax-image",
          created: 1,
          model: "MiniMax-M3",
          choices: [
            {
              index: 0,
              ...(mode === "stream"
                ? { delta: { role: "assistant", content: "An image." } }
                : { message: { role: "assistant", content: "An image." } }),
              finish_reason: "stop"
            }
          ],
          usage
        }
        return new Response(
          mode === "stream"
            ? `data: ${JSON.stringify(response)}\n\ndata: [DONE]\n\n`
            : JSON.stringify(response),
          {
            headers: {
              "content-type": mode === "stream" ? "text/event-stream" : "application/json"
            }
          }
        )
      })
      vi.stubGlobal("fetch", fetchMock)
      const messages = await compactMessages([
        {
          id: "image-message",
          role: "user",
          parts: [
            { type: "text", text: "Describe this image." },
            { type: "file", mediaType: "image/png", url: imageUrl }
          ]
        }
      ])
      const options = {
        model: new MinimaxProvider().createModel("MiniMax-M3", { apiKey: "test-api-key" }),
        messages,
        maxRetries: 0
      }
      const result = mode === "stream" ? streamText(options) : await generateText(options)

      expect(await result.text).toBe("An image.")
      expect(await result.totalUsage).toMatchObject({ inputTokens: 10, outputTokens: 4 })
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image." },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        ...(mode === "stream" ? { stream_options: { include_usage: true } } : {})
      })
    })
  })
})
