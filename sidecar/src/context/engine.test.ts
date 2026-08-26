import type { LanguageModelUsage, UIMessage } from "ai"
import { jsonSchema, tool } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { describe, expect, it, vi } from "vitest"
import { emptyContextState } from "../../../shared/context"
import {
  appendTemporalContext,
  ConversationContext,
  createContextEntries,
  estimateTokens,
  fingerprint,
  projectContext,
  serializeConversation
} from "./engine"
import {
  buildSummarizationPrompt,
  formatCompactionSummary,
  SUMMARIZATION_SYSTEM_PROMPT
} from "./prompts"

function message(id: string, role: "user" | "assistant", text = id): UIMessage {
  return { id, role, parts: [{ type: "text", text }] }
}

const options = () => ({
  model: {} as never,
  modelProvider: "test",
  modelId: "test",
  instructions: "Stable system",
  tools: {},
  contextWindow: 8000,
  reserveTokens: 1000,
  keepRecentTokens: 100,
  summarize: vi.fn(async (_text: string, _previous: string | undefined) => ({
    text: "Goal: finish the task. Keep prior decisions."
  }))
})

const history = () => [
  message("u1", "user", "Earlier request. ".repeat(100)),
  message("a1", "assistant", "Earlier findings. ".repeat(100)),
  message("u2", "user", "Recent request. ".repeat(50)),
  message("a2", "assistant", "Recent answer. ".repeat(50)),
  message("u3", "user", "Continue")
]

describe("Pi-style token estimates", () => {
  it.each([
    ["ASCII", "abcdefgh", 2],
    ["Chinese", "中文测试", 1],
    ["UTF-16", "😀😀", 1]
  ])("uses string length divided by four for %s", (_name, text, expected) => {
    expect(estimateTokens(text)).toBe(expected)
  })

  it("rounds once per message instead of adding per-part or wrapper overhead", () => {
    expect(
      estimateTokens([
        {
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" }
          ]
        }
      ])
    ).toBe(1)
    expect(
      estimateTokens([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" }
      ])
    ).toBe(2)
    expect(estimateTokens([])).toBe(0)
  })

  it("counts assistant text, reasoning, and serialized tool arguments, not metadata", () => {
    const input = { path: "/test", count: 3 }
    expect(
      estimateTokens([
        {
          role: "assistant",
          providerOptions: { test: { signature: "ignored".repeat(1000) } },
          content: [
            { type: "text", text: "Text" },
            { type: "reasoning", text: "中文测试" },
            { type: "tool-call", toolCallId: "ignored-id".repeat(1000), toolName: "read", input }
          ]
        }
      ])
    ).toBe(Math.ceil((4 + 4 + "read".length + JSON.stringify(input).length) / 4))
  })

  it("counts text and JSON tool outputs by the content sent to the model", () => {
    const value = { content: "actual result", ok: true }
    expect(
      estimateTokens([
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "read",
              output: { type: "text", value: "abcd" }
            },
            {
              type: "tool-result",
              toolCallId: "call-2",
              toolName: "read",
              output: { type: "json", value }
            }
          ]
        }
      ])
    ).toBe(Math.ceil((4 + JSON.stringify(value).length) / 4))
  })

  it("uses the fixed image estimate for user images and tool-result images without counting bytes", () => {
    const data = "A".repeat(12000)
    expect(
      estimateTokens([
        { role: "user", content: [{ type: "image", image: `data:image/png;base64,${data}` }] }
      ])
    ).toBe(1200)
    expect(
      estimateTokens([{ role: "user", content: [{ type: "file", mediaType: "image/png", data }] }])
    ).toBe(1200)
    expect(
      estimateTokens([
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "image",
              toolName: "read",
              output: {
                type: "content",
                value: [
                  { type: "text", text: "abcd" },
                  { type: "file", mediaType: "image/png", data: { type: "data", data } }
                ]
              }
            }
          ]
        }
      ])
    ).toBe(1201)
  })

  it("counts inline file text and retains the existing non-image binary fallback", () => {
    expect(
      estimateTokens([
        {
          role: "user",
          content: [
            { type: "file", mediaType: "text/plain", data: { type: "text", text: "中文测试" } }
          ]
        }
      ])
    ).toBe(1)
    expect(
      estimateTokens([
        { role: "user", content: [{ type: "file", mediaType: "application/pdf", data: "opaque" }] }
      ])
    ).toBe(4096)
  })

  it("re-estimates usage saved with the previous heuristic without invalidating summaries", async () => {
    const config = options()
    const context = new ConversationContext(config)
    await context.update(history())
    await context.compact("manual")
    const compaction = context.project().compaction
    const current = context.usage()
    const legacyFingerprint = fingerprint([
      fingerprint([config.modelProvider, config.modelId, config.instructions, [], undefined]),
      [],
      []
    ])
    context.state.usage = { ...current, tokens: 999999, requestFingerprint: legacyFingerprint }
    expect(context.usage().tokens).toBe(current.tokens)
    expect(context.project().compaction).toEqual(compaction)
  })
})

const usage = (input: number, output: number, cacheRead = 0): LanguageModelUsage => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
  inputTokenDetails: {
    noCacheTokens: input - cacheRead,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: 0
  },
  outputTokenDetails: { textTokens: output, reasoningTokens: 0 }
})

describe("conversation context", () => {
  it("separates system and tool definitions from calls and results in the effective messages", async () => {
    const schema = { type: "object" as const, properties: { path: { type: "string" } } }
    const description = "Read a file"
    const context = new ConversationContext({
      ...options(),
      tools: { read: tool({ description, inputSchema: jsonSchema(schema) }) }
    })
    const raw: UIMessage[] = [
      message("u", "user", "Read this"),
      {
        id: "a",
        role: "assistant",
        parts: [
          {
            type: "tool-read",
            toolCallId: "call",
            state: "output-available",
            input: { path: "/test" },
            output: "File content"
          }
        ]
      }
    ]
    await context.update(raw)
    const initial = context.usage()
    expect(initial.breakdown).toEqual({
      systemTokens: 4,
      toolsTokens: Math.ceil(JSON.stringify([["read", description, schema]]).length / 4),
      messageTokens:
        Math.ceil("Read this".length / 4) +
        Math.ceil(("read".length + JSON.stringify({ path: "/test" }).length) / 4) +
        Math.ceil("File content".length / 4)
    })
    expect(initial.tokens).toBe(
      Object.values(initial.breakdown ?? {}).reduce((sum, tokens) => sum + tokens, 0)
    )
    await context.update([...raw, message("next", "user", "Continue")])
    expect(context.usage().breakdown).toEqual({
      ...initial.breakdown,
      messageTokens: (initial.breakdown?.messageTokens ?? 0) + 2
    })
    const withoutTools = new ConversationContext(options(), { ...context.state, usage: initial })
    await withoutTools.update(raw)
    expect(withoutTools.usage().breakdown?.toolsTokens).toBe(0)
    expect(withoutTools.usage().requestFingerprint).not.toBe(initial.requestFingerprint)
  })

  it("uses total step usage without counting cache or assistant output twice", async () => {
    const context = new ConversationContext(options())
    const raw = [message("u", "user"), message("a", "assistant", "Long answer".repeat(100))]
    await context.update(raw)
    const breakdown = context.usage().breakdown
    expect(context.recordUsage(usage(100, 20, 80), 1, context.entries[1].models)).toBe(true)
    expect(context.usage()).toMatchObject({
      tokens: 120,
      baselineTokens: 120,
      source: "measured",
      modelProvider: "test",
      modelId: "test"
    })
    expect(context.usage().breakdown).toEqual(breakdown)
    expect(breakdown?.toolsTokens).toBe(0)
    expect(breakdown?.messageTokens).toBeGreaterThan(120)
    context.recordUsage({ ...usage(100, 20, 80), totalTokens: 0 }, 1, context.entries[1].models)
    expect(context.usage().tokens).toBe(120)
  })

  it("adds tool results and new entries once, then replaces the estimate with fresh usage", async () => {
    const context = new ConversationContext(options())
    const assistant: UIMessage = {
      id: "a",
      role: "assistant",
      parts: [
        {
          type: "tool-example",
          toolCallId: "call",
          state: "output-available",
          input: {},
          output: "Large result".repeat(50)
        }
      ]
    }
    const raw = [message("u", "user"), assistant]
    await context.update(raw)
    const response = context.entries[1].models
    const toolTokens = estimateTokens(response.filter(item => item.role === "tool"))
    context.recordUsage(usage(100, 20, 80), 1, response)
    expect(context.usage()).toMatchObject({ tokens: 120 + toolTokens, source: "estimated" })
    await context.update([...raw, message("next", "user", "Continue")])
    const expected = 120 + toolTokens + estimateTokens(context.entries[2].models)
    expect(context.usage().tokens).toBe(expected)
    context.state.usage = context.usage()
    expect(context.usage().tokens).toBe(expected)
    await context.update([
      ...raw,
      message("next", "user", "Continue"),
      message("done", "assistant")
    ])
    context.recordUsage(usage(200, 40), 3, context.entries[3].models)
    expect(context.usage()).toMatchObject({ tokens: 240, baselineTokens: 240, source: "measured" })
  })

  it("preserves the valid baseline across zero usage and errors", async () => {
    const context = new ConversationContext(options())
    await context.update([message("u", "user"), message("a", "assistant")])
    context.recordUsage(usage(100, 20), 1, [])
    expect(context.recordUsage(usage(0, 0), 2, [])).toBe(false)
    expect(context.recordUsage(usage(900, 20), 2, [], "error")).toBe(false)
    expect(context.usage().baselineTokens).toBe(120)
  })

  it("invalidates measurement anchors on compaction, model changes, and changed prefixes", async () => {
    const config = options()
    const context = new ConversationContext(config)
    const raw = history()
    await context.update(raw)
    context.recordUsage(usage(6000, 100), raw.length, [])
    const restored = new ConversationContext({ ...config, modelId: "different" }, context.state)
    await restored.update(raw)
    expect(restored.usage().baselineTokens).toBeUndefined()
    expect(restored.usage().source).toBe("estimated")
    raw[0].parts = [{ type: "text", text: "Changed history".repeat(200) }]
    await context.update(raw)
    expect(context.usage().baselineTokens).toBeUndefined()
    context.recordUsage(usage(6000, 100), raw.length, [])
    await context.compact("manual")
    expect(context.usage().baselineTokens).toBeUndefined()
    expect(context.usage().compactionId).toBeDefined()
    expect(context.usage().tokens).toBeGreaterThan(0)
    const compacted = context.usage().breakdown
    expect(compacted?.messageTokens).toBe(estimateTokens(context.project().messages))
    expect(compacted?.messageTokens).toBeLessThan(
      estimateTokens(context.entries.flatMap(entry => entry.models))
    )
    const reloaded = new ConversationContext(config, context.state)
    await reloaded.update(raw)
    expect(reloaded.usage().breakdown).toEqual(compacted)
    context.recordUsage(usage(200, 20), context.entries.length, [])
    expect(context.usage()).toMatchObject({ baselineTokens: 220, source: "measured" })
  })

  it("uses the standalone prompt template while preserving the summary input and focus", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: "text", text: "Goal: continue the requested work." }],
        finishReason: { unified: "stop", raw: undefined },
        warnings: [],
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 }
        }
      }
    })
    const { summarize: _summarize, ...config } = options()
    const context = new ConversationContext({ ...config, model })
    await context.update(history())
    await context.compact("manual", "Preserve open work.")
    const boundary = context.entries.findIndex(
      entry => entry.id === context.project().compaction?.firstKeptEntryId
    )
    const input = serializeConversation(
      context.entries.slice(0, boundary).flatMap(entry => entry.models)
    )
    expect(model.doGenerateCalls).toHaveLength(1)
    expect(context.project().compaction?.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 10,
      totalTokens: 110
    })
    expect(model.doGenerateCalls[0].prompt).toEqual([
      { role: "system", content: SUMMARIZATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: buildSummarizationPrompt(input, undefined, "Preserve open work.") }
        ]
      }
    ])
  })

  it("keeps the replay prefix byte-for-byte compatible when extracting prompt templates", () => {
    expect(formatCompactionSummary("Saved\nsummary")).toBe(
      "<conversation_summary>\nSaved\nsummary\n</conversation_summary>\nContinue from the retained conversation. This is a context summary, not a new user request."
    )
    const conversation = "Literal {{previousSummary}} and {{focus}} from a tool result"
    expect(buildSummarizationPrompt(conversation, "Earlier decisions")).toBe(
      `<previous_summary>\nEarlier decisions\n</previous_summary>\n<conversation_fragment>\n${conversation}\n</conversation_fragment>`
    )
  })

  it("compacts at the capacity threshold and does not reuse stale pre-compaction usage", async () => {
    const config = { ...options(), contextWindow: 1600, reserveTokens: 400 }
    const context = new ConversationContext(config)
    await context.update(history())
    await context.prepare()
    expect(context.project().compaction?.reason).toBe("threshold")
    expect(context.usage().tokens).toBeLessThan(1200)
    const count = config.summarize.mock.calls.length
    await context.prepare()
    expect(config.summarize).toHaveBeenCalledTimes(count)
  })
  it("omits opaque attachment bytes from summaries but preserves ordinary tool data", () => {
    const serialized = serializeConversation([
      {
        role: "user",
        content: [
          { type: "image", image: `data:image/png;base64,${"B".repeat(10000)}` },
          { type: "text", text: "Attached design" }
        ]
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "read",
            toolName: "read",
            output: { type: "json", value: { data: "Important data ".repeat(500) } }
          }
        ]
      }
    ])
    expect(serialized).not.toContain("base64")
    expect(serialized).toContain("Attached design")
    expect(serialized).toContain("Important data ".repeat(500))
  })

  it("does not commit when cancellation happens during summary generation", async () => {
    const abort = new AbortController()
    const context = new ConversationContext({
      ...options(),
      abortSignal: abort.signal,
      summarize: async () => {
        abort.abort()
        return { text: "Summary" }
      }
    })
    await context.update(history())
    await expect(context.compact("manual")).rejects.toThrow()
    expect(context.state.events).toEqual([])
  })

  it("preserves the current date after its original anchor is summarized", async () => {
    const raw = history()
    const state = appendTemporalContext(
      raw.slice(0, 1),
      emptyContextState(),
      new Date("2026-08-26T12:00:00Z")
    )
    const context = new ConversationContext(options(), state)
    await context.update(raw)
    await context.compact("manual")
    expect(JSON.stringify(context.project().messages)).toContain("2026-08-26")
  })

  it("preserves reasoning and tool results beyond three user turns with the real SDK", async () => {
    const messages = history()
    messages[1].parts = [
      { type: "step-start" },
      { type: "reasoning", text: "original reasoning" },
      {
        type: "tool-example",
        toolCallId: "tool-1",
        state: "output-available",
        input: { value: 1 },
        output: "original result"
      },
      { type: "step-start" },
      { type: "text", text: "Answer" }
    ]
    const before = projectContext(
      await createContextEntries(messages, {}),
      emptyContextState()
    ).messages
    const after = projectContext(
      await createContextEntries(
        [...messages, message("a3", "assistant"), message("u4", "user")],
        {}
      ),
      emptyContextState()
    ).messages
    expect(after.slice(0, before.length)).toEqual(before)
    expect(JSON.stringify(before)).toContain("original reasoning")
    expect(JSON.stringify(before)).toContain("original result")
  })

  it("persists one fixed summary, leaves raw history intact, and survives restart", async () => {
    const raw = history()
    const original = structuredClone(raw)
    const config = options()
    const context = new ConversationContext(config)
    await context.update(raw)
    expect(await context.compact("manual")).toBe(true)
    expect(raw).toEqual(original)
    const projected = context.project().messages
    const callsBeforeRestore = config.summarize.mock.calls.length
    const restored = new ConversationContext(config, JSON.parse(JSON.stringify(context.state)))
    await restored.update([...raw, message("a3", "assistant"), message("u4", "user")])
    expect((await restored.prepare()).slice(0, projected.length)).toEqual(projected)
    expect(config.summarize).toHaveBeenCalledTimes(callsBeforeRestore)
  })

  it("includes the previous retained span when compacting again", async () => {
    const config = options()
    const context = new ConversationContext(config)
    const raw = history()
    await context.update(raw)
    await context.compact("manual")
    const first = context.project().compaction
    if (!first) {
      throw new Error("Expected a compaction checkpoint")
    }
    const callsBeforeSecond = config.summarize.mock.calls.length
    await context.update([
      ...raw,
      message("a3", "assistant", "More work. ".repeat(300)),
      message("u4", "user", "Next task. ".repeat(100)),
      message("a4", "assistant", "More results. ".repeat(100)),
      message("u5", "user")
    ])
    await context.compact("manual")
    expect(context.project().compaction?.previousId).toBe(first.id)
    const newCalls = config.summarize.mock.calls.slice(callsBeforeSecond)
    expect(newCalls[0][1]).toBe(first.summary)
    expect(newCalls.map(call => call[0]).join(" ")).toContain("Recent answer.")
  })

  it("invalidates summaries after their source history changes, but not after metadata updates", async () => {
    const context = new ConversationContext(options())
    const raw = history()
    await context.update(raw)
    await context.compact("manual")
    raw[0].metadata = { duration: 2 }
    await context.update(raw)
    expect(context.project().compaction).toBeDefined()
    raw[0].parts = [{ type: "text", text: "Edited request" }]
    await context.update(raw)
    expect(context.project().compaction).toBeUndefined()
  })

  it("does not commit failed or cancelled summaries", async () => {
    const config = options()
    config.summarize.mockRejectedValueOnce(new Error("Summary failed"))
    const context = new ConversationContext(config)
    await context.update(history())
    await expect(context.compact("manual")).rejects.toThrow("Summary failed")
    expect(context.state.events).toEqual([])
  })

  it("retains a whole tool call/result step when splitting a long turn", async () => {
    const config = options()
    config.keepRecentTokens = 5
    const context = new ConversationContext(config)
    const assistant: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-example",
          toolCallId: "old",
          state: "output-available",
          input: {},
          output: "large old result ".repeat(300)
        },
        { type: "step-start" },
        {
          type: "tool-example",
          toolCallId: "new",
          state: "output-available",
          input: {},
          output: "latest result"
        }
      ]
    }
    await context.update([message("u1", "user"), assistant])
    expect(await context.compact("manual")).toBe(true)
    const result = JSON.stringify(context.project().messages)
    expect(result).toContain('"toolCallId":"new"')
    expect(result).toContain("latest result")
    expect(result).not.toContain('"toolCallId":"old"')
  })

  it("does not discard pending approval chains or a single oversized user input", async () => {
    const context = new ConversationContext(options())
    await context.update([message("huge", "user", "x".repeat(40000))])
    await expect(context.prepare()).rejects.toThrow("CONTEXT_TOO_LARGE")
    expect(context.state.events).toEqual([])
  })

  it("appends dates only for new user turns and keeps historical values stable", () => {
    const first = [message("u1", "user")]
    const state = appendTemporalContext(
      first,
      emptyContextState(),
      new Date("2026-08-25T12:00:00Z")
    )
    expect(appendTemporalContext(first, state, new Date("2026-08-26T12:00:00Z"))).toEqual(state)
    const next = appendTemporalContext(
      [...first, message("a1", "assistant"), message("u2", "user")],
      state,
      new Date("2026-08-26T12:00:00Z")
    )
    expect(next.events).toHaveLength(2)
    expect(next.events[0]).toEqual(state.events[0])
  })

  it("does not assume a capacity for custom models", async () => {
    const context = new ConversationContext({ ...options(), contextWindow: null })
    await context.update(history())
    await context.prepare()
    expect(context.state.events).toEqual([])
    expect(context.usage().contextWindow).toBeNull()
  })
})
