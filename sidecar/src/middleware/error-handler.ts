import type { Context, Next } from "hono"
import { mapErrorToResponse } from "../utils/http-errors"

/**
 * Global error handler middleware.
 * Catches unhandled errors and returns standardized JSON responses.
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next()
  } catch (error) {
    console.error("[sidecar] Unhandled error:", error)
    const errorResponse = mapErrorToResponse(error)
    return c.json(errorResponse.body, errorResponse.statusCode)
  }
}
