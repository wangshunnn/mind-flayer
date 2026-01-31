import { formatShortcutForDisplay } from "@/lib/shortcut-formatter"
import type { ShortcutAction, ShortcutConfig } from "@/types/settings"
import { useSetting } from "./use-settings-store"

/**
 * Hook to access shortcut configuration
 * @returns Current shortcut configuration from settings store
 */
export function useShortcutConfig() {
  const [shortcuts] = useSetting("shortcuts")
  return shortcuts
}

/**
 * Hook to get a specific shortcut configuration
 * @param action - The shortcut action to get
 * @returns The shortcut configuration for the specified action
 */
export function useShortcut(action: ShortcutAction): ShortcutConfig {
  const shortcuts = useShortcutConfig()
  return shortcuts[action]
}

/**
 * Hook to get formatted shortcut keys for display
 * Combines useShortcut and formatShortcutForDisplay for a cleaner API
 * @param action - The shortcut action
 * @returns Array of formatted key symbols (e.g., ["⌘", "B"])
 */
export function useShortcutDisplay(action: ShortcutAction): string[] {
  const shortcut = useShortcut(action)
  return formatShortcutForDisplay(shortcut.key)
}
