import { emit, listen } from "@tauri-apps/api/event"
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
 * Deep merge two objects, with source taking precedence
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return source as T
  }

  const result = { ...target } as T

  for (const key in source) {
    const sourceValue = source[key]
    const targetValue = target[key]

    // Check if both values are objects (excluding null and arrays) for deep merge
    if (
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue)
    } else if (sourceValue !== undefined) {
      // @ts-expect-error - Direct assignment is safe here
      result[key] = sourceValue
    }
  }

  return result
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

    // If no stored value, use default
    if (value === null || value === undefined) {
      return DEFAULT_SETTINGS[key]
    }

    // For object-type settings (like shortcuts), deep merge with defaults
    // to ensure new properties are included
    const defaultValue = DEFAULT_SETTINGS[key]
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof defaultValue === "object" &&
      !Array.isArray(defaultValue)
    ) {
      return deepMerge(defaultValue, value as Partial<AppSettings[K]>)
    }

    return value
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

    // Emit event to notify other windows about the change
    await emit("setting-changed", { key, value })
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

  // Listen for cross-window setting changes
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      unlisten = await listen<{ key: keyof AppSettings; value: unknown }>(
        "setting-changed",
        event => {
          // Only update if this is the setting we're tracking
          if (event.payload.key === key) {
            setValue(event.payload.value as AppSettings[K])
          }
        }
      )
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
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

  // Listen for cross-window setting changes
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      unlisten = await listen<{ key: keyof AppSettings; value: unknown }>(
        "setting-changed",
        event => {
          setSettings(prev => ({
            ...prev,
            [event.payload.key]: event.payload.value
          }))
        }
      )
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [])

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    await setSetting(key, value)
  }

  return [settings, updateSetting]
}
