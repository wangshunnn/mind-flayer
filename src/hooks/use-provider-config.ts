import { invoke } from "@tauri-apps/api/core"
import { useCallback, useState } from "react"

export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
}

export interface UseProviderConfigReturn {
  saveConfig: (provider: string, apiKey: string, baseUrl?: string) => Promise<void>
  getConfig: (provider: string) => Promise<ProviderConfig | null>
  deleteConfig: (provider: string) => Promise<void>
  listProviders: () => Promise<string[]>
  isLoading: boolean
  error: string | null
}

/**
 * Hook to manage provider API key configurations
 * Stores configs in system keychain and Tauri automatically pushes to sidecar
 */
export function useProviderConfig(): UseProviderConfigReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveConfig = useCallback(async (provider: string, apiKey: string, baseUrl?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      // Save to system keychain via Tauri (Tauri will push to sidecar automatically)
      await invoke("save_provider_config", {
        provider,
        apiKey,
        baseUrl: baseUrl || null
      })

      console.log(`[useProviderConfig] Saved config for ${provider}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save configuration"
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getConfig = useCallback(async (provider: string): Promise<ProviderConfig | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const config = await invoke<ProviderConfig>("get_provider_config", { provider })
      console.log(`[useProviderConfig] Retrieved config for ${provider}`)
      return config
    } catch {
      // Don't treat "not found" as an error, just return null
      console.log(`[useProviderConfig] No config found for ${provider}`)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const deleteConfig = useCallback(async (provider: string) => {
    setIsLoading(true)
    setError(null)

    try {
      // Delete from system keychain via Tauri (Tauri will push to sidecar automatically)
      await invoke("delete_provider_config", { provider })

      console.log(`[useProviderConfig] Deleted config for ${provider}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete configuration"
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const listProviders = useCallback(async (): Promise<string[]> => {
    setIsLoading(true)
    setError(null)

    try {
      const providers = await invoke<string[]>("list_all_providers")
      return providers
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list providers"
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    saveConfig,
    getConfig,
    deleteConfig,
    listProviders,
    isLoading,
    error
  }
}
