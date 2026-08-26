import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage
} from "@ai-sdk/provider"
import type { LanguageModel } from "ai"
import { createMinimaxOpenAI } from "vercel-minimax-ai-provider"
import { MODEL_PROVIDERS } from "../config/constants"
import type { ProviderConfig } from "../type"
import type { IProvider } from "./base"

const MINIMAX_TERMINAL_PATHS = ["/chat/completions"] as const
const MINIMAX_LEGACY_ANTHROPIC_PATH = "/anthropic/v1"
const MINIMAX_OPENAI_PATH = "/v1"
type FetchFunction = typeof globalThis.fetch

function normalizeMinimaxBaseUrl(baseUrl?: string): string {
  let normalizedBaseUrl = (baseUrl?.trim() || MODEL_PROVIDERS.minimax.defaultBaseUrl).replace(
    /\/+$/,
    ""
  )

  for (const terminalPath of MINIMAX_TERMINAL_PATHS) {
    if (normalizedBaseUrl.endsWith(terminalPath)) {
      normalizedBaseUrl = normalizedBaseUrl.slice(0, -terminalPath.length)
      break
    }
  }

  if (normalizedBaseUrl.endsWith(MINIMAX_LEGACY_ANTHROPIC_PATH)) {
    normalizedBaseUrl = `${normalizedBaseUrl.slice(0, -MINIMAX_LEGACY_ANTHROPIC_PATH.length)}${MINIMAX_OPENAI_PATH}`
  }

  return normalizedBaseUrl
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined
}

function withMiniMaxStreamUsageBody(init?: RequestInit): RequestInit | undefined {
  if (typeof init?.body !== "string") {
    return init
  }

  try {
    const body = JSON.parse(init.body) as unknown
    if (!isRecord(body) || body.stream !== true) {
      return init
    }

    const streamOptions = isRecord(body.stream_options) ? body.stream_options : {}
    return {
      ...init,
      body: JSON.stringify({
        ...body,
        stream_options: {
          ...streamOptions,
          include_usage: true
        }
      })
    }
  } catch {
    return init
  }
}

export function withMiniMaxStreamUsageFetch(
  fetchFn: FetchFunction = globalThis.fetch
): FetchFunction {
  return (input, init) => fetchFn(input, withMiniMaxStreamUsageBody(init))
}

function normalizeMiniMaxFinishReason(finishReason: unknown): LanguageModelV3FinishReason {
  if (isRecord(finishReason) && typeof finishReason.unified === "string") {
    return finishReason as LanguageModelV3FinishReason
  }

  const raw = typeof finishReason === "string" ? finishReason : undefined
  switch (raw) {
    case "stop":
    case "length":
    case "content-filter":
    case "tool-calls":
    case "error":
    case "other":
      return { unified: raw, raw }
    default:
      return { unified: "other", raw }
  }
}

function normalizeMiniMaxUsage(usage: unknown): LanguageModelV3Usage {
  if (isRecord(usage) && isRecord(usage.inputTokens) && isRecord(usage.outputTokens)) {
    return usage as LanguageModelV3Usage
  }

  const legacyUsage = isRecord(usage) ? usage : {}

  return {
    inputTokens: {
      total: readNumber(legacyUsage.inputTokens),
      noCache: undefined,
      cacheRead: readNumber(legacyUsage.cachedInputTokens),
      cacheWrite: undefined
    },
    outputTokens: {
      total: readNumber(legacyUsage.outputTokens),
      text: undefined,
      reasoning: readNumber(legacyUsage.reasoningTokens)
    }
  }
}

export function withMiniMaxAiSdk7Compatibility(model: LanguageModelV3): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
      const result = await model.doGenerate(options)
      return {
        ...result,
        finishReason: normalizeMiniMaxFinishReason(result.finishReason),
        usage: normalizeMiniMaxUsage(result.usage)
      }
    },
    async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
      const result = await model.doStream(options)
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
            transform(part, controller) {
              if (part.type === "finish") {
                controller.enqueue({
                  ...part,
                  finishReason: normalizeMiniMaxFinishReason(part.finishReason),
                  usage: normalizeMiniMaxUsage(part.usage)
                })
                return
              }

              controller.enqueue(part)
            }
          })
        )
      }
    }
  }
}

/**
 * MiniMax AI provider implementation using the OpenAI-compatible Chat Completions API.
 */
export class MinimaxProvider implements IProvider {
  readonly name = "minimax"

  createModel(modelId: string, config: ProviderConfig): LanguageModel {
    const baseUrl = normalizeMinimaxBaseUrl(config.baseUrl)

    const minimax = createMinimaxOpenAI({
      baseURL: baseUrl,
      apiKey: config.apiKey,
      fetch: withMiniMaxStreamUsageFetch()
    })

    return withMiniMaxAiSdk7Compatibility(minimax.chat(modelId)) as LanguageModel
  }
}
