import { listen } from "@tauri-apps/api/event"
import { getSetting } from "@/hooks/use-settings-store"
import { matchesShortcut } from "@/lib/shortcut-utils"
import type { ShortcutAction, ShortcutConfig } from "@/types/settings"

/**
 * Global keyboard shortcut registry
 *
 * Manages all local-scoped keyboard shortcuts with a single global event listener.
 * Automatically syncs with settings changes and supports dynamic configuration updates.
 */
class ShortcutRegistry {
  private handlers = new Map<ShortcutAction, { handler: () => void; preventDefault: boolean }>()
  private settingsUnlistener: (() => void) | null = null
  private globalListener: ((e: KeyboardEvent) => void) | null = null
  private currentShortcuts: Record<ShortcutAction, ShortcutConfig> = {} as Record<
    ShortcutAction,
    ShortcutConfig
  >
  private isAttached = false
  private pendingListenerSetup: Promise<(() => void) | null> | null = null

  /**
   * Register a handler for a shortcut action
   */
  register(
    action: ShortcutAction,
    handler: () => void,
    options?: { preventDefault?: boolean }
  ): void {
    const preventDefault = options?.preventDefault ?? true
    this.handlers.set(action, { handler, preventDefault })

    // Lazy initialization: attach global listener on first registration
    if (this.handlers.size === 1) {
      this.attachGlobalListener()
    }
  }

  /**
   * Unregister a handler for a shortcut action
   */
  unregister(action: ShortcutAction): void {
    this.handlers.delete(action)

    // Cleanup: detach global listener when all handlers are removed
    if (this.handlers.size === 0) {
      this.detachGlobalListener()
    }
  }

  /**
   * Attach the global keydown listener and settings sync
   */
  private attachGlobalListener(): void {
    this.isAttached = true

    // Create and bind the global keydown handler
    this.globalListener = this.handleGlobalKeyDown.bind(this)
    window.addEventListener("keydown", this.globalListener)

    // Load initial shortcuts configuration
    getSetting("shortcuts").then(shortcuts => {
      this.currentShortcuts = shortcuts
    })

    // Subscribe to settings changes (store promise to handle async teardown)
    this.pendingListenerSetup = listen<{ key: string; value: unknown }>(
      "setting-changed",
      event => {
        if (event.payload.key === "shortcuts") {
          this.updateShortcuts(event.payload.value as Record<ShortcutAction, ShortcutConfig>)
        }
      }
    ).then(unlisten => {
      // Check if we've been detached while the promise was pending
      if (!this.isAttached) {
        unlisten()
        return null
      }
      this.settingsUnlistener = unlisten
      this.pendingListenerSetup = null
      return unlisten
    })
  }

  /**
   * Detach the global keydown listener and cleanup
   */
  private detachGlobalListener(): void {
    this.isAttached = false

    if (this.globalListener) {
      window.removeEventListener("keydown", this.globalListener)
      this.globalListener = null
    }

    if (this.settingsUnlistener) {
      this.settingsUnlistener()
      this.settingsUnlistener = null
    }

    // Handle pending listener setup - await and unlisten if it resolves
    if (this.pendingListenerSetup) {
      this.pendingListenerSetup.then(unlisten => {
        if (unlisten) {
          unlisten()
        }
      })
      this.pendingListenerSetup = null
    }
  }

  /**
   * Handle global keydown events and route to registered handlers
   */
  private handleGlobalKeyDown(event: KeyboardEvent): void {
    for (const [action, { handler, preventDefault }] of this.handlers.entries()) {
      const config = this.currentShortcuts[action]

      // Skip if shortcut is not configured, disabled, or not local-scoped
      if (!config || !config.enabled || config.scope !== "local") {
        continue
      }

      // Check if the event matches the shortcut key
      if (matchesShortcut(event, config.key)) {
        if (preventDefault) {
          event.preventDefault()
        }
        handler()
        // Don't break - allow multiple actions to handle the same key if needed
      }
    }
  }

  /**
   * Update the shortcuts configuration cache
   */
  private updateShortcuts(newShortcuts: Record<ShortcutAction, ShortcutConfig>): void {
    this.currentShortcuts = newShortcuts
  }

  /**
   * Validate a shortcut key format
   * @returns true if the key format is valid
   */
  validateShortcutKey(key: string): boolean {
    if (!key || typeof key !== "string") {
      return false
    }

    // Must contain at least one part (can be a single key or modifier+key)
    const parts = key.split("+").map(p => p.trim())
    if (parts.length === 0) {
      return false
    }

    // Last part should be a key, not empty
    const keyPart = parts[parts.length - 1]
    if (!keyPart) {
      return false
    }

    return true
  }

  /**
   * Detect conflicts with other enabled shortcuts
   * @returns Array of conflicting actions
   */
  detectConflicts(action: ShortcutAction, newKey: string): ShortcutAction[] {
    const conflicts: ShortcutAction[] = []

    for (const [otherAction, config] of Object.entries(this.currentShortcuts)) {
      // Skip the action itself and disabled/global shortcuts
      if (otherAction === action || !config.enabled || config.scope !== "local" || !config.key) {
        continue
      }

      // Normalize keys for comparison (case-insensitive)
      const normalizedNewKey = newKey.toLowerCase().replace(/\s+/g, "")
      const normalizedExistingKey = config.key.toLowerCase().replace(/\s+/g, "")

      if (normalizedNewKey === normalizedExistingKey) {
        conflicts.push(otherAction as ShortcutAction)
      }
    }

    return conflicts
  }
}

/**
 * Global singleton instance
 */
export const shortcutRegistry = new ShortcutRegistry()
