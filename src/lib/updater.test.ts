import { describe, expect, it } from "vitest"
import { formatBytes, formatUpdateDate, toErrorMessage } from "@/lib/updater"

describe("updater helpers", () => {
  it("formats byte sizes for display", () => {
    expect(formatBytes(1024, "en-US")).toBe("1 KB")
    expect(formatBytes(1536, "en-US")).toBe("1.5 KB")
    expect(formatBytes(1024 * 1024, "en-US")).toBe("1 MB")
  })

  it("returns null for invalid update dates", () => {
    expect(formatUpdateDate(null, "en-US")).toBeNull()
    expect(formatUpdateDate("not-a-date", "en-US")).toBeNull()
  })

  it("extracts displayable error messages", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom")
    expect(toErrorMessage("boom")).toBeNull()
  })
})
