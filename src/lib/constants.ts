import { useMemo } from "react"
import { useTranslation } from "react-i18next"

/**
 * Hooks for accessing translated text constants
 * Replaces static constants with i18n-powered hooks
 */

// Tool-related constants hook
export function useToolConstants() {
  const { t } = useTranslation("tools")

  return useMemo(
    () => ({
      names: {
        webSearch: t("names.webSearch"),
        bashExecution: t("names.bashExecution"),
        read: t("names.read"),
        skillRead: t("names.skillRead")
      },
      states: {
        running: t("states.running"),
        done: t("states.done"),
        failed: t("states.failed"),
        cancelled: t("states.cancelled"),
        awaitingApproval: t("states.awaitingApproval")
      },
      webSearch: {
        searching: t("webSearch.searching"),
        searchedResults: (count: number) => t("webSearch.searchedResults", { count }),
        approvalText: (objective: string) => t("webSearch.approvalText", { objective })
      },
      read: {
        input: (filePath: string) => t("read.input", { filePath }),
        inputWithOffset: (filePath: string, offset: number) =>
          t("read.inputWithOffset", { filePath, offset }),
        complete: t("read.complete"),
        chunk: (nextOffset: number) => t("read.chunk", { nextOffset }),
        fileDescription: (filePath: string) => t("read.fileDescription", { filePath }),
        fileDescriptionWithOffset: (filePath: string, offset: number) =>
          t("read.fileDescriptionWithOffset", { filePath, offset }),
        emptyFile: t("read.emptyFile"),
        nextOffset: (nextOffset: number) => t("read.nextOffset", { nextOffset })
      },
      bashExecution: {
        exitCode: (code: number) => t("bashExecution.exitCode", { code })
      },
      skillRead: {
        badge: t("skillRead.badge"),
        loaded: (skillName: string) => t("skillRead.loaded", { skillName }),
        chunk: (skillName: string, nextOffset: number) =>
          t("skillRead.chunk", { skillName, nextOffset }),
        fileKind: (fileKind: "skill-md" | "reference" | "script" | "other") =>
          t(`skillRead.fileKinds.${fileKind}`)
      }
    }),
    [t]
  )
}

// Thinking process constants hook
export function useThinkingConstants() {
  const { t } = useTranslation(["chat", "tools"])

  return useMemo(
    () => ({
      thinking: t("message.thinking"),
      thoughtForSeconds: (duration: number) => t("message.thoughtForSeconds", { duration }),
      thoughtForFewSeconds: t("message.thoughtForFewSeconds"),
      for: t("message.for"),
      includingTools: t("message.includingTools"),
      done: t("message.done"),
      toolRunning: t("tools:states.running"),
      toolDone: t("tools:states.done")
    }),
    [t]
  )
}

// Message-related constants hook
export function useMessageConstants() {
  const { t } = useTranslation("chat")

  return useMemo(
    () => ({
      abortedMessage: t("message.aborted")
    }),
    [t]
  )
}

// UI action constants hook
export function useActionConstants() {
  const { t } = useTranslation("actions")

  return useMemo(
    () => ({
      approve: t("approve"),
      deny: t("deny"),
      submit: t("submit"),
      copy: t("copy"),
      copied: t("copied"),
      copiedSuccess: t("copiedSuccess"),
      edit: t("edit"),
      like: t("like"),
      dislike: t("dislike"),
      regenerate: t("regenerate")
    }),
    [t]
  )
}

// Tooltip constants hook
export function useTooltipConstants() {
  const { t } = useTranslation(["actions", "tools", "chat"])

  return useMemo(
    () => ({
      submit: t("actions:submit"),
      stop: t("actions:stop"),
      webSearch: t("tools:buttons.search.tooltip"),
      reasoning: t("tools:buttons.reasoning.tooltip"),
      selectModel: t("chat:model.selectModel")
    }),
    [t]
  )
}

// Tool button configuration hook
export function useToolButtonConstants() {
  const { t } = useTranslation("tools")

  return useMemo(
    () => ({
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
      reasoning: {
        label: t("buttons.reasoning.label"),
        tooltip: t("buttons.reasoning.tooltip"),
        description: t("buttons.reasoning.description"),
        modes: {
          default: {
            value: "default" as const,
            label: t("buttons.reasoning.modes.default.label"),
            badge: t("buttons.reasoning.modes.default.badge"),
            description: t("buttons.reasoning.modes.default.description")
          },
          low: {
            value: "low" as const,
            label: t("buttons.reasoning.modes.low.label"),
            description: t("buttons.reasoning.modes.low.description")
          },
          medium: {
            value: "medium" as const,
            label: t("buttons.reasoning.modes.medium.label"),
            description: t("buttons.reasoning.modes.medium.description")
          },
          high: {
            value: "high" as const,
            label: t("buttons.reasoning.modes.high.label"),
            description: t("buttons.reasoning.modes.high.description")
          },
          xhigh: {
            value: "xhigh" as const,
            label: t("buttons.reasoning.modes.xhigh.label"),
            description: t("buttons.reasoning.modes.xhigh.description")
          }
        }
      }
    }),
    [t]
  )
}

// Toast messages hook
export function useToastConstants() {
  const { t } = useTranslation("common")

  return useMemo(
    () => ({
      error: t("toast.error"),
      filesAttached: t("toast.filesAttached"),
      apiKeyNotConfigured: t("toast.apiKeyNotConfigured"),
      filesAttachedDescription: (count: number) => t("toast.filesAttachedDescription", { count })
    }),
    [t]
  )
}

// Error messages hook
export function useErrorConstants() {
  const { t } = useTranslation("tools")

  return useMemo(
    () => ({
      toolCallError: t("errors.toolCallError"),
      toolExecutionDenied: t("errors.toolExecutionDenied"),
      invalidToolName: (name: string) => t("errors.invalidToolName", { name }),
      invalidSegmentType: (type: string) => t("errors.invalidSegmentType", { type })
    }),
    [t]
  )
}
