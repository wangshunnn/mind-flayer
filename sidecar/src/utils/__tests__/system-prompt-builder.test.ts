import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "../system-prompt-builder"

describe("buildSystemPrompt", () => {
  const baseOptions = {
    modelProvider: "minimax",
    modelId: "model-a"
  }

  it("includes markdown image instructions for local screenshots", () => {
    const prompt = buildSystemPrompt(baseOptions)

    expect(prompt).toContain("Response format rules:")
    expect(prompt).toContain("always embed it using Markdown image syntax")
    expect(prompt).toContain("![screenshot](file:///absolute/path/to/image.png)")
    expect(prompt).toContain("Do not reply with only a plain file path for images.")
    expect(prompt).toContain("- model: minimax/model-a")
    expect(prompt).not.toContain("- channel:")
  })

  it("includes channel runtime context when channel mode is enabled", () => {
    const prompt = buildSystemPrompt({
      ...baseOptions,
      channel: "telegram"
    })

    expect(prompt).toContain("- model: minimax/model-a")
    expect(prompt).toContain("- channel: telegram")
  })

  it("omits channel runtime context when channel is empty", () => {
    const prompt = buildSystemPrompt({
      ...baseOptions,
      channel: "   "
    })

    expect(prompt).not.toContain("- channel:")
  })

  it("includes skills section when skills are provided", () => {
    const prompt = buildSystemPrompt({
      ...baseOptions,
      skills: [
        {
          name: "file-reader",
          description: 'Reads "complex" files & references.',
          location: "~/Library/Application Support/mind-flayer/skills/reader/SKILL.md"
        }
      ]
    })

    expect(prompt).toContain("## Skills")
    expect(prompt).toContain("<available_skills>")
    expect(prompt).toContain('name="file-reader"')
    expect(prompt).toContain('description="Reads &quot;complex&quot; files &amp; references."')
    expect(prompt).toContain(
      'location="~/Library/Application Support/mind-flayer/skills/reader/SKILL.md"'
    )
    expect(prompt).toContain("read at most one skill's SKILL.md")
  })

  it("omits skills section when no skills are provided", () => {
    const prompt = buildSystemPrompt(baseOptions)

    expect(prompt).not.toContain("## Skills")
    expect(prompt).not.toContain("<available_skills>")
  })
})
