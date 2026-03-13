import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { providerService } from "../../services/provider-service"

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn()
}))

vi.mock("ai", () => ({
  generateText: generateTextMock
}))

import { handleTitleGenerator } from "../title"

describe("handleTitleGenerator", () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.post("/api/title", handleTitleGenerator)

    generateTextMock.mockReset()
    vi.spyOn(providerService, "hasConfig").mockReturnValue(true)
    vi.spyOn(providerService, "createModel").mockReturnValue({} as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("uses a title-only prompt for question messages and sanitizes the response", async () => {
    generateTextMock.mockResolvedValue({
      text: `"Vite 构建报错排查？"
这里是额外解释`
    })

    const res = await app.request("/api/title", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "minimax",
        model: "test-model",
        messageText: "Vite 构建报错怎么办？"
      })
    })

    expect(res.status).toBe(200)

    const payload = (await res.json()) as { title: string }
    expect(payload.title).toBe("Vite 构建报错排查")

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("You are generating a title, not replying to the user."),
        prompt: expect.stringContaining("Do not answer it")
      })
    )
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("<user_message>\nVite 构建报错怎么办？\n</user_message>")
      })
    )
  })

  it("truncates the sanitized title to the configured max length without ellipsis", async () => {
    generateTextMock.mockResolvedValue({
      text: "abcdefghijklmnopqrstuvwxyz?"
    })

    const res = await app.request("/api/title", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "minimax",
        model: "test-model",
        messageText: "Please help me debug a Vite build issue"
      })
    })

    expect(res.status).toBe(200)

    const payload = (await res.json()) as { title: string }
    expect(payload.title).toBe("abcdefghijklmnopqrst")
  })
})
