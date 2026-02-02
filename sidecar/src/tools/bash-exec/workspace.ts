/**
 * Workspace manager for bash execution sandboxes
 * Creates and manages isolated temporary directories per chat
 */

import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const BASE_DIR = join(tmpdir(), "mind-flayer-bash")

const README_CONTENT = `# Mind Flayer Bash Sandbox

This is a temporary sandbox directory created by Mind Flayer for safe command execution.

- Commands execute with this directory as the working directory (cwd)
- Files created without explicit paths will appear here
- This directory is automatically cleaned up when the chat is deleted
- You can access real file system paths via explicit paths in command arguments

Example:
  - "ls" lists files in this sandbox
  - "ls ~/Desktop" lists files on your real Desktop
  - "touch test.txt" creates file in sandbox
  - "cat ~/Documents/file.txt" reads from real Documents folder

Created: ${new Date().toISOString()}
`

/**
 * Ensures a chat-specific workspace exists and returns its path
 * Creates the workspace if it doesn't exist
 * @param chatId - Unique identifier for the chat session
 * @returns Absolute path to the workspace directory
 */
export async function ensureChatWorkspace(chatId: string): Promise<string> {
  // Use a temporary ID if chatId is not provided
  const effectiveChatId = chatId || `temp-${Date.now()}`
  const workspacePath = join(BASE_DIR, effectiveChatId)

  try {
    // Create workspace directory (and parent if needed)
    await mkdir(workspacePath, { recursive: true })

    // Create README file to explain the sandbox
    const readmePath = join(workspacePath, "README.md")
    await writeFile(readmePath, README_CONTENT, "utf-8")

    return workspacePath
  } catch (error) {
    throw new Error(
      `Failed to create workspace for chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Cleans up a chat workspace by deleting it recursively
 * @param chatId - Unique identifier for the chat session
 */
export async function cleanupWorkspace(chatId: string): Promise<void> {
  const workspacePath = join(BASE_DIR, chatId)

  try {
    await rm(workspacePath, { recursive: true, force: true })
  } catch (error) {
    // Log error but don't throw - cleanup is best-effort
    console.error(
      `[BashExec] Failed to cleanup workspace ${chatId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Gets the path to a chat workspace without creating it
 * @param chatId - Unique identifier for the chat session
 * @returns Absolute path to the workspace directory
 */
export function getWorkspacePath(chatId: string): string {
  return join(BASE_DIR, chatId)
}
