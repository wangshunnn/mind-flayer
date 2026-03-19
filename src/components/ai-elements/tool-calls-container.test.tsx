import type { ToolUIPart } from "ai"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  collectToolCallsSummary,
  ToolCallsSummary
} from "@/components/ai-elements/tool-calls-container"
import i18n from "@/lib/i18n"

const createWebSearchPart = (toolCallId: string) =>
  ({
    type: "tool-webSearch",
    toolCallId,
    state: "output-available",
    input: {
      objective: "Find docs",
      searchQueries: ["docs"]
    },
    output: {
      query: "docs",
      results: [],
      totalResults: 0
    }
  }) as unknown as ToolUIPart

const createBashPart = (toolCallId: string) =>
  ({
    type: "tool-bashExecution",
    toolCallId,
    state: "output-available",
    input: {
      command: "pwd",
      args: []
    },
    output: {
      command: "pwd",
      args: [],
      stdout: "/tmp",
      stderr: "",
      exitCode: 0,
      workingDir: "/tmp",
      executedAt: "2026-03-17T12:00:00.000Z"
    }
  }) as unknown as ToolUIPart

const createSkillReadPart = (toolCallId: string, skillName: string) =>
  ({
    type: "tool-read",
    toolCallId,
    state: "output-available",
    input: {
      filePath: `/tmp/${skillName}/SKILL.md`
    },
    output: {
      filePath: `/tmp/${skillName}/SKILL.md`,
      content: "# Skill",
      offset: 0,
      nextOffset: null,
      truncated: false,
      displayContext: {
        kind: "skill",
        skillName,
        fileKind: "skill-md"
      }
    }
  }) as unknown as ToolUIPart

describe("ToolCallsSummary", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let previousLanguage: string

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    previousLanguage = i18n.language
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage(previousLanguage)
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ""
  })

  it("collects unique tool and skill names while preserving first-seen order", () => {
    expect(
      collectToolCallsSummary([
        createWebSearchPart("tool-1"),
        createSkillReadPart("tool-2", "Postgres Expert"),
        createSkillReadPart("tool-3", "Postgres Expert"),
        createBashPart("tool-4")
      ])
    ).toEqual({
      toolNames: ["webSearch", "read", "bashExecution"],
      skillNames: ["Postgres Expert"]
    })
  })

  it("renders tool and skill badges and exposes names in tooltips", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallsSummary
            toolParts={[
              createWebSearchPart("tool-1"),
              createSkillReadPart("tool-2", "Postgres Expert")
            ]}
          />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("2 tools")
    expect(container.textContent).toContain("1 skill")
    expect(container.querySelectorAll('[data-slot="separator"]')).toHaveLength(1)

    const toolBadge = container.querySelector('[data-summary-badge="tools"]')
    expect(toolBadge).not.toBeNull()

    await act(async () => {
      ;(toolBadge as HTMLElement).focus()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("Web search")
    expect(document.body.textContent).toContain("Read file")

    const skillBadge = container.querySelector('[data-summary-badge="skills"]')
    expect(skillBadge).not.toBeNull()

    await act(async () => {
      ;(skillBadge as HTMLElement).focus()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("Postgres Expert")
  })

  it("does not render a separator when only a tools badge is shown", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallsSummary toolParts={[createWebSearchPart("tool-1")]} />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("1 tool")
    expect(container.querySelectorAll('[data-slot="separator"]')).toHaveLength(0)
  })

  it("does not render a separator when no summary badges are shown", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallsSummary toolParts={[]} />
        </I18nextProvider>
      )
    })

    expect(container.querySelector('[data-summary-badge="tools"]')).toBeNull()
    expect(container.querySelector('[data-summary-badge="skills"]')).toBeNull()
    expect(container.querySelectorAll('[data-slot="separator"]')).toHaveLength(0)
  })
})
