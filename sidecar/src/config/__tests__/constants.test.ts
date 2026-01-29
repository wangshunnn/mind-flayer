import { describe, expect, it } from "vitest"
import { devOrigins, MODEL_PROVIDERS, prodOrigins } from "../constants"

describe("constants", () => {
  describe("MODEL_PROVIDERS", () => {
    it("should have minimax provider configured", () => {
      expect(MODEL_PROVIDERS).toHaveProperty("minimax")
      expect(MODEL_PROVIDERS.minimax).toHaveProperty("defaultBaseUrl")
    })

    it("should have valid minimax base URL", () => {
      const baseUrl = MODEL_PROVIDERS.minimax.defaultBaseUrl
      expect(baseUrl).toBe("https://api.minimaxi.com/anthropic/v1")
      expect(baseUrl).toMatch(/^https?:\/\//)
    })
  })

  describe("devOrigins", () => {
    it("should be a Set", () => {
      expect(devOrigins).toBeInstanceOf(Set)
    })

    it("should contain localhost development origin", () => {
      expect(devOrigins.has("http://localhost:1420")).toBe(true)
    })

    it("should have at least one origin", () => {
      expect(devOrigins.size).toBeGreaterThan(0)
    })
  })

  describe("prodOrigins", () => {
    it("should be a Set", () => {
      expect(prodOrigins).toBeInstanceOf(Set)
    })

    it("should contain Tauri production origins", () => {
      expect(prodOrigins.has("http://tauri.localhost")).toBe(true)
      expect(prodOrigins.has("https://tauri.localhost")).toBe(true)
      expect(prodOrigins.has("tauri://localhost")).toBe(true)
    })

    it("should have at least one origin", () => {
      expect(prodOrigins.size).toBeGreaterThan(0)
    })

    it("should not overlap with dev origins", () => {
      const overlap = [...devOrigins].filter(origin => prodOrigins.has(origin))
      expect(overlap).toHaveLength(0)
    })
  })
})
