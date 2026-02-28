import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "../system-prompt-builder"

describe("buildSystemPrompt", () => {
  it("includes markdown image instructions for local screenshots", () => {
    const prompt = buildSystemPrompt()

    expect(prompt).toContain("Response format rules:")
    expect(prompt).toContain("always embed it using Markdown image syntax")
    expect(prompt).toContain("![screenshot](file:///absolute/path/to/image.png)")
    expect(prompt).toContain("Do not reply with only a plain file path for images.")
  })
})
