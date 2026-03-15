import { createAnthropic } from "@ai-sdk/anthropic"
import type { LanguageModel } from "ai"
import { MODEL_PROVIDERS } from "../config/constants"
import type { ProviderConfig } from "../type"
import type { IProvider } from "./base"

/**
 * Anthropic provider implementation using the official AI SDK provider.
 */
export class AnthropicProvider implements IProvider {
  readonly name = "anthropic"

  createModel(modelId: string, config: ProviderConfig): LanguageModel {
    const baseUrl = config.baseUrl || MODEL_PROVIDERS.anthropic.defaultBaseUrl

    const anthropic = createAnthropic({
      apiKey: config.apiKey,
      baseURL: baseUrl
    })

    return anthropic(modelId)
  }
}
