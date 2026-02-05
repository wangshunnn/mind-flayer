import { describe, expect, it } from "vitest"
import { assertPlatformSupported, isBashExecSupportedPlatform } from "../platform"

describe("Platform Checker", () => {
  describe("isBashExecSupportedPlatform", () => {
    it("should return boolean", () => {
      const result = isBashExecSupportedPlatform()
      expect(typeof result).toBe("boolean")
    })

    it("should return true on non-Windows platforms", () => {
      if (process.platform !== "win32") {
        expect(isBashExecSupportedPlatform()).toBe(true)
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
