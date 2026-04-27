import type { ToolUIPart } from "ai"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  collectToolCallsSummary,
  ToolCallsSummary,
  ToolCallTimelineItem
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

const createBashPartWithOutput = (
  toolCallId: string,
  output: {
    stdout: string
    stderr: string
    exitCode?: number
  }
) =>
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
      stdout: output.stdout,
      stderr: output.stderr,
      exitCode: output.exitCode ?? 0,
      workingDir: "/tmp",
      executedAt: "2026-03-17T12:00:00.000Z"
    }
  }) as unknown as ToolUIPart

const createBashApprovalPart = (toolCallId: string) =>
  ({
    type: "tool-bashExecution",
    toolCallId,
    state: "approval-requested",
    approval: {
      id: "approval-1"
    },
    input: {
      command: "ls",
      args: ["-la"]
    }
  }) as unknown as ToolUIPart

const createBashErrorPart = (toolCallId: string) =>
  ({
    type: "tool-bashExecution",
    toolCallId,
    state: "output-error",
    errorText: "Command execution failed",
    input: {
      command: "cat",
      args: ["missing.txt"]
    }
  }) as unknown as ToolUIPart

const createBashDeniedPart = (toolCallId: string) =>
  ({
    type: "tool-bashExecution",
    toolCallId,
    state: "output-denied",
    errorText: "Execution denied",
    input: {
      command: "rm",
      args: ["-rf", "/tmp/demo"]
    }
  }) as unknown as ToolUIPart

const createAgentSessionPart = (toolCallId: string) =>
  ({
    type: "tool-agentSessionStart",
    toolCallId,
    state: "output-available",
    input: {
      agent: "codex",
      mode: "exec",
      cwd: "/tmp/project",
      prompt: "Fix tests"
    },
    output: {
      sessionId: "session-1",
      agent: "codex",
      mode: "exec",
      cwd: "/tmp/project",
      status: "running",
      exitCode: null,
      startedAt: "2026-03-17T12:00:00.000Z",
      updatedAt: "2026-03-17T12:00:01.000Z",
      output: "Codex is working",
      nextOffset: null,
      commandPreview: "codex exec --cd /tmp/project 'Fix tests'"
    }
  }) as unknown as ToolUIPart

const createAppendWorkspaceSectionPart = (toolCallId: string) =>
  ({
    type: "tool-appendWorkspaceSection",
    toolCallId,
    state: "output-available",
    input: {
      path: "USER.md",
      sectionTitle: "Identity",
      content: "Prefers compact UI."
    },
    output: {
      path: "USER.md",
      sectionTitle: "Identity",
      bytesWritten: 19,
      createdFile: false,
      createdSection: false
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

async function wait(ms: number) {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

async function hover(element: Element, delayMs = 0) {
  await act(async () => {
    element.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }))
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }))
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    if (element instanceof HTMLElement) {
      element.focus()
    }
    await wait(delayMs > 0 ? delayMs : 10)
  })
}

async function click(element: Element, delayMs = 0) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await wait(delayMs > 0 ? delayMs : 10)
  })
}

describe("ToolCallsSummary", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let previousLanguage: string
  let previousPointerEvent: typeof PointerEvent | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    previousPointerEvent = globalThis.PointerEvent
    if (typeof globalThis.PointerEvent === "undefined") {
      ;(globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent =
        MouseEvent as typeof PointerEvent
    }
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
    ;(globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent = previousPointerEvent
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

    await hover(toolBadge as HTMLElement, 100)

    expect(document.body.textContent).toContain("Web search")
    expect(document.body.textContent).toContain("Read file")

    const skillBadge = container.querySelector('[data-summary-badge="skills"]')
    expect(skillBadge).not.toBeNull()

    await hover(skillBadge as HTMLElement, 100)

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

  it("renders bash output in a single terminal transcript", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallTimelineItem
            duration={0.25}
            onToolApprovalResponse={vi.fn()}
            part={createBashPart("tool-bash")}
          />
        </I18nextProvider>
      )
    })

    expect(container.querySelector('[data-terminal="true"]')).toBeNull()
    expect(container.textContent).toContain("0.25 s")
    expect(container.textContent).toContain("Done")
    expect(container.textContent).not.toContain("Exit 0")
    expect(container.textContent).not.toContain("250ms")
    const chevron = container.querySelector('[data-activity-chevron="true"]')
    const duration = container.querySelector('[data-activity-duration="true"]')
    expect(chevron).not.toBeNull()
    expect(duration).not.toBeNull()
    expect(
      Boolean(
        (chevron as Element).compareDocumentPosition(duration as Element) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true)

    const trigger = container.querySelector("button[aria-controls]")
    expect(trigger).not.toBeNull()

    await click(trigger as HTMLElement)

    const terminal = container.querySelector('[data-terminal="true"]')
    expect(terminal).not.toBeNull()
    expect(container.textContent).toContain("$ pwd")
    expect(container.textContent).toContain("/tmp")
    expect(container.querySelectorAll('[data-terminal="true"]')).toHaveLength(1)
  })

  it("renders stdout and stderr together in the bash terminal transcript", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallTimelineItem
            duration={0.25}
            onToolApprovalResponse={vi.fn()}
            part={createBashPartWithOutput("tool-bash-stdout-stderr", {
              stdout: "stdout line",
              stderr: "stderr line"
            })}
          />
        </I18nextProvider>
      )
    })

    const trigger = container.querySelector("button[aria-controls]")
    expect(trigger).not.toBeNull()

    await click(trigger as HTMLElement)

    expect(container.textContent).toContain("$ pwd")
    expect(container.textContent).toContain("stdout line")
    expect(container.textContent).toContain("stderr:")
    expect(container.textContent).toContain("stderr line")
  })

  it("shows failed text for non-zero bash output without a colored exit badge", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallTimelineItem
            duration={0.25}
            onToolApprovalResponse={vi.fn()}
            part={createBashPartWithOutput("tool-bash-nonzero", {
              stdout: "",
              stderr: "missing",
              exitCode: 1
            })}
          />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("Failed")
    expect(container.textContent).not.toContain("Exit 1")

    const trigger = container.querySelector("button[aria-controls]")
    expect(trigger).not.toBeNull()

    await click(trigger as HTMLElement)

    expect(container.textContent).toContain("stderr:")
    expect(container.textContent).toContain("missing")
  })

  it("keeps approval actions while showing bash input with terminal styling", async () => {
    const onToolApprovalResponse = vi.fn()

    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallTimelineItem
            duration={0.25}
            onToolApprovalResponse={onToolApprovalResponse}
            part={createBashApprovalPart("tool-bash-approval")}
          />
        </I18nextProvider>
      )
    })

    expect(container.querySelector('[data-terminal="true"]')).not.toBeNull()
    expect(container.textContent).toContain("$ ls -la")

    const approveButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("Approve")
    )
    expect(approveButton).not.toBeUndefined()

    await click(approveButton as HTMLButtonElement)

    expect(onToolApprovalResponse).toHaveBeenCalledWith({ id: "approval-1", approved: true })
  })

  it("keeps error semantics while rendering bash input in a terminal", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallTimelineItem
            duration={0.25}
            onToolApprovalResponse={vi.fn()}
            part={createBashErrorPart("tool-bash-error")}
          />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("Failed")

    const trigger = container.querySelector("button[aria-controls]")
    expect(trigger).not.toBeNull()

    await click(trigger as HTMLElement)

    expect(container.querySelector('[data-terminal="true"]')).not.toBeNull()
    expect(container.textContent).toContain("$ cat missing.txt")
    expect(container.textContent).toContain("Command execution failed")
  })

  it("keeps denied semantics while rendering bash input in a terminal", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallTimelineItem
            duration={0.25}
            onToolApprovalResponse={vi.fn()}
            part={createBashDeniedPart("tool-bash-denied")}
          />
        </I18nextProvider>
      )
    })

    const trigger = container.querySelector("button[aria-controls]")
    expect(trigger).not.toBeNull()

    await click(trigger as HTMLElement)

    expect(container.querySelector('[data-terminal="true"]')).not.toBeNull()
    expect(container.textContent).toContain("$ rm -rf /tmp/demo")
    expect(container.textContent).toContain("Execution denied")
  })

  it("renders agent session output in a terminal transcript", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallTimelineItem
            duration={0.25}
            onToolApprovalResponse={vi.fn()}
            part={createAgentSessionPart("tool-agent-session")}
          />
        </I18nextProvider>
      )
    })

    const trigger = container.querySelector("button[aria-controls]")
    expect(trigger).not.toBeNull()

    await click(trigger as HTMLElement)

    expect(container.querySelector('[data-terminal="true"]')).not.toBeNull()
    expect(container.textContent).toContain("codex exec --cd /tmp/project")
    expect(container.textContent).toContain("session-1")
    expect(container.textContent).toContain("Codex is working")
  })

  it("shows compact metadata and expands generic workspace tool details", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <ToolCallTimelineItem
            duration={0.25}
            onToolApprovalResponse={vi.fn()}
            part={createAppendWorkspaceSectionPart("tool-append-workspace-section")}
          />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("USER.md: Identity")
    expect(container.textContent).not.toContain("bytesWritten")

    const trigger = container.querySelector("button[aria-controls]")
    expect(trigger).not.toBeNull()

    await click(trigger as HTMLElement)

    expect(container.textContent).toContain("bytesWritten")
    expect(container.textContent).toContain("createdSection")
  })
})
