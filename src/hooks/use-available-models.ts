import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useState } from "react"
import type { ModelOption } from "@/components/select-model"
import { MODEL_PROVIDERS } from "@/pages/Settings"
import { useProviderConfig } from "./use-provider-config"
import { useSetting } from "./use-settings-store"

export function useAvailableModels() {
  const { listProviders } = useProviderConfig()
  const [enabledProviders] = useSetting("enabledProviders")
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadAvailableModels = useCallback(async () => {
    try {
      setIsLoading(true)

      const configuredProviders = await listProviders()
      const models: ModelOption[] = []

      for (const provider of MODEL_PROVIDERS) {
        // Check if provider is enabled in settings
        const isEnabled = enabledProviders[provider.id] ?? true
        // Check if provider is configured (has API key saved)
        const isConfigured = configuredProviders.includes(provider.id)

        if (isEnabled && isConfigured && provider.models) {
          for (const model of provider.models) {
            models.push({
              provider: provider.id,
              label: model.label,
              api_id: model.api_id
            })
          }
        }
      }

      setAvailableModels(models)
    } catch (error) {
      console.error("Failed to load available models:", error)
      setAvailableModels([])
    } finally {
      setIsLoading(false)
    }
  }, [listProviders, enabledProviders])

  // Load on mount
  useEffect(() => {
    loadAvailableModels()
  }, [loadAvailableModels])

  // Listen for provider configuration changes from any window
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      unlisten = await listen<{ provider: string; action: string }>(
        "provider-config-changed",
        () => {
          loadAvailableModels()
        }
      )
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [loadAvailableModels])

  return { availableModels, isLoading }
}
