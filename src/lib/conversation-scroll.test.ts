import { describe, expect, it } from "vitest"
import {
  didConversationReaderMove,
  getConversationDistanceFromBottom,
  getConversationScrollFloor,
  getExpectedConversationScrollTop,
  isConversationAtBottom
} from "@/lib/conversation-scroll"

describe("conversation scroll geometry", () => {
  it("clamps the scroll floor when content fits inside the viewport", () => {
    expect(getConversationScrollFloor(240, 400)).toBe(0)
  })

  it("measures distance from the real scroll floor", () => {
    expect(getConversationDistanceFromBottom(540, 1_000, 300)).toBe(160)
    expect(getConversationDistanceFromBottom(720, 1_000, 300)).toBe(0)
  })

  it("normalizes the observed top when layout shrink clamps the viewport", () => {
    expect(getExpectedConversationScrollTop(700, 500)).toBe(500)
    expect(
      didConversationReaderMove({
        scrollTop: 500,
        observedTop: 700,
        floor: 500
      })
    ).toBe(false)
  })

  it("recognizes reader movement away from the delivered position", () => {
    expect(
      didConversationReaderMove({
        scrollTop: 520,
        observedTop: 700,
        floor: 700
      })
    ).toBe(true)
  })

  it("ignores subpixel delivery differences", () => {
    expect(
      didConversationReaderMove({
        scrollTop: 699.75,
        observedTop: 700,
        floor: 700
      })
    ).toBe(false)
  })

  it("uses the bottom threshold without forcing exact alignment", () => {
    expect(isConversationAtBottom(24)).toBe(true)
    expect(isConversationAtBottom(24.01)).toBe(false)
  })
})
