/**
 * Command validator for bash execution tool
 * Uses a blocklist + dangerous-commands approach:
 * - BLOCKED_COMMANDS: always denied (system-level destructive)
 * - DANGEROUS_COMMANDS: require user approval on desktop (potentially destructive to user data)
 * - Everything else: auto-allowed without approval
 */

/**
 * Commands that are always denied regardless of user approval
 * These are system-level destructive operations
 */
export const BLOCKED_COMMANDS = [
  "chroot",
  "diskutil",
  "doas",
  "fdisk",
  "halt",
  "init",
  "insmod",
  "kextload",
  "kextunload",
  "launchctl",
  "mkfs",
  "modprobe",
  "mount",
  "parted",
  "passwd",
  "poweroff",
  "reboot",
  "rmmod",
  "service",
  "shutdown",
  "su",
  "sudo",
  "systemctl",
  "telinit",
  "umount",
  "visudo"
] as const

/**
 * Commands that require user approval on desktop before execution
 * These can be destructive to user data or system state
 */
export const DANGEROUS_COMMANDS = [
  "rm",
  "rmdir",
  "kill",
  "killall",
  "pkill",
  "dd",
  "chmod",
  "chown",
  "chgrp",
  "crontab",
  "shred"
] as const

const CRITICAL_PATH_PREFIXES = [
  "/System",
  "/usr",
  "/bin",
  "/sbin",
  "/etc",
  "/var",
  "/private",
  "/Library"
] as const

const CRITICAL_PATH_EXACT = new Set(["/", "~", "~/", "$HOME", "$HOME/"])

function isCriticalPath(arg: string): boolean {
  if (CRITICAL_PATH_EXACT.has(arg)) {
    return true
  }

  return CRITICAL_PATH_PREFIXES.some(prefix => arg === prefix || arg.startsWith(`${prefix}/`))
}

function hasRecursiveFlag(args: string[]): boolean {
  return args.some(arg => {
    if (arg === "--recursive") {
      return true
    }

    if (!arg.startsWith("-") || arg.startsWith("--")) {
      return false
    }

    return arg.slice(1).includes("R")
  })
}

function getDangerousArgsReason(command: string, args: string[]): string | null {
  if (command === "rm") {
    if (args.some(isCriticalPath)) {
      return "Blocking dangerous rm target on critical system path."
    }
    return null
  }

  if (command === "dd") {
    if (args.some(arg => arg.startsWith("of=/dev/"))) {
      return "Blocking dd writes directly to device paths."
    }
    return null
  }

  if (command === "chmod" || command === "chown") {
    if (hasRecursiveFlag(args) && args.some(isCriticalPath)) {
      return `Blocking recursive ${command} on critical system path.`
    }
  }

  return null
}

export type CommandSource = "channel" | "desktop"

export interface ValidationResult {
  isAllowed: boolean
  requiresApproval: boolean
  reason?: string
}

/**
 * Validates a command against blocked and dangerous lists with additional argument checks
 * @param command - The command to validate (should be bare name like 'ls', not path)
 * @param args - Command arguments used for parameter-level blocking checks
 * @param source - Where the command originates: "channel" (e.g. Telegram) auto-allows, "desktop" may require approval
 * @returns Validation result with approval requirement
 */
export function validateCommand(
  command: string,
  args: string[] = [],
  source: CommandSource = "desktop"
): ValidationResult {
  // Remove any path component to get bare command name
  const bareCommand = command.split("/").pop() || command

  // Check if command is blocked regardless of approval
  if ((BLOCKED_COMMANDS as readonly string[]).includes(bareCommand)) {
    return {
      isAllowed: false,
      requiresApproval: false,
      reason: `Command '${bareCommand}' is blocked by policy and cannot be executed.`
    }
  }

  // Block dangerous parameter combinations for specific commands
  const dangerousArgsReason = getDangerousArgsReason(bareCommand, args)
  if (dangerousArgsReason) {
    return {
      isAllowed: false,
      requiresApproval: false,
      reason: dangerousArgsReason
    }
  }

  // Dangerous commands require user approval on desktop
  if ((DANGEROUS_COMMANDS as readonly string[]).includes(bareCommand)) {
    return {
      isAllowed: true,
      requiresApproval: source === "desktop"
    }
  }

  // All other commands are auto-allowed without approval
  return {
    isAllowed: true,
    requiresApproval: false
  }
}
