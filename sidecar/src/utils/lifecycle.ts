/**
 * Graceful shutdown handler.
 * Aborts active requests and closes server with timeout.
 *
 * @param globalAbortController - Controller for aborting active requests
 * @param server - Bun HTTP server instance
 * @param preShutdown - Optional best-effort callback before abort/close
 */
export function createShutdownHandler(
  globalAbortController: AbortController,
  server: { stop: (closeActiveConnections?: boolean) => void },
  preShutdown?: () => Promise<void> | void
) {
  let shutdownStarted = false

  return () => {
    if (shutdownStarted) {
      return
    }
    shutdownStarted = true

    void (async () => {
      console.log("Shutting down gracefully...")

      if (preShutdown) {
        try {
          await preShutdown()
        } catch (error) {
          console.error("[sidecar] pre-shutdown hook failed:", error)
        }
      }

      // Abort all active AI requests
      globalAbortController.abort()
      console.info("[sidecar] All active requests cancelled")

      // Stop the Bun server
      server.stop(true)
      console.log("Server closed, port released")

      // Force exit if something hangs
      setTimeout(() => {
        console.error("Forced shutdown")
        process.exit(1)
      }, 5000)

      process.exit(0)
    })()
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
