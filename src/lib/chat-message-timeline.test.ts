import { describe, expect, it } from "vitest"
import { getActiveTimelineAnchorIndex } from "@/lib/chat-message-timeline"

describe("getActiveTimelineAnchorIndex", () => {
  it("returns -1 when there are no anchors", () => {
    expect(getActiveTimelineAnchorIndex([], 0)).toBe(-1)
  })

  it("returns -1 when the viewport is above the first anchor", () => {
    expect(getActiveTimelineAnchorIndex([120, 340, 560], 40, { tolerance: 0 })).toBe(-1)
  })

  it("returns the latest user anchor that has reached the viewport top", () => {
    expect(getActiveTimelineAnchorIndex([120, 340, 560], 389, { tolerance: 0 })).toBe(1)
  })

  it("returns the last anchor when the viewport is below every anchor", () => {
    expect(getActiveTimelineAnchorIndex([120, 340, 560], 1_000, { tolerance: 0 })).toBe(2)
  })

  it("falls back to the last visible anchor when the viewport is already at the bottom", () => {
    expect(
      getActiveTimelineAnchorIndex([120, 340], 0, {
        maxScrollTop: 0,
        tolerance: 0,
        viewportHeight: 500
      })
    ).toBe(1)
  })

  it("does not advance to lower visible anchors before reaching the bottom", () => {
    expect(
      getActiveTimelineAnchorIndex([120, 340], 0, {
        maxScrollTop: 200,
        tolerance: 0,
        viewportHeight: 500
      })
    ).toBe(-1)
  })
})
