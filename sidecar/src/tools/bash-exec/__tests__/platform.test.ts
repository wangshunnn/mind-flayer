import { describe, expect, it } from "vitest"
import { assertPlatformSupported, isSupportedPlatform } from "../platform"

describe("Platform Checker", () => {
  describe("isSupportedPlatform", () => {
    it("should return boolean", () => {
      const result = isSupportedPlatform()
      expect(typeof result).toBe("boolean")
    })

    it("should return true on non-Windows platforms", () => {
      if (process.platform !== "win32") {
        expect(isSupportedPlatform()).toBe(true)
      }
    })
  })

  describe("assertPlatformSupported", () => {
    it("should not throw on supported platforms", () => {
      if (process.platform !== "win32") {
        expect(() => assertPlatformSupported()).not.toThrow()
      }
    })

    it("should throw on Windows", () => {
      if (process.platform === "win32") {
        expect(() => assertPlatformSupported()).toThrow("not supported on Windows")
      }
    })
  })
})
