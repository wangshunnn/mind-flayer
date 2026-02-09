import type { Context } from "hono"

const SIDECAR_SERVICE_NAME = "mind-flayer-sidecar"
const SIDECAR_STARTUP_TOKEN = process.env.SIDECAR_STARTUP_TOKEN ?? ""

/**
 * Health check route handler.
 * Returns service status and version information.
 */
export async function handleHealth(c: Context) {
  return c.json({
    status: "ok",
    version: "0.1.0",
    service: SIDECAR_SERVICE_NAME,
    startupToken: SIDECAR_STARTUP_TOKEN
  })
}
