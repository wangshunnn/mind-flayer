import type { Hono } from "hono"
import { handleChat } from "./chat"
import { handleCleanupWorkspace } from "./cleanup"
import { handleHealth } from "./health"
import { handleTitleGenerator } from "./title"

/**
 * Register all application routes.
 *
 * @param app - Hono application instance
 * @param globalAbortController - Global abort controller for shutdown
 */
export function registerRoutes(app: Hono, globalAbortController: AbortController) {
  // Health check endpoint
  app.get("/health", handleHealth)

  // AI streaming chat endpoint
  app.post("/api/chat", c => handleChat(c, globalAbortController))

  // Chat title generation endpoint
  app.post("/api/title", handleTitleGenerator)

  // Workspace cleanup endpoint
  app.post("/api/cleanup-workspace", handleCleanupWorkspace)
}
