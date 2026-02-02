/**
 * Platform detection for bash execution tool
 * Ensures tool only runs on supported platforms (macOS, Linux)
 */

/**
 * Checks if the current platform supports bash execution
 * @returns true if platform is macOS or Linux
 */
export function isSupportedPlatform(): boolean {
  return process.platform !== "win32"
}

/**
 * Asserts that the current platform is supported
 * @throws Error if platform is Windows
 */
export function assertPlatformSupported(): void {
  if (!isSupportedPlatform()) {
    throw new Error(
      "Bash execution is not supported on Windows. This tool requires macOS or Linux."
    )
  }
}
