import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  AssistantMessageActionsBar,
  UserMessageActionsBar
} from "@/components/ai-elements/message-actions-bar"
import i18n from "@/lib/i18n"

describe("message action timestamps", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(async () => {
    await i18n.changeLanguage("en")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  it("places the local send time before user actions with zero-padded hours and minutes", async () => {
    const sentAt = new Date(2026, 7, 26, 8, 5, 42)
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <UserMessageActionsBar messageText="Hello" createdAt={sentAt.getTime()} />
        </I18nextProvider>
      )
    })

    const time = container.querySelector("time")
    expect(time?.textContent).toBe("08:05")
    expect(time?.dateTime).toBe(sentAt.toISOString())
    expect(container.firstElementChild?.firstElementChild).toBe(time)
  })

  it("places the reply completion time after all assistant actions, including token details", async () => {
    const startedAt = new Date(2026, 7, 26, 20, 32)
    const finishedAt = new Date(2026, 7, 26, 20, 33)
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantMessageActionsBar
            messageText="Hello back"
            createdAt={startedAt.getTime()}
            lastTokenAt={finishedAt.getTime()}
            tokenInfo={{
              inputTokens: 100,
              outputTokens: 60,
              totalTokens: 160,
              inputTokenDetails: {
                noCacheTokens: undefined,
                cacheReadTokens: undefined,
                cacheWriteTokens: undefined
              },
              outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined }
            }}
          />
        </I18nextProvider>
      )
    })

    const time = container.querySelector("time")
    expect(time?.textContent).toBe("20:33")
    expect(time?.dateTime).toBe(finishedAt.toISOString())
    expect(container.firstElementChild?.lastElementChild).toBe(time)
    expect(container.querySelectorAll("button")).toHaveLength(3)
  })

  it("does not substitute the reply start time when the completion time is unknown", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <AssistantMessageActionsBar messageText="Legacy reply" createdAt={1_000} />
        </I18nextProvider>
      )
    })

    expect(container.querySelector("time")).toBeNull()
  })

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1e20
  ])("omits missing or invalid timestamps (%s) without hiding actions", async timestamp => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <UserMessageActionsBar messageText="Hello" createdAt={timestamp} />
          <AssistantMessageActionsBar messageText="Hello back" lastTokenAt={timestamp} />
        </I18nextProvider>
      )
    })

    expect(container.querySelector("time")).toBeNull()
    expect(container.querySelectorAll("button")).toHaveLength(4)
  })

  it("formats local midnight as 00:00", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <UserMessageActionsBar
            messageText="Midnight"
            createdAt={new Date(2026, 7, 26, 0, 0).getTime()}
          />
        </I18nextProvider>
      )
    })

    expect(container.querySelector("time")?.textContent).toBe("00:00")
  })
})
