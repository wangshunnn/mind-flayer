import { load } from "@tauri-apps/plugin-store"
import { useEffect, useState } from "react"
import { type AppSettings, DEFAULT_SETTINGS } from "@/types/settings"

const STORE_FILE = "settings.json"
let storeInstance: Awaited<ReturnType<typeof load>> | null = null

/**
 * Get the store instance, creating it if it doesn't exist
 */
async function getStore() {
  if (!storeInstance) {
    try {
      storeInstance = await load(STORE_FILE, {
        autoSave: true,
        defaults: DEFAULT_SETTINGS as unknown as Record<string, unknown>
      })
    } catch (error) {
      console.warn("Failed to load settings store, using defaults:", error)
      return null
    }
  }
  return storeInstance
}

/**
 * Get a setting value from the store
 */
export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  try {
    const store = await getStore()
    if (!store) {
      return DEFAULT_SETTINGS[key]
    }

    const value = await store.get<AppSettings[K]>(key)
    return value ?? DEFAULT_SETTINGS[key]
  } catch (error) {
    console.warn(`Failed to get setting "${key}", using default:`, error)
    return DEFAULT_SETTINGS[key]
  }
}

/**
 * Set a setting value in the store
 */
export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  try {
    const store = await getStore()
    if (!store) {
      console.warn(`Cannot save setting "${key}" - store not available`)
      return
    }

    await store.set(key, value)
    console.log(`Setting "${key}" updated to`, value)
  } catch (error) {
    console.error(`Failed to set setting "${key}":`, error)
  }
}

/**
 * React hook to use a specific setting with persistence
 */
export function useSetting<K extends keyof AppSettings>(
  key: K
): [AppSettings[K], (value: AppSettings[K]) => Promise<void>] {
  const [value, setValue] = useState<AppSettings[K]>(DEFAULT_SETTINGS[key])

  // Load initial value from store
  useEffect(() => {
    let mounted = true

    getSetting(key).then(storedValue => {
      if (mounted) {
        setValue(storedValue)
      }
    })

    return () => {
      mounted = false
    }
  }, [key])

  // Update function that persists to store and updates state
  const updateValue = async (newValue: AppSettings[K]) => {
    setValue(newValue)
    await setSetting(key, newValue)
  }

  return [value, updateValue]
}

/**
 * React hook to get all settings
 */
export function useSettings(): [
  AppSettings,
  <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
] {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let mounted = true

    async function loadAllSettings() {
      const keys = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]
      const loadedSettings = { ...DEFAULT_SETTINGS } as AppSettings

      await Promise.all(
        keys.map(async key => {
          const value = await getSetting(key)
          // @ts-expect-error - Dynamic key assignment is safe here
          loadedSettings[key] = value
        })
      )

      if (mounted) {
        setSettings(loadedSettings)
      }
    }

    loadAllSettings()

    return () => {
      mounted = false
    }
  }, [])

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    await setSetting(key, value)
  }

  return [settings, updateSetting]
}
