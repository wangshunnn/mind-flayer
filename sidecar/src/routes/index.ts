import type { Hono } from "hono"
import { handleChat } from "./chat"
import { handleHealth } from "./health"

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
}
