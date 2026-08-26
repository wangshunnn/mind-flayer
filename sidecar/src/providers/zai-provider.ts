import { createOpenAI } from "@ai-sdk/openai"
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult
} from "@ai-sdk/provider"
import type { LanguageModel } from "ai"
import { MODEL_PROVIDERS } from "../config/constants"
import type { ProviderConfig } from "../type"
import type { IProvider } from "./base"

const ZAI_TERMINAL_PATHS = ["/chat/completions", "/responses"] as const

function normalizeZaiBaseUrl(baseUrl?: string): string {
  let normalizedBaseUrl = (baseUrl?.trim() || MODEL_PROVIDERS.zhipu.defaultBaseUrl).replace(
    /\/+$/,
    ""
  )

  for (const terminalPath of ZAI_TERMINAL_PATHS) {
    if (normalizedBaseUrl.endsWith(terminalPath)) {
      normalizedBaseUrl = normalizedBaseUrl.slice(0, -terminalPath.length)
      break
    }
  }

  return normalizedBaseUrl
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function extractZaiReasoningDelta(rawValue: unknown): string | undefined {
  if (!isRecord(rawValue) || !Array.isArray(rawValue.choices)) {
    return undefined
  }

  const [firstChoice] = rawValue.choices
  if (!isRecord(firstChoice) || !isRecord(firstChoice.delta)) {
    return undefined
  }

  const reasoningContent = firstChoice.delta.reasoning_content
  return typeof reasoningContent === "string" && reasoningContent.length > 0
    ? reasoningContent
    : undefined
}

export function withZaiReasoningStream(model: LanguageModelV4): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate(options: LanguageModelV4CallOptions) {
      return model.doGenerate(options)
    },
    async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      const result = await model.doStream({
        ...options,
        includeRawChunks: true
      })
      const shouldForwardRawChunks = options.includeRawChunks === true
      let isActiveReasoning = false

      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
            transform(part, controller) {
              if (part.type === "raw") {
                const reasoningDelta = extractZaiReasoningDelta(part.rawValue)
                if (reasoningDelta !== undefined) {
                  if (!isActiveReasoning) {
                    controller.enqueue({ type: "reasoning-start", id: "zai-reasoning-0" })
                    isActiveReasoning = true
                  }
                  controller.enqueue({
                    type: "reasoning-delta",
                    id: "zai-reasoning-0",
                    delta: reasoningDelta
                  })
                }

                if (shouldForwardRawChunks) {
                  controller.enqueue(part)
                }
                return
              }

              if ((part.type === "finish" || part.type === "error") && isActiveReasoning) {
                controller.enqueue({ type: "reasoning-end", id: "zai-reasoning-0" })
                isActiveReasoning = false
              }

              controller.enqueue(part)
            },
            flush(controller) {
              if (isActiveReasoning) {
                controller.enqueue({ type: "reasoning-end", id: "zai-reasoning-0" })
              }
            }
          })
        )
      }
    }
  }
}

/**
 * Z.AI provider implementation using the OpenAI-compatible Chat Completions API.
 */
export class ZaiProvider implements IProvider {
  readonly name = "zhipu"

  createModel(modelId: string, config: ProviderConfig): LanguageModel {
    const baseUrl = normalizeZaiBaseUrl(config.baseUrl)

    const zai = createOpenAI({
      apiKey: config.apiKey,
      baseURL: baseUrl,
      name: "zhipu"
    })

    return withZaiReasoningStream(zai.chat(modelId))
  }
}
