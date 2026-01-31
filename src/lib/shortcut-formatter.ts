/**
 * Format keyboard shortcut key for display
 * Converts Tauri shortcut format to macOS symbol format
 * @param key - Shortcut key in Tauri format (e.g., "CommandOrControl+F", "Shift+Alt+W")
 * @returns Array of key symbols for display (e.g., ["⌘", "F"], ["⇧", "⌥", "W"])
 */
export function formatShortcutForDisplay(key: string): string[] {
  const parts = key.split("+").map(p => p.trim())
  const symbols: string[] = []

  for (const part of parts) {
    const normalized = part.toLowerCase()

    switch (normalized) {
      case "commandorcontrol":
      case "cmdorctrl":
        // Use Cmd symbol for macOS
        symbols.push("⌘")
        break
      case "command":
      case "meta":
      case "cmd":
        symbols.push("⌘")
        break
      case "control":
      case "ctrl":
        symbols.push("⌃")
        break
      case "shift":
        symbols.push("⇧")
        break
      case "alt":
      case "option":
        symbols.push("⌥")
        break
      case "enter":
      case "return":
        symbols.push("↩")
        break
      case "tab":
        symbols.push("⇥")
        break
      case "backspace":
      case "delete":
        symbols.push("⌫")
        break
      case "escape":
      case "esc":
        symbols.push("⎋")
        break
      case "space":
        symbols.push("␣")
        break
      default:
        // For regular keys (A-Z, F1-F12, etc.), keep uppercase
        symbols.push(part.toUpperCase())
    }
  }

  return symbols
}
