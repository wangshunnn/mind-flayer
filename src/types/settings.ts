export type Theme = "dark" | "light" | "system"
export type Language = "en" | "zh-CN" | "system"
export type WebSearchMode = "auto" | "always"

/**
 * Shortcut scope - global (system-wide) or local (app-only)
 */
export type ShortcutScope = "global" | "local"

/**
 * Shortcut action identifiers
 */
export enum ShortcutAction {
  TOGGLE_WINDOW = "toggleWindow",
  TOGGLE_SIDEBAR = "toggleSidebar",
  OPEN_SETTINGS = "openSettings",
  SEARCH_HISTORY = "searchHistory",
  SEND_MESSAGE = "sendMessage",
  NEW_LINE = "newLine",
  NEW_CHAT = "newChat"
}

/**
 * Shortcut configuration
 */
export interface ShortcutConfig {
  /** Unique identifier */
  id: ShortcutAction
  /** Keyboard shortcut key combination (macOS format) */
  key: string
  /** Whether this shortcut is enabled */
  enabled: boolean
  /** Shortcut scope */
  scope: ShortcutScope
}

export interface AppSettings {
  // Theme settings
  theme: Theme

  // Language settings
  language: Language

  // Model settings
  selectedModelApiId: string

  // Provider settings
  enabledProviders: Record<string, boolean>

  // Tool settings
  webSearchEnabled: boolean
  webSearchMode: WebSearchMode
  deepThinkEnabled: boolean

  // App settings
  autoLaunch: boolean

  // Keyboard shortcuts
  shortcuts: Record<ShortcutAction, ShortcutConfig>
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  language: "system",
  selectedModelApiId: "MiniMax-M2.1",
  enabledProviders: {
    minimax: false,
    parallel: false
  },
  webSearchEnabled: true,
  webSearchMode: "auto",
  deepThinkEnabled: true,
  autoLaunch: false,
  shortcuts: {
    [ShortcutAction.TOGGLE_WINDOW]: {
      id: ShortcutAction.TOGGLE_WINDOW,
      key: "Shift+Alt+W",
      enabled: true,
      scope: "global"
    },
    [ShortcutAction.TOGGLE_SIDEBAR]: {
      id: ShortcutAction.TOGGLE_SIDEBAR,
      key: "CommandOrControl+B",
      enabled: true,
      scope: "local"
    },
    [ShortcutAction.OPEN_SETTINGS]: {
      id: ShortcutAction.OPEN_SETTINGS,
      key: "CommandOrControl+,",
      enabled: true,
      scope: "local"
    },
    [ShortcutAction.SEARCH_HISTORY]: {
      id: ShortcutAction.SEARCH_HISTORY,
      key: "CommandOrControl+F",
      enabled: true,
      scope: "local"
    },
    [ShortcutAction.SEND_MESSAGE]: {
      id: ShortcutAction.SEND_MESSAGE,
      key: "Enter",
      enabled: true,
      scope: "local"
    },
    [ShortcutAction.NEW_LINE]: {
      id: ShortcutAction.NEW_LINE,
      key: "CommandOrControl+Enter",
      enabled: true,
      scope: "local"
    },
    [ShortcutAction.NEW_CHAT]: {
      id: ShortcutAction.NEW_CHAT,
      key: "CommandOrControl+N",
      enabled: true,
      scope: "local"
    }
  }
}

export interface ProviderFormData {
  apiKey: string
  baseUrl: string
}
