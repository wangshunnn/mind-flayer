import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { MODEL_PROVIDERS } from "../config/constants"
import type { ProviderConfig } from "../type"
import type { IProvider } from "./base"

/**
 * OpenAI provider implementation using the official AI SDK provider.
 */
export class OpenAIProvider implements IProvider {
  readonly name = "openai"

  createModel(modelId: string, config: ProviderConfig): LanguageModel {
    const baseUrl = config.baseUrl || MODEL_PROVIDERS.openai.defaultBaseUrl

    const openai = createOpenAI({
      apiKey: config.apiKey,
      baseURL: baseUrl
    })

    return openai(modelId)
  }
}
