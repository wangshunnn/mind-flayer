import type { Context } from "hono"

/**
 * Health check route handler.
 * Returns service status and version information.
 */
export async function handleHealth(c: Context) {
  return c.json({ status: "ok", version: "0.1.0" })
}
