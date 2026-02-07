import { describe, expect, it } from "vitest"
import {
  buildSnippet,
  extractPlainTextFromContentJson,
  normalizeForSearch
} from "@/lib/chat-search"

describe("extractPlainTextFromContentJson", () => {
  it("extracts text parts from valid content json", () => {
    const contentJson = JSON.stringify({
      parts: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" }
      ]
    })

    expect(extractPlainTextFromContentJson(contentJson)).toBe("hello world")
  })

  it("returns empty string for invalid json", () => {
    expect(extractPlainTextFromContentJson("{invalid")).toBe("")
  })

  it("ignores non-text parts", () => {
    const contentJson = JSON.stringify({
      parts: [
        { type: "text", text: "question" },
        { type: "tool-webSearch", state: "done" },
        { type: "text", text: "answer" }
      ]
    })

    expect(extractPlainTextFromContentJson(contentJson)).toBe("question answer")
  })
})

describe("normalizeForSearch", () => {
  it("normalizes spaces and case", () => {
    expect(normalizeForSearch("  HeLLo  ")).toBe("hello")
  })

  it("supports chinese keyword normalization", () => {
    expect(normalizeForSearch("  天气  ")).toBe("天气")
  })
})

describe("buildSnippet", () => {
  const text =
    "Discuss the deployment strategy for the release, including rollback, monitoring, and alerting details."

  it("builds snippet around keyword hit in middle", () => {
    const snippet = buildSnippet(text, "rollback", 20)
    expect(snippet).toContain("rollback")
    expect(snippet.startsWith("...")).toBe(true)
  })

  it("returns fallback snippet when keyword does not match", () => {
    const snippet = buildSnippet(text, "database")
    expect(snippet.length).toBeGreaterThan(0)
  })

  it("supports chinese keyword matching", () => {
    const snippet = buildSnippet("今天天气很好，适合出去散步。", "天气")
    expect(snippet).toContain("天气")
  })
})
