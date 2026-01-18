import { useTranslation } from "react-i18next"

/**
 * Hooks for accessing translated text constants
 * Replaces static constants with i18n-powered hooks
 */

// Tool-related constants hook
export function useToolConstants() {
  const { t } = useTranslation("tools")

  return {
    names: {
      webSearch: t("names.webSearch")
    },
    states: {
      working: t("states.working"),
      done: t("states.done"),
      failed: t("states.failed"),
      cancelled: t("states.cancelled"),
      awaitingApproval: t("states.awaitingApproval")
    },
    webSearch: {
      searching: (objective: string) => t("webSearch.searching", { objective }),
      searchedResults: (count: number) => t("webSearch.searchedResults", { count }),
      approvalText: (objective: string) => t("webSearch.approvalText", { objective })
    }
  }
}

// Thinking process constants hook
export function useThinkingConstants() {
  const { t } = useTranslation(["chat", "tools"])

  return {
    thinking: t("message.thinking"),
    thoughtForSeconds: (duration: number) => t("message.thoughtForSeconds", { duration }),
    thoughtForFewSeconds: t("message.thoughtForFewSeconds"),
    for: t("message.for"),
    includingTools: t("message.includingTools"),
    done: t("message.done"),
    toolWorking: t("tools:states.working"),
    toolDone: t("tools:states.done")
  }
}

// Message-related constants hook
export function useMessageConstants() {
  const { t } = useTranslation("chat")

  return {
    abortedMessage: t("message.aborted")
  }
}

// UI action constants hook
export function useActionConstants() {
  const { t } = useTranslation("actions")

  return {
    approve: t("approve"),
    deny: t("deny"),
    submit: t("submit"),
    copy: t("copy"),
    copied: t("copied"),
    copiedSuccess: t("copiedSuccess"),
    edit: t("edit"),
    like: t("like"),
    dislike: t("dislike"),
    share: t("share"),
    regenerate: t("regenerate")
  }
}

// Tooltip constants hook
export function useTooltipConstants() {
  const { t } = useTranslation(["actions", "tools", "chat"])

  return {
    submit: t("actions:submit"),
    stop: t("actions:stop"),
    webSearch: t("tools:buttons.search.tooltip"),
    deepThinking: t("tools:buttons.deepThink.tooltip"),
    selectModel: t("chat:model.selectModel")
  }
}

// Tool button configuration hook
export function useToolButtonConstants() {
  const { t } = useTranslation("tools")

  return {
    webSearch: {
      label: t("buttons.search.label"),
      tooltip: t("buttons.search.tooltip"),
      modes: {
        auto: {
          value: "auto" as const,
          label: t("buttons.search.modes.auto.label"),
          badge: t("buttons.search.modes.auto.badge"),
          description: t("buttons.search.modes.auto.description")
        },
        always: {
          value: "always" as const,
          label: t("buttons.search.modes.always.label"),
          description: t("buttons.search.modes.always.description")
        }
      }
    },
    deepThink: {
      label: t("buttons.deepThink.label"),
      tooltip: t("buttons.deepThink.tooltip")
    }
  }
}

// Toast messages hook
export function useToastConstants() {
  const { t } = useTranslation("common")

  return {
    error: t("toast.error"),
    filesAttached: t("toast.filesAttached"),
    filesAttachedDescription: (count: number) => t("toast.filesAttachedDescription", { count })
  }
}

// Error messages hook
export function useErrorConstants() {
  const { t } = useTranslation("tools")

  return {
    toolCallError: t("errors.toolCallError"),
    toolExecutionDenied: t("errors.toolExecutionDenied"),
    invalidToolName: (name: string) => t("errors.invalidToolName", { name }),
    invalidSegmentType: (type: string) => t("errors.invalidSegmentType", { type })
  }
}

// Footer/Copyright constants hook
export function useFooterConstants() {
  const { t } = useTranslation("common")

  return {
    disclaimer: t("footer.disclaimer"),
    github: t("footer.github"),
    githubUrl: "https://github.com/wangshunnn/mind-flayer"
  }
}
