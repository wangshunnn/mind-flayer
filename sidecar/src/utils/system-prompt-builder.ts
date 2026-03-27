/**
 * System prompt builder for AI agent.
 * Centralizes system context generation for easy extension.
 */

import type { SkillCatalogEntry } from "../skills/catalog"
import type { WorkspacePromptContext } from "../workspace"

type SkillPromptEntry = Pick<
  SkillCatalogEntry,
  "id" | "name" | "description" | "location" | "source"
>

export interface BuildSystemPromptOptions {
  modelProvider: string
  modelProviderLabel?: string
  modelId: string
  modelLabel?: string
  channel?: string
  skills?: SkillPromptEntry[]
  workspaceContext?: WorkspacePromptContext
}

function buildDefaultResponseFormatRules(): string {
  return [
    "Response format rules:",
    "- When sharing a local image file (such as a screenshot), always embed it using Markdown image syntax.",
    "- Use an absolute file URI in the image URL: ![screenshot](file:///absolute/path/to/image.png).",
    "- Do not reply with only a plain file path for images."
  ].join("\n")
}

function buildTelegramResponseFormatRules(): string {
  return [
    "Response format rules:",
    "- Telegram local attachment rule: if you include any local file:// path, your reply MUST end with exactly one final section titled 'Attachments:'.",
    "- Put the normal reply text first. Then add one blank line, then the line 'Attachments:', then one attachment per line. Do not put any prose after the attachments.",
    "- Never place a local file:// path in the main body. Local file:// paths are allowed only inside the final 'Attachments:' section.",
    "- If you cannot produce a final 'Attachments:' section, do not output any local file:// path.",
    "- In the Telegram 'Attachments:' section, use ![caption](file:///absolute/path/to/image.png) to request an in-chat image preview.",
    "- In the Telegram 'Attachments:' section, use [caption](file:///absolute/path/to/image.png) to request the original file as an attachment.",
    "- If the user wants the original file, an attachment, no compression, or maximum fidelity, use the link form without '!'.",
    "- If the user wants an in-chat preview or asks to see the screenshot directly, use the image form with '!'.",
    "- Example Telegram format:",
    "Main reply text.",
    "",
    "Attachments:",
    "![preview](file:///absolute/path/to/preview.png)",
    "[original](file:///absolute/path/to/original.png)"
  ].join("\n")
}

/**
 * Build response format rules.
 *
 * @returns Response format rules string
 */
function buildResponseFormatRules(channel?: string): string {
  if (channel?.trim() === "telegram") {
    return buildTelegramResponseFormatRules()
  }

  return buildDefaultResponseFormatRules()
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

function buildWorkspacePromptSection(options: BuildSystemPromptOptions): string {
  const workspaceContext = options.workspaceContext
  if (!workspaceContext) {
    return [
      "## Project Context",
      "The global agent workspace is unavailable for this request.",
      "Do not assume BOOTSTRAP.md, MEMORY.md, or daily memory files were loaded."
    ].join("\n")
  }

  const fileSections =
    workspaceContext.files.length > 0
      ? workspaceContext.files.map(file =>
          [
            `<workspace_file relative_path="${escapeXmlAttribute(file.path)}" absolute_path="${escapeXmlAttribute(file.absolutePath)}"${file.truncated ? ' truncated="true"' : ""}>`,
            file.content,
            "</workspace_file>"
          ].join("\n")
        )
      : ["No workspace prompt files were loaded."]

  return [
    "## Project Context",
    `Shared workspace root: ${workspaceContext.workspaceDir}`,
    "- Treat injected workspace files as the source of truth for identity, behavior, and long-term context.",
    "- BOOTSTRAP.md is passive: if it is present below, follow it in this conversation and delete it with deleteWorkspaceFile when onboarding is complete.",
    "- Use appendWorkspaceSection to add facts to USER.md, SOUL.md, IDENTITY.md, or MEMORY.md. It can append to an existing ## section or create a new one.",
    "- Use replaceWorkspaceSection only when you intentionally want to rewrite an existing ## section in USER.md, SOUL.md, IDENTITY.md, or MEMORY.md.",
    "- USER.md should keep stable human metadata easy to scan. Its Identity section is structured around Name, What to call them, Pronouns, Timezone, and Notes.",
    "- MEMORY.md is structured long-term memory. USER.md, SOUL.md, IDENTITY.md, and MEMORY.md use H2 sections only; section boundaries are defined only by ## headings.",
    "- Use appendDailyMemory for memory/YYYY-MM-DD.md. Daily memory files are append-only chronological logs and must never be reorganized or rewritten.",
    "- Use deleteWorkspaceFile only for BOOTSTRAP.md. AGENTS.md is immutable and must never be modified.",
    "- Daily memory files under memory/ are not injected automatically. Use memorySearch and memoryGet when you need recent history, then appendDailyMemory to record new same-day context.",
    `- bootstrap_active: ${workspaceContext.needsBootstrap ? "true" : "false"}`,
    workspaceContext.setupCompletedAt !== null
      ? `- setup_completed_at: ${workspaceContext.setupCompletedAt}`
      : "- setup_completed_at: null",
    "<workspace_context>",
    ...fileSections,
    "</workspace_context>"
  ].join("\n")
}

/**
 * Build system context including environment and time info.
 *
 * @param options - Runtime context options
 * @returns System context string
 */
function buildRuntimeContext(options: BuildSystemPromptOptions): string {
  const { modelProvider, modelProviderLabel, modelId, modelLabel, channel } = options
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
  const displayProvider = modelProviderLabel?.trim() || modelProvider
  const displayModel = modelLabel?.trim() || modelId

  const runtimeContextLines = [
    "Runtime context:",
    `- os: ${osName}`,
    `- platform: ${platform}`,
    `- current_date: ${localDate}`,
    `- time_zone: ${tz} (${utcOffset})`,
    `- model: ${displayProvider}/${displayModel}`,
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
    buildResponseFormatRules(options.channel),
    buildSkillsPromptSection(options) || null,
    buildWorkspacePromptSection(options),
    buildRuntimeContext(options)
  ]
    .filter(Boolean)
    .join("\n")
}
