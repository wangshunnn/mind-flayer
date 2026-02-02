/**
 * Workspace cleanup route handler.
 * Allows cleanup of bash execution sandbox directories.
 */

import type { Context } from "hono"
import { cleanupWorkspace } from "../tools/bash-exec/workspace"
import { BadRequestError, mapErrorToResponse } from "../utils/http-errors"

/**
 * Cleanup workspace endpoint handler.
 * Deletes the bash execution sandbox directory for a specific chat.
 */
export async function handleCleanupWorkspace(c: Context) {
  try {
    const body = await c.req.json()
    const chatId = body?.chatId

    // Validate request
    if (!chatId || typeof chatId !== "string") {
      throw new BadRequestError("chatId is required")
    }

    console.log(`[sidecar] Cleaning up workspace for chat: ${chatId}`)

    // Cleanup workspace
    await cleanupWorkspace(chatId)

    return c.json({
      success: true,
      message: `Workspace for chat ${chatId} cleaned up successfully`
    })
  } catch (error) {
    console.error("[sidecar] Cleanup error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
