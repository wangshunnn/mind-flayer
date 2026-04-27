import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ReasoningPartContent } from "@/components/ai-elements/reasoning-content"

describe("ReasoningPartContent", () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined

  beforeAll(() => {
    previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
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
      root.unmount()
    })
    container.remove()
  })

  it("renders fenced code blocks as plain text in reasoning content", async () => {
    await act(async () => {
      root.render(
        <ReasoningPartContent>
          {"Before\n```ts\nconst answer = 42\nconsole.log(answer)\n```\nAfter"}
        </ReasoningPartContent>
      )
    })

    const plainTextBlock = container.querySelector('[data-streamdown="thinking-plain-text-block"]')

    expect(plainTextBlock).not.toBeNull()
    expect(container.querySelector('[data-streamdown="code-block"]')).toBeNull()
    expect(plainTextBlock?.textContent).toContain("const answer = 42")
    expect(plainTextBlock?.textContent).toContain("console.log(answer)")
    expect(container.textContent).toContain("Before")
    expect(container.textContent).toContain("After")
  })
})
