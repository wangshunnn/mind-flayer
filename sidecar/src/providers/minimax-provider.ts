import type { LanguageModel } from "ai"
import { createMinimax } from "vercel-minimax-ai-provider"
import { MODEL_PROVIDERS } from "../config/constants"
import type { ProviderConfig } from "../type"
import type { IProvider } from "./base"

/**
 * MiniMax AI provider implementation.
 * Supports MiniMax API with configurable base URL.
 */
export class MinimaxProvider implements IProvider {
  readonly name = "minimax"

  createModel(modelId: string, config: ProviderConfig): LanguageModel {
    const baseUrl = config.baseUrl || MODEL_PROVIDERS.minimax.defaultBaseUrl

    const minimax = createMinimax({
      baseURL: baseUrl,
      apiKey: config.apiKey
    })

    return minimax(modelId)
  }
}
