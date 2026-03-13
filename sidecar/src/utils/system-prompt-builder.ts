/**
 * System prompt builder for AI agent.
 * Centralizes system context generation for easy extension.
 */

import type { SkillCatalogEntry } from "../skills/catalog"

type SkillPromptEntry = Pick<
  SkillCatalogEntry,
  "id" | "name" | "description" | "location" | "source"
>

export interface BuildSystemPromptOptions {
  modelProvider: string
  modelId: string
  channel?: string
  skills?: SkillPromptEntry[]
}

/**
 * Build role context for the AI agent.
 *
 * @returns Role context string
 */
function buildRoleContext(): string {
  return "You are Mind Flayer, a local desktop AI assistant."
}

/**
 * Build response format rules.
 *
 * @returns Response format rules string
 */
function buildResponseFormatRules(): string {
  return [
    "Response format rules:",
    "- When sharing a local image file (such as a screenshot), always embed it using Markdown image syntax.",
    "- Use an absolute file URI in the image URL: ![screenshot](file:///absolute/path/to/image.png).",
    "- Do not reply with only a plain file path for images."
  ].join("\n")
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;")
}

function buildSkillsPromptSection(options: BuildSystemPromptOptions): string {
  const skills = options.skills ?? []
  if (skills.length === 0) {
    return [
      "## Skills",
      "No skills are currently available.",
      "Do not attempt to discover or read SKILL.md files from the file system."
    ].join("\n")
  }

  const lines = [
    "## Skills",
    "Before replying, scan each skill description in <available_skills>.",
    "- If exactly one skill clearly applies, use the read tool to read its SKILL.md, then follow it.",
    "- If multiple skills might apply, choose the most specific one and read only that skill first.",
    "- If no skill clearly applies, do not read any skill file.",
    "- Constraint: read at most one skill's SKILL.md per assistant turn.",
    "- After selecting a skill, you may continue reading only files inside that same skill directory if the SKILL.md points to them.",
    "<available_skills>",
    ...skills.map(
      skill =>
        `<skill id="${escapeXmlAttribute(skill.id)}" name="${escapeXmlAttribute(skill.name)}" source="${escapeXmlAttribute(skill.source)}" description="${escapeXmlAttribute(skill.description)}" location="${escapeXmlAttribute(skill.location)}" />`
    ),
    "</available_skills>"
  ]

  return lines.join("\n")
}

/**
 * Build system context including environment and time info.
 *
 * @param options - Runtime context options
 * @returns System context string
 */
function buildRuntimeContext(options: BuildSystemPromptOptions): string {
  const { modelProvider, modelId, channel } = options
  const platform = process.platform
  const osName =
    platform === "darwin"
      ? "macOS"
      : platform === "win32"
        ? "Windows"
        : platform === "linux"
          ? "Linux"
          : "Unknown"

  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"

  // Only date, no time component for better KV cache hit rate
  const localDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now)

  // Calculate UTC offset (e.g., UTC+8, UTC-5)
  const offsetMinutes = -now.getTimezoneOffset()
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
  const offsetMins = Math.abs(offsetMinutes) % 60
  const offsetSign = offsetMinutes >= 0 ? "+" : "-"
  const utcOffset = `UTC${offsetSign}${offsetHours}${offsetMins > 0 ? `:${offsetMins.toString().padStart(2, "0")}` : ""}`
  const normalizedChannel = channel?.trim()

  const runtimeContextLines = [
    "Runtime context:",
    `- os: ${osName}`,
    `- platform: ${platform}`,
    `- current_date: ${localDate}`,
    `- time_zone: ${tz} (${utcOffset})`,
    `- model: ${modelProvider}/${modelId}`,
    normalizedChannel ? `- channel: ${normalizedChannel}` : null
  ]

  return runtimeContextLines.filter(Boolean).join("\n")
}

/**
 * Build complete system prompt for the AI agent.
 * Combines all context sections for optimal performance and extensibility.
 *
 * @param options - Runtime context options
 * @returns Complete system prompt
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  return [
    buildRoleContext(),
    buildResponseFormatRules(),
    buildSkillsPromptSection(options) || null,
    buildRuntimeContext(options)
  ]
    .filter(Boolean)
    .join("\n")
}
