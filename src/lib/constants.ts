/**
 * Centralized text constants for UI components
 * Structured for future i18n/multi-language support
 */

// Tool-related constants
export const TOOL_CONSTANTS = {
  // Tool display names (API name -> Display name mapping)
  names: {
    webSearch: "Web Search"
  } as const,

  // Tool state messages
  states: {
    working: "Working...",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
    awaitingApproval: "Awaiting approval..."
  } as const,

  // Tool-specific messages
  webSearch: {
    searching: (objective: string) => `Searching "${objective}"`,
    searchedResults: (count: number) => `Searched ${count} results`,
    approvalText: (objective: string) => `The AI wants to search the web for: "${objective}"`
  }
} as const

// Thinking process constants
export const THINKING_CONSTANTS = {
  thinking: "Thinking...",
  thoughtForSeconds: (duration: number) => `Thought for ${duration}s`,
  thoughtForFewSeconds: "Thought for a few seconds",
  for: "for",
  includingTools: "including tools",
  working: "Working...",
  done: "Done"
} as const

// UI action constants
export const ACTION_CONSTANTS = {
  approve: "Approve",
  deny: "Deny",
  submit: "Submit",
  copy: "Copy",
  copied: "Copied",
  copiedSuccess: "Copied!",
  edit: "Edit",
  like: "Like",
  dislike: "Dislike",
  share: "Share",
  regenerate: "Regenerate"
} as const

// Tooltip constants
export const TOOLTIP_CONSTANTS = {
  submit: "Submit",
  webSearch: "Web search",
  deepThinking: "Deep thinking",
  selectModel: "Select Model"
} as const

// Tool button configuration
export const TOOL_BUTTON_CONSTANTS = {
  webSearch: {
    label: "Search",
    tooltip: "Web search",
    modes: {
      auto: {
        value: "auto" as const,
        label: "Auto",
        badge: "Recommended",
        description: "Search only when needed"
      },
      always: {
        value: "always" as const,
        label: "Always",
        description: "Search for every query"
      }
    }
  },
  deepThink: {
    label: "DeepThink",
    tooltip: "Deep thinking"
  }
} as const

// Toast messages
export const TOAST_CONSTANTS = {
  error: "Error",
  filesAttached: "Files attached",
  filesAttachedDescription: (count: number) => `${count} file(s) attached to message`
} as const

// Error messages
export const ERROR_CONSTANTS = {
  toolCallError: "An error occurred",
  toolExecutionDenied: "Tool execution was denied by user",
  invalidToolName: (name: string) => `Invalid tool name: ${name}`,
  invalidSegmentType: (type: string) => `Invalid segment type: ${type}`
} as const

// Footer/Copyright constants
export const FOOTER_CONSTANTS = {
  disclaimer: "AI-generated content, for reference only. Star at",
  github: "Github",
  githubUrl: "https://github.com/wangshunnn/mind-flayer"
} as const

// Utility functions for text formatting
export const TEXT_UTILS = {
  /**
   * Get display name for a tool based on its API identifier
   */
  getToolDisplayName: (apiName: string): string => {
    return TOOL_CONSTANTS.names[apiName as keyof typeof TOOL_CONSTANTS.names] || apiName
  },

  /**
   * Pluralize text based on count
   */
  pluralize: (count: number, singular: string, plural?: string): string => {
    if (count === 1) return `${count} ${singular}`
    return `${count} ${plural || `${singular}s`}`
  },

  /**
   * Format duration in seconds
   */
  formatDuration: (seconds: number): string => {
    return `${seconds}s`
  }
} as const
