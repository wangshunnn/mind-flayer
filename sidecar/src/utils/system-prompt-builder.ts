/**
 * System prompt builder for AI agent.
 * Centralizes system context generation for easy extension.
 */

/**
 * Build time-related system context.
 * Uses date-only format (no time) for better KV cache hit rate.
 *
 * @returns Time context string
 */
function buildTimeContext(): string {
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

  return [`- current_date: ${localDate}`, `- time_zone: ${tz} (${utcOffset})`].join("\n")
}

/**
 * Build system environment context.
 * Can be extended with more environment info (OS, version, etc.)
 *
 * @returns Environment context string
 */
function buildEnvironmentContext(): string {
  // TODO: Add more environment info as needed
  // - OS type (macOS, Windows, Linux)
  // - App version
  // - User language preference
  return ""
}

/**
 * Build complete system prompt for the AI agent.
 * Combines all context sections for optimal performance and extensibility.
 *
 * @returns Complete system prompt
 */
export function buildSystemPrompt(): string {
  const sections = [
    "You are Mind Flayer, a local desktop AI agent.",
    "System context:",
    buildTimeContext(),
    buildEnvironmentContext()
  ].filter(Boolean)

  return sections.join("\n")
}
