/**
 * Check if a keyboard event matches a shortcut key string
 * @param event - Keyboard event to check
 * @param shortcutKey - Shortcut key string (e.g., "CommandOrControl+F", "Shift+Alt+W")
 * @returns true if the event matches the shortcut
 */
export function matchesShortcut(event: KeyboardEvent, shortcutKey: string): boolean {
  const parts = shortcutKey.split("+").map(p => p.trim())
  const key = parts[parts.length - 1].toLowerCase()
  const modifiers = parts.slice(0, -1).map(m => m.toLowerCase())

  // Check if the key matches (case-insensitive)
  const eventKey = event.key.toLowerCase()
  if (eventKey !== key && event.code.toLowerCase() !== key.toLowerCase()) {
    return false
  }

  // Check modifiers
  const hasCommandOrControl = modifiers.includes("commandorcontrol")
  const hasCommand = modifiers.includes("command") || modifiers.includes("meta")
  const hasControl = modifiers.includes("control") || modifiers.includes("ctrl")
  const hasShift = modifiers.includes("shift")
  const hasAlt = modifiers.includes("alt")

  // Handle CommandOrControl (Meta on macOS, Ctrl on Windows/Linux)
  if (hasCommandOrControl) {
    if (!(event.metaKey || event.ctrlKey)) return false
  } else {
    if (hasCommand && !event.metaKey) return false
    if (hasControl && !event.ctrlKey) return false
  }

  if (hasShift && !event.shiftKey) return false
  if (hasAlt && !event.altKey) return false

  // Ensure no extra modifiers
  if (!hasCommandOrControl && !hasCommand && event.metaKey) return false
  if (!hasCommandOrControl && !hasControl && event.ctrlKey) return false
  if (!hasShift && event.shiftKey) return false
  if (!hasAlt && event.altKey) return false

  return true
}
