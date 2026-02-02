/**
 * Command validator for bash execution tool
 * Provides whitelist-based command validation and danger detection
 */

/**
 * Safe commands that can be executed without user approval
 * These are read-only or informational commands
 */
export const SAFE_COMMANDS = [
  "ls",
  "cat",
  "pwd",
  "echo",
  "grep",
  "find",
  "head",
  "tail",
  "wc",
  "tree",
  "file",
  "stat",
  "df",
  "du",
  "which",
  "whoami",
  "date",
  "dirname",
  "basename",
  "realpath",
  "readlink",
  "env",
  "printenv",
  "uname",
  "hostname"
] as const

/**
 * Dangerous commands that require user approval
 * These commands can modify files or system state
 */
export const DANGEROUS_COMMANDS = [
  "rm",
  "chmod",
  "chown",
  "mv",
  "cp",
  "mkdir",
  "rmdir",
  "touch",
  "ln",
  "write",
  "dd",
  "kill",
  "killall",
  "pkill"
] as const

export interface ValidationResult {
  isAllowed: boolean
  requiresApproval: boolean
  reason?: string
}

/**
 * Validates a command against whitelist and danger list
 * @param command - The command to validate (should be bare name like 'ls', not path)
 * @returns Validation result with approval requirement
 */
export function validateCommand(command: string): ValidationResult {
  // Remove any path component to get bare command name
  const bareCommand = command.split("/").pop() || command

  // Check if command is in safe list
  if ((SAFE_COMMANDS as readonly string[]).includes(bareCommand)) {
    return {
      isAllowed: true,
      requiresApproval: false
    }
  }

  // Check if command is in dangerous list
  if ((DANGEROUS_COMMANDS as readonly string[]).includes(bareCommand)) {
    return {
      isAllowed: true,
      requiresApproval: true
    }
  }

  // Command not in either list - reject
  return {
    isAllowed: false,
    requiresApproval: false,
    reason: `Command '${bareCommand}' is not in the allowed command list. Safe commands include: ${SAFE_COMMANDS.slice(0, 10).join(", ")}, etc.`
  }
}
