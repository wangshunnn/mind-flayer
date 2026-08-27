import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const { openImagePreviewWindow } = vi.hoisted(() => ({
  openImagePreviewWindow: vi.fn()
}))

vi.mock("@/lib/window-manager", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/window-manager")>("@/lib/window-manager")
  return {
    ...actual,
    openImagePreviewWindow
  }
})

import { MessageContent, MessageResponse } from "@/components/ai-elements/message"

const STREAMING_MARKDOWN_BOUNDARY_CASES = [
  {
    name: "lazy-list-continuation",
    chunks: ["- item ", "\n", "---", "text"]
  },
  {
    name: "fence-followed-by-list",
    chunks: ["ordinary text", "\n", "```", "code", "```", "\n", "- item"]
  },
  {
    name: "multiline-fence-followed-by-list",
    chunks: ["ordinary text", "\n", "```", "\n", "code", "\n", "```", "\n", "- item"]
  },
  {
    name: "setext-heading",
    chunks: ["heading", "\n", "---", "\n", "tail"]
  },
  {
    name: "gfm-table",
    chunks: ["| a | b |", "\n", "| - | - |", "\n", "| 1 | 2 |"]
  },
  {
    name: "blockquote-lazy-continuation",
    chunks: ["> quote", "\n", "continuation", "\n\n", "tail"]
  },
  {
    name: "ordered-list-continuation",
    chunks: ["1. first", "\n", "   continuation", "\n", "2. second"]
  },
  {
    name: "html-block",
    chunks: ["<div>", "\n", "content", "\n", "</div>", "\n\n", "tail"]
  },
  {
    name: "reference-definition",
    chunks: ["See [link][id].", "\n\n", "More text.", "\n\n", "[id]: https://example.com"]
  },
  {
    name: "inline-code-followed-by-list",
    chunks: ["paragraph with `", "inline", "` text", "\n", "- item"]
  }
] as const

describe("MessageResponse local image rendering", () => {
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
    openImagePreviewWindow.mockReset()
    container.remove()
  })

  it("renders local image with sidecar proxy URL", async () => {
    const localPath = "/Users/USERNAME/Desktop/a.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${localPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    const source = image?.getAttribute("src")
    expect(source).toBeTruthy()

    const parsedUrl = new URL(source as string)
    expect(parsedUrl.origin).toBe("http://localhost:21420")
    expect(parsedUrl.pathname).toBe("/api/local-image")
    expect(parsedUrl.searchParams.get("path")).toBe(localPath)
    expect(parsedUrl.searchParams.get("_ts")).toBeTruthy()
  })

  it("keeps completed markdown block DOM mounted while streaming grows", async () => {
    const first = "first paragraph\n\nsecond paragraph\n\nthird paragraph\n\nfourth paragraph"

    await act(async () => {
      root.render(<MessageResponse streaming>{first}</MessageResponse>)
    })

    const firstParagraph = container.querySelector("p")
    expect(firstParagraph?.textContent).toBe("first paragraph")

    await act(async () => {
      root.render(
        <MessageResponse
          streaming
        >{`${first}\n\nfifth paragraph\n\nsixth paragraph`}</MessageResponse>
      )
    })

    expect(container.querySelector("p")).toBe(firstParagraph)
    expect(container.textContent).toContain("sixth paragraph")
  })

  it("matches a fresh streaming render when a list receives a lazy continuation", async () => {
    const freshContainer = document.createElement("div")
    document.body.appendChild(freshContainer)
    const freshRoot = createRoot(freshContainer)
    let markdown = ""

    for (const chunk of ["- item ", "\n", "---", "text"]) {
      markdown += chunk
      await act(async () => {
        root.render(<MessageResponse streaming>{markdown}</MessageResponse>)
      })
    }
    await act(async () => {
      freshRoot.render(<MessageResponse streaming>{markdown}</MessageResponse>)
    })

    expect(container.querySelector("li")?.textContent).toBe(
      freshContainer.querySelector("li")?.textContent
    )
    expect(container.querySelectorAll(":scope > div > p")).toHaveLength(
      freshContainer.querySelectorAll(":scope > div > p").length
    )

    await act(async () => {
      freshRoot.unmount()
    })
    freshContainer.remove()
  })

  it("keeps cumulative streaming DOM equal to fresh parsing across Markdown boundaries", async () => {
    const freshContainer = document.createElement("div")
    document.body.appendChild(freshContainer)
    const freshRoot = createRoot(freshContainer)

    for (const testCase of STREAMING_MARKDOWN_BOUNDARY_CASES) {
      let markdown = ""
      for (let index = 0; index < testCase.chunks.length; index += 1) {
        markdown += testCase.chunks[index]
        await act(async () => {
          root.render(
            <MessageResponse key={`streamed-${testCase.name}`} streaming>
              {markdown}
            </MessageResponse>
          )
          freshRoot.render(
            <MessageResponse key={`fresh-${testCase.name}-${index}`} streaming>
              {markdown}
            </MessageResponse>
          )
        })

        expect(
          container.innerHTML,
          `${testCase.name} diverged from a fresh render after chunk ${index + 1}`
        ).toBe(freshContainer.innerHTML)
      }
    }

    await act(async () => {
      freshRoot.unmount()
    })
    freshContainer.remove()
  })

  it("updates supported Streamdown props when children stay unchanged", async () => {
    await act(async () => {
      root.render(<MessageResponse className="before">same content</MessageResponse>)
    })
    expect(container.firstElementChild?.classList.contains("before")).toBe(true)

    await act(async () => {
      root.render(<MessageResponse className="after">same content</MessageResponse>)
    })
    expect(container.firstElementChild?.classList.contains("before")).toBe(false)
    expect(container.firstElementChild?.classList.contains("after")).toBe(true)
  })

  it("keeps the local image cache key stable across streaming updates", async () => {
    const localPath = "/Users/USERNAME/Desktop/stable.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420" streaming>
          {`![local](${localPath})`}
        </MessageResponse>
      )
    })

    const firstImage = container.querySelector("img")
    const firstSource = firstImage?.getAttribute("src")

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420" streaming>
          {`![local](${localPath})\n\nstreamed tail`}
        </MessageResponse>
      )
    })

    const nextImage = container.querySelector("img")
    expect(nextImage).toBe(firstImage)
    expect(nextImage?.getAttribute("src")).toBe(firstSource)
  })

  it("does not clip assistant message content overflow", async () => {
    await act(async () => {
      root.render(<MessageContent>assistant message</MessageContent>)
    })

    const content = container.firstElementChild as HTMLDivElement | null
    const classTokens = content?.className.split(/\s+/) ?? []

    expect(content).not.toBeNull()
    expect(classTokens).not.toContain("overflow-hidden")
    expect(classTokens).toContain("group-[.is-user]:overflow-hidden")
  })

  it("renders file URL image with sidecar proxy URL", async () => {
    const fileUrlPath = "file:///Users/USERNAME/Desktop/a.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${fileUrlPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    const source = image?.getAttribute("src")
    expect(source).toBeTruthy()

    const parsedUrl = new URL(source as string)
    expect(parsedUrl.origin).toBe("http://localhost:21420")
    expect(parsedUrl.pathname).toBe("/api/local-image")
    expect(parsedUrl.searchParams.get("path")).toBe(fileUrlPath)
    expect(parsedUrl.searchParams.get("_ts")).toBeTruthy()
  })

  it("renders file URL image with whitespace in the local path", async () => {
    const fileUrlPath =
      "file:///Users/USERNAME/Library/Application Support/Mind Flayer/sandboxes/shot one.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${fileUrlPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()

    const source = image?.getAttribute("src")
    expect(source).toBeTruthy()

    const parsedUrl = new URL(source as string)
    expect(parsedUrl.origin).toBe("http://localhost:21420")
    expect(parsedUrl.pathname).toBe("/api/local-image")

    const proxiedFileUrl = parsedUrl.searchParams.get("path")
    expect(proxiedFileUrl).toBeTruthy()
    expect(decodeURIComponent(new URL(proxiedFileUrl as string).pathname)).toBe(
      "/Users/USERNAME/Library/Application Support/Mind Flayer/sandboxes/shot one.png"
    )
    expect(parsedUrl.searchParams.get("_ts")).toBeTruthy()
  })

  it("falls back to text link when image loading fails", async () => {
    const localPath = "/Users/USERNAME/Desktop/missing.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![local](${localPath})`}
        </MessageResponse>
      )
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    const imageSource = image?.getAttribute("src")
    expect(imageSource).toBeTruthy()

    await act(async () => {
      image?.dispatchEvent(new Event("error"))
    })

    expect(container.querySelector("img")).toBeNull()

    const fallbackLink = container.querySelector("a")
    expect(fallbackLink).not.toBeNull()
    expect(fallbackLink?.textContent).toBe(localPath)
    expect(fallbackLink?.getAttribute("href")).toBe(imageSource)
  })

  it("opens the image preview window when a previewable image is clicked", async () => {
    const remoteUrl = "https://example.com/assets/photo.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![remote](${remoteUrl})`}
        </MessageResponse>
      )
    })

    const previewButton = container.querySelector("button")
    expect(previewButton).not.toBeNull()

    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(openImagePreviewWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "remote",
        originalUrl: remoteUrl
      })
    )
  })

  it("applies chat-friendly image size caps for previewable images", async () => {
    const remoteUrl = "https://example.com/assets/photo.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![remote](${remoteUrl})`}
        </MessageResponse>
      )
    })

    const previewButton = container.querySelector("button")
    const image = container.querySelector("img")

    expect(previewButton?.className).toContain("sm:max-w-[32rem]")
    expect(image?.className).toContain("max-h-[28rem]")
    expect(image?.className).toContain("rounded-xl")
  })

  it("prevents the native context menu on previewable images", async () => {
    const remoteUrl = "https://example.com/assets/photo.png"

    await act(async () => {
      root.render(
        <MessageResponse localImageProxyOrigin="http://localhost:21420">
          {`![remote](${remoteUrl})`}
        </MessageResponse>
      )
    })

    const previewButton = container.querySelector("button")
    expect(previewButton).not.toBeNull()

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    })
    previewButton?.dispatchEvent(contextMenuEvent)

    expect(contextMenuEvent.defaultPrevented).toBe(true)
  })
})
