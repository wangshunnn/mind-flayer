import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarUpdateIndicator } from "@/components/SidebarUpdateIndicator"
import i18n from "@/lib/i18n"

describe("SidebarUpdateIndicator", () => {
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
    await i18n.changeLanguage("zh-CN")

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.clearAllMocks()

    await act(async () => {
      await i18n.changeLanguage(previousLanguage)
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ""
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  it("retries checking when the updater is in an error state without an available update", async () => {
    const handleCheck = vi.fn()
    const handleInstall = vi.fn()

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarUpdateIndicator
            hasAvailableUpdate={false}
            status="error"
            onCheck={handleCheck}
            onInstall={handleInstall}
            onRestart={vi.fn()}
          />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("重试检查")

    const button = container.querySelector("button")
    expect(button).not.toBeNull()

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(handleCheck).toHaveBeenCalledTimes(1)
    expect(handleInstall).not.toHaveBeenCalled()
  })

  it("retries installing when the updater still has an available update", async () => {
    const handleCheck = vi.fn()
    const handleInstall = vi.fn()

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <SidebarUpdateIndicator
            hasAvailableUpdate
            status="error"
            onCheck={handleCheck}
            onInstall={handleInstall}
            onRestart={vi.fn()}
          />
        </I18nextProvider>
      )
    })

    expect(container.textContent).toContain("重试更新")

    const button = container.querySelector("button")
    expect(button).not.toBeNull()

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(handleInstall).toHaveBeenCalledTimes(1)
    expect(handleCheck).not.toHaveBeenCalled()
  })
})
