import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "."),
      "@": path.resolve(__dirname, "./src")
    }
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.config.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/tests/fixtures/**"
      ]
    },
    projects: [
      {
        // Frontend React tests
        extends: true,
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["**/node_modules/**", "**/dist/**"]
        }
      },
      // Sidecar Node.js tests
      "./sidecar/vitest.config.ts"
    ]
  }
})
