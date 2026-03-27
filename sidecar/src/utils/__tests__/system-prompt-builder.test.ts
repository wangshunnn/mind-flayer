import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "../system-prompt-builder"

describe("buildSystemPrompt", () => {
  const baseOptions = {
    modelProvider: "minimax",
    modelId: "model-a",
    workspaceContext: {
      workspaceDir: "/Users/USERNAME/Library/Application Support/Mind Flayer/workspace",
      needsBootstrap: true,
      setupCompletedAt: null,
      files: [
        {
          path: "AGENTS.md",
          absolutePath:
            "/Users/USERNAME/Library/Application Support/Mind Flayer/workspace/AGENTS.md",
          content: "Follow BOOTSTRAP.md when it exists.",
          truncated: false
        },
        {
          path: "BOOTSTRAP.md",
          absolutePath:
            "/Users/USERNAME/Library/Application Support/Mind Flayer/workspace/BOOTSTRAP.md",
          content: "Ask who you are and delete this file when complete.",
          truncated: false
        }
      ]
    }
  }

  it("includes markdown image instructions for local screenshots", () => {
    const prompt = buildSystemPrompt(baseOptions)

    expect(prompt).toContain("Response format rules:")
    expect(prompt).toContain("always embed it using Markdown image syntax")
    expect(prompt).toContain("![screenshot](file:///absolute/path/to/image.png)")
    expect(prompt).toContain("Do not reply with only a plain file path for images.")
    expect(prompt).not.toContain("final section titled 'Attachments:'")
    expect(prompt).toContain("## Project Context")
    expect(prompt).toContain("Shared workspace root:")
    expect(prompt).toContain(
      "Shared workspace root: /Users/USERNAME/Library/Application Support/Mind Flayer/workspace"
    )
    expect(prompt).toContain("<workspace_context>")
    expect(prompt).toContain('relative_path="AGENTS.md"')
    expect(prompt).toContain('relative_path="BOOTSTRAP.md"')
    expect(prompt).toContain(
      'absolute_path="/Users/USERNAME/Library/Application Support/Mind Flayer/workspace/AGENTS.md"'
    )
    expect(prompt).toContain(
      'absolute_path="/Users/USERNAME/Library/Application Support/Mind Flayer/workspace/BOOTSTRAP.md"'
    )
    expect(prompt).toContain("bootstrap_active: true")
    expect(prompt).toContain("Use appendWorkspaceSection to add facts to USER.md")
    expect(prompt).toContain("Use replaceWorkspaceSection only when you intentionally want")
    expect(prompt).toContain("MEMORY.md is structured long-term memory")
    expect(prompt).toContain("appendDailyMemory")
    expect(prompt).toContain("Use deleteWorkspaceFile only for BOOTSTRAP.md")
    expect(prompt).toContain("AGENTS.md is immutable")
    expect(prompt).toContain("- model: minimax/model-a")
    expect(prompt).not.toContain("- channel:")
  })

  it("includes channel runtime context when channel mode is enabled", () => {
    const prompt = buildSystemPrompt({
      ...baseOptions,
      channel: "telegram"
    })

    expect(prompt).not.toContain("always embed it using Markdown image syntax")
    expect(prompt).not.toContain("Do not reply with only a plain file path for images.")
    expect(prompt).toContain("MUST end with exactly one final section titled 'Attachments:'")
    expect(prompt).toContain("Then add one blank line, then the line 'Attachments:'")
    expect(prompt).toContain("Never place a local file:// path in the main body")
    expect(prompt).toContain("If you cannot produce a final 'Attachments:' section")
    expect(prompt).toContain("use ![caption](file:///absolute/path/to/image.png)")
    expect(prompt).toContain("use [caption](file:///absolute/path/to/image.png)")
    expect(prompt).toContain("Example Telegram format:")
    expect(prompt).toContain("![preview](file:///absolute/path/to/preview.png)")
    expect(prompt).toContain("[original](file:///absolute/path/to/original.png)")
    expect(prompt).toContain("- model: minimax/model-a")
    expect(prompt).toContain("- channel: telegram")
  })

  it("uses the model label in runtime context when provided", () => {
    const prompt = buildSystemPrompt({
      ...baseOptions,
      modelLabel: "MiniMax-M2.5"
    })

    expect(prompt).toContain("- model: minimax/MiniMax-M2.5")
  })

  it("uses the provider label in runtime context when provided", () => {
    const prompt = buildSystemPrompt({
      ...baseOptions,
      modelProviderLabel: "MiniMax",
      modelLabel: "MiniMax-M2.5"
    })

    expect(prompt).toContain("- model: MiniMax/MiniMax-M2.5")
  })

  it("shows an unavailable notice when no workspace context is provided", () => {
    const prompt = buildSystemPrompt({
      modelProvider: "minimax",
      modelId: "model-a"
    })

    expect(prompt).toContain("The global agent workspace is unavailable")
    expect(prompt).toContain(
      "Do not assume BOOTSTRAP.md, MEMORY.md, or daily memory files were loaded."
    )
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
          id: "bundled:file-reader",
          name: "file-reader",
          source: "bundled",
          description: 'Reads "complex" files & references.',
          location: "~/Library/Application Support/Mind Flayer/skills/builtin/reader/SKILL.md"
        }
      ]
    })

    expect(prompt).toContain("## Skills")
    expect(prompt).toContain("<available_skills>")
    expect(prompt).toContain('id="bundled:file-reader"')
    expect(prompt).toContain('name="file-reader"')
    expect(prompt).toContain('source="bundled"')
    expect(prompt).toContain('description="Reads &quot;complex&quot; files &amp; references."')
    expect(prompt).toContain(
      'location="~/Library/Application Support/Mind Flayer/skills/builtin/reader/SKILL.md"'
    )
    expect(prompt).toContain("read at most one skill's SKILL.md")
  })

  it("includes skills-disabled notice when no skills are provided", () => {
    const prompt = buildSystemPrompt(baseOptions)

    expect(prompt).toContain("## Skills")
    expect(prompt).toContain("No skills are currently available")
    expect(prompt).toContain("Do not attempt to discover or read SKILL.md files")
    expect(prompt).not.toContain("<available_skills>")
  })

  it("includes skills-disabled notice when skills array is empty", () => {
    const prompt = buildSystemPrompt({ ...baseOptions, skills: [] })

    expect(prompt).toContain("No skills are currently available")
    expect(prompt).toContain("Do not attempt to discover or read SKILL.md files")
    expect(prompt).not.toContain("<available_skills>")
  })
})
