/**
 * Graceful shutdown handler.
 * Aborts active requests and closes server with timeout.
 *
 * @param globalAbortController - Controller for aborting active requests
 * @param server - HTTP server instance
 */
export function createShutdownHandler(
  globalAbortController: AbortController,
  server: { close: (callback: () => void) => void }
) {
  return () => {
    console.log("Shutting down gracefully...")

    // Abort all active AI requests
    globalAbortController.abort()
    console.info("[sidecar] All active requests cancelled")

    server.close(() => {
      console.log("Server closed, port released")
      process.exit(0)
    })

    // Force exit if server doesn't close within 5 seconds
    setTimeout(() => {
      console.error("Forced shutdown")
      process.exit(1)
    }, 5000)
  }
}

/**
 * Setup stdin listener for configuration updates from Tauri.
 *
 * @param onConfigUpdate - Callback for config update messages
 */
export function setupStdinListener(onConfigUpdate: (message: unknown) => void) {
  process.stdin.setEncoding("utf8")

  process.stdin.on("data", (data: string) => {
    try {
      console.log("[sidecar] Received stdin data:", data.substring(0, 200))
      const lines = data.trim().split("\n")

      for (const line of lines) {
        if (!line.trim()) continue

        const message = JSON.parse(line)
        console.log("[sidecar] Parsed message type:", message.type)

        if (message.type === "config_update" && message.configs) {
          onConfigUpdate(message)
        }
      }
    } catch (error) {
      console.error("[sidecar] Error parsing stdin message:", error)
    }
  })
}
