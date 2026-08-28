import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "@/lib/i18n"
import { ProviderSection } from "./ProviderSection"

describe("ProviderSection Z.AI connection presets", () => {
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
    document.body.innerHTML = ""
  })

  afterAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previousActEnvironment
  })

  it("shows the selected Coding Plan endpoint and its usage notice", async () => {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ProviderSection
            activeProvider="zhipu"
            setActiveProvider={vi.fn()}
            formData={{
              zhipu: {
                apiKey: "test-key",
                baseUrl: "https://api.z.ai/api/coding/paas/v4",
                connectionPreset: "international-coding-plan"
              }
            }}
            setFormData={vi.fn()}
            onSave={vi.fn()}
            onClear={vi.fn()}
            saveFeedback={{ action: null, status: "idle" }}
            activeError={null}
            isLoading={false}
            enabledProviders={{ zhipu: true }}
            setEnabledProviders={vi.fn()}
            storedProviders={{ zhipu: true }}
            resetSaveFeedback={vi.fn()}
            isSaveDisabled={false}
            isClearDisabled={false}
          />
        </I18nextProvider>
      )
    })

    const baseUrlInput = container.querySelector<HTMLInputElement>("#zhipu-base-url")
    const credentialLink = container.querySelector<HTMLAnchorElement>(
      'a[href="https://docs.z.ai/devpack/quick-start"]'
    )

    expect(container.textContent).toContain("International · Coding Plan")
    expect(container.textContent).toContain(
      "Coding Plan quota is limited to officially supported coding scenarios."
    )
    expect(baseUrlInput?.value).toBe("https://api.z.ai/api/coding/paas/v4")
    expect(baseUrlInput?.disabled).toBe(true)
    expect(credentialLink).not.toBeNull()
  })
})
