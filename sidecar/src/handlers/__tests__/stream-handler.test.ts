import type { LanguageModelUsage, UIMessage } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { emptyContextState } from "../../../../shared/context"
import { ConversationContext } from "../../context/engine"
import { buildProviderOptions } from "../../utils/provider-options"
import {
  compactConversation,
  estimateConversationUsage,
  prepareConversationOptions
} from "../stream-handler"

const discover = vi.hoisted(() => vi.fn())
const workspace = vi.hoisted(() => vi.fn())
vi.mock("../../skills/catalog", async original => ({
  ...(await original<typeof import("../../skills/catalog")>()),
  discoverSkillsSafely: discover
}))
vi.mock("../../workspace", async original => ({
  ...(await original<typeof import("../../workspace")>()),
  loadWorkspacePromptContextSafely: workspace
}))

describe("conversation prompt preparation", () => {
  beforeEach(() => {
    discover.mockResolvedValue([])
    workspace.mockResolvedValue(undefined)
  })
  const options = () => ({
    chatId: "chat",
    model: new MockLanguageModelV4(),
    modelProvider: "openai",
    modelId: "gpt-5.4",
    messages: [],
    tools: {},
    toolChoice: "auto" as const,
    abortSignal: new AbortController().signal,
    reasoningEnabled: false,
    reasoningEffort: "default" as const
  })
  it("builds a stable prompt without a clock or calendar date", async () => {
    const first = await prepareConversationOptions(options())
    const second = await prepareConversationOptions(options())
    expect(first.instructions).toEqual(second.instructions)
    expect(first.instructions).not.toContain("current_date")
    expect(first.instructions).toContain("openai/gpt-5.4")
  })
  it("sorts enabled skills and excludes disabled skills", async () => {
    discover.mockResolvedValue([
      { id: "b", name: "B", description: "B skill", source: "user", location: "/b" },
      { id: "a", name: "A", description: "A skill", source: "user", location: "/a" }
    ])
    const result = await prepareConversationOptions({ ...options(), disabledSkillIds: ["b"] })
    expect(result.instructions).toContain('id="a"')
    expect(result.instructions).not.toContain('id="b"')
  })
  it("keeps channel-specific instructions", async () => {
    const result = await prepareConversationOptions({ ...options(), channel: "telegram" })
    expect(result.instructions).toContain("Attachments:")
    expect(result.instructions).toContain("channel: telegram")
  })

  const measuredConversation = async () => {
    const config = {
      ...options(),
      modelProvider: "deepseek",
      modelId: "deepseek-v4-pro",
      reasoningEnabled: true,
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
        { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hello" }] }
      ] as UIMessage[]
    }
    const prepared = await prepareConversationOptions(config)
    const context = new ConversationContext({
      ...prepared,
      requestOptions: buildProviderOptions(config)
    })
    await context.update(config.messages)
    const usage: LanguageModelUsage = {
      inputTokens: 6843,
      outputTokens: 54,
      totalTokens: 6897,
      inputTokenDetails: { noCacheTokens: 187, cacheReadTokens: 6656, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 15, reasoningTokens: 39 }
    }
    context.recordUsage(usage, 1, context.entries[1].models)
    config.messages[1].metadata = { contextUsage: structuredClone(context.state.usage) }
    return { config, prepared, context }
  }

  it("preserves measured usage when manual compaction has nothing to summarize", async () => {
    const { config, context } = await measuredConversation()
    const result = await compactConversation({ ...config, contextState: context.state })
    expect(result.compacted).toBe(false)
    expect(result.contextState.usage).toEqual(context.state.usage)
    expect(result.contextState.events).toEqual([])
    expect(config.model.doGenerateCalls).toHaveLength(0)
  })

  it("recovers a valid message measurement after an older manual inspection replaced it", async () => {
    const { config, prepared, context } = await measuredConversation()
    const stale = new ConversationContext(prepared, context.state)
    await stale.update(config.messages)
    const state = { ...context.state, usage: stale.usage() }
    expect(state.usage.baselineTokens).toBeUndefined()
    const result = await compactConversation({ ...config, contextState: state })
    expect(result.compacted).toBe(false)
    expect(result.contextState.usage).toEqual(context.state.usage)
    expect(config.model.doGenerateCalls).toHaveLength(0)
  })

  it("backfills composition without replacing a valid persisted measurement", async () => {
    const { config, context } = await measuredConversation()
    const state = structuredClone(context.state)
    if (!state.usage) {
      throw new Error("Expected measured context")
    }
    delete state.usage.breakdown
    delete config.messages[1].metadata
    const original = structuredClone(state)
    const result = await estimateConversationUsage({ ...config, contextState: state })
    expect(result).toMatchObject({ tokens: 6897, baselineTokens: 6897, source: "measured" })
    expect(result.breakdown).toEqual(context.state.usage?.breakdown)
    expect(state).toEqual(original)
    expect(config.model.doGenerateCalls).toHaveLength(0)
  })

  it.each([
    "reasoning",
    "model",
    "history"
  ])("does not recover an old measurement after %s changes", async change => {
    const { config, context } = await measuredConversation()
    if (change === "reasoning") {
      config.reasoningEnabled = false
    }
    if (change === "model") {
      config.modelId = "deepseek-v4-flash"
    }
    if (change === "history") {
      config.messages[0].parts = [{ type: "text", text: "Changed input" }]
    }
    const result = await compactConversation({
      ...config,
      contextState: context.state
    })
    expect(result.compacted).toBe(false)
    expect(result.contextState.usage?.source).toBe("estimated")
    expect(result.contextState.usage?.baselineTokens).toBeUndefined()
    if (change === "history") {
      expect(result.contextState.usage?.prefixHash).not.toBe(context.state.usage?.prefixHash)
    } else {
      expect(result.contextState.usage?.requestFingerprint).not.toBe(
        context.state.usage?.requestFingerprint
      )
    }
  })

  it("estimates legacy history locally, including system context, without using cumulative usage", async () => {
    const { model: _model, ...config } = options()
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Old response" }],
        metadata: { totalUsage: { inputTokens: 900000, totalTokens: 1000000 } }
      }
    ]
    const state = emptyContextState()
    const result = await estimateConversationUsage({ ...config, messages, contextState: state })
    expect(result.source).toBe("estimated")
    expect(result.tokens).toBeGreaterThan(20)
    expect(result.tokens).toBeLessThan(10000)
    expect(state).toEqual(emptyContextState())
    expect(result.contextWindow).toBe(1050000)
  })

  it("estimates the summary projection rather than all archived history", async () => {
    const { model: _model, ...config } = options()
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Old request ".repeat(2000) }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "Old output ".repeat(2000) }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "Continue" }] }
    ]
    const context = new ConversationContext({
      ...config,
      instructions: "System",
      keepRecentTokens: 2,
      summarize: async () => ({ text: "Goal: continue the work." })
    })
    await context.update(messages)
    await context.compact("manual")
    const state = structuredClone(context.state)
    const compacted = await estimateConversationUsage({ ...config, messages, contextState: state })
    const full = await estimateConversationUsage({ ...config, messages })
    expect(compacted.tokens).toBeLessThan(full.tokens / 2)
    expect(state).toEqual(context.state)
  })
})
