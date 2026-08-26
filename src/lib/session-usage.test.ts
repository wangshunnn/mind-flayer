import type { LanguageModelUsage } from "ai"
import { describe, expect, it } from "vitest"
import type { CompactionEntry } from "../../shared/context"
import {
  formatCompactTokens,
  mergeSessionUsage,
  summarizeSessionUsage,
  type UsageMessage
} from "./session-usage"

const usage = (input: number, output: number, read: number | null = 0): LanguageModelUsage => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
  inputTokenDetails: {
    noCacheTokens: undefined,
    cacheReadTokens: read ?? undefined,
    cacheWriteTokens: 0
  },
  outputTokenDetails: { textTokens: output, reasoningTokens: 0 }
})
const message = (id: string, tokens: LanguageModelUsage, at = 1): UsageMessage => ({
  id,
  role: "assistant",
  metadata: { totalUsage: tokens, lastStepUsage: tokens, lastStepAt: at }
})
const compaction: CompactionEntry = {
  type: "compaction",
  id: "c1",
  createdAt: 5,
  summary: "Summary",
  firstKeptEntryId: "new:0",
  prefixHash: "prefix",
  reason: "manual",
  tokensBefore: 1000,
  tokensAfter: 200,
  modelProvider: "custom",
  modelId: "model",
  usage: usage(50, 5, 10)
}

describe("session usage", () => {
  it("counts user turns and model steps, not individual tool calls", () => {
    const user: UsageMessage = { id: "u", role: "user" }
    const reply: UsageMessage = {
      ...message("a", usage(1000, 50)),
      parts: [
        { type: "step-start" },
        {
          type: "tool-memoryGet",
          toolCallId: "one",
          state: "output-available",
          input: {},
          output: "A"
        },
        {
          type: "tool-memoryGet",
          toolCallId: "two",
          state: "output-available",
          input: {},
          output: "B"
        },
        { type: "step-start" },
        { type: "text", text: "Done" }
      ]
    }
    const records = mergeSessionUsage(new Map(), [user, reply])
    expect(summarizeSessionUsage(records, [compaction])).toMatchObject({ turns: 1, steps: 2 })
    const regenerated = mergeSessionUsage(records, [
      user,
      message("replacement", usage(100, 10), 2)
    ])
    expect(summarizeSessionUsage(regenerated)).toMatchObject({ turns: 1, steps: 3 })
    expect(mergeSessionUsage(regenerated, [user, reply])).toBe(regenerated)
    const hydrated = mergeSessionUsage(new Map(), [
      user,
      { ...reply, parts: undefined, stepStartCount: 2 }
    ])
    expect(summarizeSessionUsage(hydrated)).toEqual(summarizeSessionUsage(records))
  })

  it("uses persisted completed steps on continuation and excludes an unfinished legacy step", () => {
    const completed: UsageMessage = {
      ...message("a", usage(100, 10)),
      stepStartCount: 2,
      metadata: { totalUsage: usage(100, 10), stepCount: 1, lastStepAt: 1 }
    }
    const continued: UsageMessage = {
      ...completed,
      metadata: { totalUsage: usage(200, 20), stepCount: 2, lastStepAt: 2 }
    }
    const records = mergeSessionUsage(mergeSessionUsage(new Map(), [completed]), [continued])
    expect(summarizeSessionUsage(records).steps).toBe(2)
    const aborted: UsageMessage = {
      ...completed,
      metadata: { totalUsage: usage(100, 10), isAbort: true }
    }
    expect(summarizeSessionUsage(mergeSessionUsage(new Map(), [aborted])).steps).toBe(1)
  })

  it("retains replaced replies, includes compaction once, and restores the same totals", () => {
    const old = message("old", usage(100, 10, 20))
    const current = message("new", usage(200, 20), 2)
    let records = mergeSessionUsage(new Map(), [old])
    records = mergeSessionUsage(records, [current])
    expect(mergeSessionUsage(records, [current])).toBe(records)
    const result = summarizeSessionUsage(records, [compaction, compaction])
    expect(result).toMatchObject({
      input: 320,
      output: 35,
      cacheRead: 30,
      cacheHitPercent: 0,
      hasUsage: true
    })
    const restored = mergeSessionUsage(new Map(), JSON.parse(JSON.stringify([old, current])))
    expect(summarizeSessionUsage(restored, [compaction])).toEqual(result)
    expect(summarizeSessionUsage(new Map()).hasUsage).toBe(false)
  })

  it("replaces cumulative snapshots on continuation and ignores stale hydration", () => {
    const before = message("a", usage(100, 10), 1)
    const after = message("a", usage(250, 25), 2)
    const records = mergeSessionUsage(mergeSessionUsage(new Map(), [before]), [after])
    expect(summarizeSessionUsage(records)).toMatchObject({ input: 250, output: 25 })
    expect(mergeSessionUsage(records, [before])).toBe(records)
    expect(
      mergeSessionUsage(records, [{ id: "a", role: "assistant", metadata: { isError: true } }])
    ).toBe(records)
  })

  it("calculates CH from the last step, not message totals or compaction", () => {
    const records = mergeSessionUsage(new Map(), [
      {
        id: "a",
        role: "assistant",
        metadata: {
          totalUsage: usage(1000, 50, 900),
          lastStepUsage: usage(100, 10, 10),
          lastStepAt: 1
        }
      }
    ])
    expect(summarizeSessionUsage(records, [compaction]).cacheHitPercent).toBe(10)
    const next = mergeSessionUsage(records, [message("next", usage(100, 10, null), 2)])
    expect(summarizeSessionUsage(next)).toMatchObject({
      cacheHitPercent: null,
      cacheDetailsIncomplete: true
    })
  })

  it("does not fabricate cache hits for legacy messages or missing cache details", () => {
    const records = mergeSessionUsage(new Map(), [
      { id: "legacy", role: "assistant", metadata: { totalUsage: usage(100, 20, null) } }
    ])
    expect(summarizeSessionUsage(records)).toMatchObject({
      input: 100,
      cacheRead: null,
      cacheHitPercent: null,
      cacheDetailsIncomplete: true
    })
    const knownZero = mergeSessionUsage(new Map(), [message("zero", usage(100, 10))])
    expect(summarizeSessionUsage(knownZero)).toMatchObject({ cacheRead: 0, cacheHitPercent: 0 })
  })

  it.each([
    [999, "999"],
    [6400, "6.4k"],
    [23000, "23k"],
    [1000000, "1.0M"],
    [12000000, "12M"]
  ])("formats %s like pi", (count, text) => {
    expect(formatCompactTokens(count)).toBe(text)
  })
})
