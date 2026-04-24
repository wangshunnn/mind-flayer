import { createDeepSeek } from "@ai-sdk/deepseek"
import type { LanguageModel } from "ai"
import { MODEL_PROVIDERS } from "../config/constants"
import type { ProviderConfig } from "../type"
import type { IProvider } from "./base"

/**
 * DeepSeek provider implementation using the official AI SDK provider.
 */
export class DeepSeekProvider implements IProvider {
  readonly name = "deepseek"

  createModel(modelId: string, config: ProviderConfig): LanguageModel {
    const baseUrl = config.baseUrl || MODEL_PROVIDERS.deepseek.defaultBaseUrl

    const deepseek = createDeepSeek({
      apiKey: config.apiKey,
      baseURL: baseUrl
    })

    return deepseek(modelId)
  }
}
