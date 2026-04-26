import type { ReasoningUIPart, TextUIPart, ToolUIPart } from "ai"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  type AssistantActivityPart,
  AssistantActivityTimeline,
  buildAssistantMessageSegments
} from "@/components/ai-elements/assistant-activity"
import i18n from "@/lib/i18n"

const createTextPart = (text: string) =>
  ({
    type: "text",
    text
  }) as TextUIPart

const createReasoningPart = (partIndex: number, text: string) =>
  ({
    type: "reasoning",
    state: "done",
    text,
    partIndex
  }) as ReasoningUIPart & { partIndex: number }

const createStreamingReasoningPart = (partIndex: number, text: string) =>
  ({
    type: "reasoning",
    state: "streaming",
    text,
    partIndex
  }) as ReasoningUIPart & { partIndex: number }

const createBashPart = (partIndex: number) =>
  ({
    type: "tool-bashExecution",
    toolCallId: "tool-bash",
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
    },
    partIndex
  }) as unknown as ToolUIPart & { partIndex: number }

const createStreamingBashPart = (partIndex: number) =>
  ({
    type: "tool-bashExecution",
    toolCallId: "tool-bash-streaming",
    state: "input-streaming",
    input: {
      command: "pwd",
      args: []
    },
    partIndex
  }) as unknown as ToolUIPart & { partIndex: number }

async function wait(ms: number) {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

async function click(element: Element, delayMs = 0) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await wait(delayMs > 0 ? delayMs : 10)
  })
}

describe("buildAssistantMessageSegments", () => {
  it("keeps text and activity in original part order", () => {
    const segments = buildAssistantMessageSegments([
      createTextPart("First text."),
      createReasoningPart(1, "Need first check."),
      createBashPart(2),
      createTextPart("Second text.")
    ])

    expect(segments).toHaveLength(3)
    expect(segments.map(segment => segment.type)).toEqual(["text", "activity", "text"])
    expect(segments[0]).toMatchObject({ type: "text", text: "First text." })
    expect(segments[1]).toMatchObject({ type: "activity", parts: expect.any(Array) })
    if (segments[1].type === "activity") {
      expect(segments[1].parts).toHaveLength(2)
      expect(segments[1].parts.map(part => part.partIndex)).toEqual([1, 2])
    }
    expect(segments[2]).toMatchObject({ type: "text", text: "Second text." })
  })

  it("merges adjacent text parts without crossing activity parts", () => {
    const segments = buildAssistantMessageSegments([
      createTextPart("First "),
      createTextPart("chunk."),
      createReasoningPart(2, "Need first check."),
      createTextPart("Second "),
      createTextPart("chunk.")
    ])

    expect(segments).toHaveLength(3)
    expect(segments[0]).toMatchObject({ type: "text", text: "First chunk." })
    expect(segments[1]).toMatchObject({ type: "activity" })
    expect(segments[2]).toMatchObject({ type: "text", text: "Second chunk." })
  })
})

describe("AssistantActivityTimeline", () => {
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
  })

  it("keeps reasoning and tool parts in original order and expands reasoning details", async () => {
    const parts: AssistantActivityPart[] = [
      createReasoningPart(1, "Need first check.\n```ts\nconst answer = 42\n```\nDone."),
      createBashPart(2),
      createReasoningPart(3, "Then inspect the command output.")
    ]

    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantActivityTimeline onToolApprovalResponse={vi.fn()} parts={parts} />
        </I18nextProvider>
      )
    })

    const text = container.textContent ?? ""
    expect(text.indexOf("Need first check.")).toBeLessThan(text.indexOf("pwd"))
    expect(text.indexOf("pwd")).toBeLessThan(text.indexOf("Then inspect"))
    expect(container.querySelector('[data-streamdown="thinking-plain-text-block"]')).toBeNull()
    expect(container.querySelector('[data-terminal="true"]')).toBeNull()

    const reasoningTrigger = container.querySelector("button[aria-controls]")
    expect(reasoningTrigger).not.toBeNull()

    await click(reasoningTrigger as HTMLElement)

    const plainTextBlock = container.querySelector('[data-streamdown="thinking-plain-text-block"]')
    expect(plainTextBlock).not.toBeNull()
    expect(plainTextBlock?.textContent).toContain("const answer = 42")
  })

  it("uses row-scoped hover classes for chevrons", async () => {
    const parts: AssistantActivityPart[] = [
      createReasoningPart(1, "Need first check."),
      createBashPart(2)
    ]

    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantActivityTimeline onToolApprovalResponse={vi.fn()} parts={parts} />
        </I18nextProvider>
      )
    })

    const chevrons = container.querySelectorAll('[data-activity-chevron="true"]')

    expect(chevrons).toHaveLength(2)
    for (const chevron of chevrons) {
      const className = chevron.getAttribute("class") ?? ""
      expect(className).toContain("group-hover/activity-row:opacity-60")
      expect(className).not.toContain("group-hover:opacity-60")
    }
  })

  it("keeps streaming activity collapsed by default", async () => {
    const parts: AssistantActivityPart[] = [
      createStreamingReasoningPart(1, "Streaming reasoning.\n```ts\nconst answer = 42\n```"),
      createStreamingBashPart(2)
    ]

    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantActivityTimeline onToolApprovalResponse={vi.fn()} parts={parts} />
        </I18nextProvider>
      )
    })

    const triggers = Array.from(container.querySelectorAll("button[aria-controls]"))

    expect(triggers).toHaveLength(2)
    expect(triggers.map(trigger => trigger.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false"
    ])
    expect(container.querySelector('[data-streamdown="thinking-plain-text-block"]')).toBeNull()

    await click(triggers[0])

    expect(container.querySelector('[data-streamdown="thinking-plain-text-block"]')).not.toBeNull()
  })

  it("renders per-reasoning durations on the row trailing side", async () => {
    const parts: AssistantActivityPart[] = [
      createReasoningPart(1, "First reasoning."),
      createReasoningPart(2, "Second reasoning.")
    ]

    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantActivityTimeline
            fallbackThinkingDurationPartIndex={1}
            onToolApprovalResponse={vi.fn()}
            parts={parts}
            reasoningDurations={{ "2": 2.4 }}
            thinkingDuration={9.9}
          />
        </I18nextProvider>
      )
    })

    const durationLabels = Array.from(
      container.querySelectorAll('[data-activity-duration="true"]')
    ).map(element => element.textContent)

    expect(durationLabels).toEqual(["9.90 s", "2.40 s"])
    expect(container.textContent).not.toContain("Thought for")
  })
})
