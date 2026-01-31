import { useEffect } from "react"
import { shortcutRegistry } from "@/lib/shortcut-registry"
import type { ShortcutAction } from "@/types/settings"

/**
 * Registers a local keyboard shortcut handler
 *
 * This hook provides an elegant, composable way to register keyboard shortcuts.
 * All shortcuts are managed through a centralized global registry with a single
 * event listener for optimal performance.
 *
 * Features:
 * - Automatic event listener management via global registry
 * - Dynamic configuration updates (changes in settings apply immediately)
 * - Automatic cleanup on component unmount
 * - Respects enabled/disabled state and scope from settings
 *
 * @param action - The shortcut action to register
 * @param handler - Callback function to execute when shortcut is triggered (should be memoized with useCallback)
 * @param options - Optional configuration
 *
 * @example
 * // Simple usage
 * const toggleSidebar = useCallback(() => { ... }, [deps])
 * useLocalShortcut(ShortcutAction.TOGGLE_SIDEBAR, toggleSidebar)
 *
 * @example
 * // Multiple shortcuts in a component
 * const handleNewChat = useCallback(() => { ... }, [deps])
 * const handleSearch = useCallback(() => { ... }, [deps])
 *
 * useLocalShortcut(ShortcutAction.NEW_CHAT, handleNewChat)
 * useLocalShortcut(ShortcutAction.SEARCH_HISTORY, handleSearch)
 *
 * @example
 * // Without preventing default
 * useLocalShortcut(ShortcutAction.CUSTOM_ACTION, handleAction, {
 *   preventDefault: false
 * })
 */
export function useLocalShortcut(
  action: ShortcutAction,
  handler: () => void,
  options?: {
    /** Prevent default browser behavior (default: true) */
    preventDefault?: boolean
  }
) {
  const preventDefault = options?.preventDefault

  useEffect(() => {
    shortcutRegistry.register(action, handler, { preventDefault })
    return () => shortcutRegistry.unregister(action)
  }, [action, handler, preventDefault])
}
