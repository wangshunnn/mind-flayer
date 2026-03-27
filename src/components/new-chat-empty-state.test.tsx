import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { NewChatEmptyState } from "@/components/new-chat-empty-state"
import i18n from "@/lib/i18n"

describe("NewChatEmptyState", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
  let previousLanguage: string

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(async () => {
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

  it("renders localized Chinese highlights and logo alt text", async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
      root.render(
        <I18nextProvider i18n={i18n}>
          <NewChatEmptyState />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("多模型 · 记忆 · 工具 · 技能 · 渠道集成")
    expect(container.textContent).not.toContain("Mind Flayer")
    expect(container.textContent).not.toContain(
      "跨平台桌面 AI 助手，支持多模型、Skills、工具调用与渠道集成。"
    )

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    expect(image?.getAttribute("alt")).toBe("Mind Flayer 标志")
    expect(image?.getAttribute("src")).toBeTruthy()
  })

  it("renders localized English highlights", async () => {
    await act(async () => {
      await i18n.changeLanguage("en")
      root.render(
        <I18nextProvider i18n={i18n}>
          <NewChatEmptyState />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("Models · Memory · Tools · Skills · Channels")
    expect(container.textContent).not.toContain("Mind Flayer")
    expect(container.textContent).not.toContain(
      "Cross-platform desktop AI assistant with multi-model support, Skills, tool use, and channel integrations."
    )

    const image = container.querySelector("img")
    expect(image?.getAttribute("alt")).toBe("Mind Flayer logo")
  })
})
