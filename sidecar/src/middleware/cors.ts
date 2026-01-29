import { cors } from "hono/cors"
import { devOrigins, prodOrigins } from "../config/constants"

/**
 * Create environment-aware CORS middleware.
 *
 * @param isDev - Whether running in development mode
 * @returns CORS middleware
 */
export function createCorsMiddleware(isDev: boolean) {
  return cors({
    origin: origin => {
      if (!origin) {
        // Non-browser request (e.g., curl)
        return "*"
      }
      if (isDev && devOrigins.has(origin)) {
        return origin
      }
      if (!isDev && prodOrigins.has(origin)) {
        return origin
      }
      // Disallow other origins
      return ""
    }
  })
}
