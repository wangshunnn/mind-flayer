import { cors } from "hono/cors"
import { devOrigins, prodOrigins } from "../config/constants"
import { IS_DEV } from "../config/env"

console.log(`Starting sidecar in ${IS_DEV ? "development" : "production"} mode`, IS_DEV)

/**
 * Create environment-aware CORS middleware.
 *
 * @param isDev - Whether running in development mode
 * @returns CORS middleware
 */
export function createCorsMiddleware() {
  return cors({
    origin: origin => {
      if (!origin) {
        // Non-browser request (e.g., curl)
        return "*"
      }
      if (IS_DEV && devOrigins.has(origin)) {
        return origin
      }
      if (!IS_DEV && prodOrigins.has(origin)) {
        return origin
      }
      // Disallow other origins
      return ""
    }
  })
}
