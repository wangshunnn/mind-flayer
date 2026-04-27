import type { ReasoningUIPart, TextUIPart, ToolUIPart, UIMessage } from "ai"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  type AssistantActivityPart,
  AssistantActivityTimeline,
  type AssistantFallbackPart,
  AssistantFallbackParts,
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

const createSourceUrlPart = (type = "source-url-test") =>
  ({
    type,
    sourceId: "source-1",
    title: "Provider docs",
    url: "https://example.com/provider-docs"
  }) as unknown as UIMessage["parts"][number]

const createStepStartPart = () =>
  ({
    type: "step-start"
  }) as unknown as UIMessage["parts"][number]

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

  it("preserves unsupported parts as fallback segments and warns once", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const unsupportedPart = createSourceUrlPart()

    try {
      const segments = buildAssistantMessageSegments([
        createTextPart("Intro."),
        unsupportedPart,
        createReasoningPart(2, "Need first check.")
      ])

      expect(segments.map(segment => segment.type)).toEqual(["text", "fallback", "activity"])
      expect(segments[1]).toMatchObject({ type: "fallback", parts: expect.any(Array) })
      if (segments[1].type === "fallback") {
        expect(segments[1].parts).toHaveLength(1)
        expect(segments[1].parts[0]).toMatchObject({
          partIndex: 1,
          type: "source-url-test"
        })
      }
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported assistant message part type "source-url-test"'),
        unsupportedPart
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("ignores non-renderable step markers without warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    try {
      const segments = buildAssistantMessageSegments([
        createTextPart("First "),
        createStepStartPart(),
        createTextPart("chunk.")
      ])

      expect(segments).toHaveLength(1)
      expect(segments[0]).toMatchObject({ type: "text", text: "First chunk." })
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
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

  it("auto-opens streaming reasoning and active tool calls", async () => {
    const streamingParts: AssistantActivityPart[] = [
      createStreamingReasoningPart(1, "Streaming reasoning.\n```ts\nconst answer = 42\n```"),
      createStreamingBashPart(2)
    ]
    const doneParts: AssistantActivityPart[] = [
      createReasoningPart(1, "Streaming reasoning.\n```ts\nconst answer = 42\n```"),
      createStreamingBashPart(2)
    ]

    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantActivityTimeline onToolApprovalResponse={vi.fn()} parts={streamingParts} />
        </I18nextProvider>
      )
    })

    const triggers = Array.from(container.querySelectorAll("button[aria-controls]"))

    expect(triggers).toHaveLength(2)
    expect(triggers.map(trigger => trigger.getAttribute("aria-expanded"))).toEqual(["true", "true"])
    expect(container.querySelector('[data-streamdown="thinking-plain-text-block"]')).not.toBeNull()

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantActivityTimeline onToolApprovalResponse={vi.fn()} parts={doneParts} />
        </I18nextProvider>
      )
    })

    const rerenderedTriggers = Array.from(container.querySelectorAll("button[aria-controls]"))
    expect(rerenderedTriggers[0].getAttribute("aria-expanded")).toBe("false")
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

    const firstChevron = container.querySelector('[data-activity-chevron="true"]')
    const firstDuration = container.querySelector('[data-activity-duration="true"]')
    expect(firstChevron).not.toBeNull()
    expect(firstDuration).not.toBeNull()
    expect(
      Boolean(
        (firstChevron as Element).compareDocumentPosition(firstDuration as Element) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true)
  })

  it("does not apply thinking duration without a message-level fallback index", async () => {
    const parts: AssistantActivityPart[] = [createReasoningPart(3, "Segment-local reasoning.")]

    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantActivityTimeline
            onToolApprovalResponse={vi.fn()}
            parts={parts}
            thinkingDuration={9.9}
          />
        </I18nextProvider>
      )
    })

    expect(container.querySelector('[data-activity-duration="true"]')).toBeNull()
  })

  it("renders fallback parts with their available content", async () => {
    const parts = [
      {
        ...createSourceUrlPart("source-url-render-test"),
        partIndex: 4
      } as AssistantFallbackPart
    ]

    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantFallbackParts parts={parts} />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("Message part: source-url-render-test")
    expect(container.textContent).toContain("Provider docs")
    expect(container.textContent).toContain("https://example.com/provider-docs")
  })
})
