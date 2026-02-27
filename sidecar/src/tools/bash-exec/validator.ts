/**
 * Command validator for bash execution tool
 * Provides allowlist/blocklist validation with parameter-level safety checks
 */

/**
 * Safe commands that can be executed without user approval
 * These are read-only or informational commands
 */
export const SAFE_COMMANDS = [
  "arch",
  "basename",
  "cal",
  "cat",
  "cmp",
  "comm",
  "cut",
  "date",
  "df",
  "diff",
  "dirname",
  "du",
  "echo",
  "env",
  "file",
  "find",
  "grep",
  "groups",
  "head",
  "hexdump",
  "hostname",
  "id",
  "jq",
  "ls",
  "md5",
  "md5sum",
  "nl",
  "od",
  "open", // macOS-specific safe command for opening files/URLs
  "printenv",
  "ps",
  "pwd",
  "readlink",
  "realpath",
  "screencapture", // macOS-specific safe command for taking screenshots
  "sha1sum",
  "sha256sum",
  "shasum",
  "sort",
  "stat",
  "strings",
  "tail",
  "tr",
  "tree",
  "uname",
  "uniq",
  "uptime",
  "vm_stat",
  "wc",
  "which",
  "who",
  "whoami"
] as const

/**
 * Commands that are always denied regardless of user approval
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

export interface ValidationResult {
  isAllowed: boolean
  requiresApproval: boolean
  reason?: string
}

/**
 * Validates a command against safe and blocked lists with additional argument checks
 * @param command - The command to validate (should be bare name like 'ls', not path)
 * @param args - Command arguments used for parameter-level blocking checks
 * @returns Validation result with approval requirement
 */
export function validateCommand(command: string, args: string[] = []): ValidationResult {
  // Remove any path component to get bare command name
  const bareCommand = command.split("/").pop() || command

  // Check if command is in safe list
  if ((SAFE_COMMANDS as readonly string[]).includes(bareCommand)) {
    return {
      isAllowed: true,
      requiresApproval: false
    }
  }

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

  // All non-safe and non-blocked commands require user approval
  return {
    isAllowed: true,
    requiresApproval: true
  }
}
