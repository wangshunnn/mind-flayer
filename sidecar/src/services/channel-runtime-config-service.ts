import type { ChannelRuntimeConfig, SelectedModelRuntime } from "../type"

const DEFAULT_RUNTIME_CONFIG: ChannelRuntimeConfig = {
  selectedModel: null,
  channels: {
    telegram: {
      enabled: false,
      allowedUserIds: []
    }
  },
  disabledSkills: []
}

/**
 * Stores runtime-only channel state pushed by the desktop frontend.
 * This is intentionally in-memory and does not persist across sidecar restarts.
 */
export class ChannelRuntimeConfigService {
  private config: ChannelRuntimeConfig = structuredClone(DEFAULT_RUNTIME_CONFIG)

  update(
    nextConfig: Omit<ChannelRuntimeConfig, "disabledSkills"> & { disabledSkills?: string[] }
  ): void {
    const disabledSkills = nextConfig.disabledSkills ?? this.config.disabledSkills ?? []

    this.config = {
      selectedModel: nextConfig.selectedModel
        ? {
            provider: nextConfig.selectedModel.provider,
            modelId: nextConfig.selectedModel.modelId
          }
        : null,
      channels: {
        telegram: {
          enabled: nextConfig.channels.telegram.enabled,
          allowedUserIds: Array.from(
            new Set(
              nextConfig.channels.telegram.allowedUserIds
                .map(value => value.trim())
                .filter(value => value.length > 0)
            )
          )
        }
      },
      disabledSkills: Array.from(
        new Set(disabledSkills.map(value => value.trim()).filter(value => value.length > 0))
      )
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

  getAllowedTelegramUserIds(): string[] {
    return [...this.config.channels.telegram.allowedUserIds]
  }

  getDisabledSkillIds(): string[] {
    return [...this.config.disabledSkills]
  }
}
