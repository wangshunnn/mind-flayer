import { BrainIcon } from "lucide-react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ToolButton } from "@/components/tool-button"

vi.mock("@/hooks/use-autofocus-selected-dropdown-item", () => ({
  useAutofocusSelectedDropdownItem: () => ({ scopeId: "reasoning-test" })
}))

vi.mock("@/hooks/use-dropdown-tooltip", () => ({
  useDropdownTooltip: () => [false]
}))

describe("ToolButton locked enabled state", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined
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
    ;(globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent = previousPointerEvent
  })

  it("keeps the switch checked and disabled while allowing effort selection", async () => {
    const onEnabledChange = vi.fn()
    const onModeChange = vi.fn()

    await act(async () => {
      root.render(
        <ToolButton
          icon={BrainIcon}
          label="Reasoning"
          tooltip="Reasoning"
          enabled
          enabledLocked
          enabledLockedDescription="Always on for this model"
          onEnabledChange={onEnabledChange}
          modes={[
            { value: "default", label: "Default (Max)" },
            { value: "low", label: "Low" },
            { value: "high", label: "High" },
            { value: "xhigh", label: "Max" }
          ]}
          selectedMode="default"
          onModeChange={onModeChange}
        />
      )
    })

    const trigger = container.querySelector<HTMLElement>("button")
    await act(async () => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
      await Promise.resolve()
    })

    const switchElement = document.body.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(switchElement?.disabled).toBe(true)
    expect(switchElement?.getAttribute("data-state")).toBe("checked")
    expect(document.body.textContent).toContain("Always on for this model")
    expect(document.body.textContent).toContain("Default (Max)")
    expect(document.body.textContent).toContain("Max")
    expect(document.body.textContent).not.toContain("Medium")

    await act(async () => switchElement?.click())
    expect(onEnabledChange).not.toHaveBeenCalled()
  })
})
