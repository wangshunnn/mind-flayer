import { defineProject } from "vitest/config"

export default defineProject({
  test: {
    name: "sidecar",
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.example.ts"]
  }
})
