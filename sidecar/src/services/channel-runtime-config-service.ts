import type { ChannelRuntimeConfig, SelectedModelRuntime } from "../type"

const DEFAULT_RUNTIME_CONFIG: ChannelRuntimeConfig = {
  selectedModel: null,
  channels: {
    telegram: {
      enabled: false
    }
  }
}

/**
 * Stores runtime-only channel state pushed by the desktop frontend.
 * This is intentionally in-memory and does not persist across sidecar restarts.
 */
export class ChannelRuntimeConfigService {
  private config: ChannelRuntimeConfig = structuredClone(DEFAULT_RUNTIME_CONFIG)

  update(nextConfig: ChannelRuntimeConfig): void {
    this.config = {
      selectedModel: nextConfig.selectedModel
        ? {
            provider: nextConfig.selectedModel.provider,
            modelId: nextConfig.selectedModel.modelId
          }
        : null,
      channels: {
        telegram: {
          enabled: nextConfig.channels.telegram.enabled
        }
      }
    }
  }

  getConfig(): ChannelRuntimeConfig {
    return structuredClone(this.config)
  }

  getSelectedModel(): SelectedModelRuntime | null {
    if (!this.config.selectedModel) {
      return null
    }
    return { ...this.config.selectedModel }
  }

  isTelegramEnabled(): boolean {
    return this.config.channels.telegram.enabled
  }
}
