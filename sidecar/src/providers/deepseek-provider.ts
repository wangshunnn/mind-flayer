import { createDeepSeek } from "@ai-sdk/deepseek"
import type { LanguageModel } from "ai"
import { MODEL_PROVIDERS } from "../config/constants"
import type { ProviderConfig } from "../type"
import { createDeepSeekReasoningReplayFetch } from "../utils/deepseek-reasoning-replay"
import type { IProvider, ProviderRuntimeOptions } from "./base"

/**
 * DeepSeek provider implementation using the official AI SDK provider.
 */
export class DeepSeekProvider implements IProvider {
  readonly name = "deepseek"

  createModel(
    modelId: string,
    config: ProviderConfig,
    options?: ProviderRuntimeOptions
  ): LanguageModel {
    const baseUrl = config.baseUrl || MODEL_PROVIDERS.deepseek.defaultBaseUrl
    const fetch = options?.deepSeekReasoningReplayMessages
      ? createDeepSeekReasoningReplayFetch(options.deepSeekReasoningReplayMessages)
      : undefined

    const deepseek = createDeepSeek({
      apiKey: config.apiKey,
      baseURL: baseUrl,
      ...(fetch ? { fetch } : {})
    })

    return deepseek(modelId)
  }
}
