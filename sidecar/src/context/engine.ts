import { createHash, randomUUID } from "node:crypto"
import { asSchema } from "@ai-sdk/provider-utils"
import type { LanguageModel, LanguageModelUsage, ModelMessage, ToolSet, UIMessage } from "ai"
import { convertToModelMessages, generateText, isToolUIPart } from "ai"
import type { CompactionEntry, ContextState, ContextUsage } from "../../../shared/context"
import { contextUsageSchema, emptyContextState } from "../../../shared/context"
import { getMessageUsageTokenBreakdown } from "../../../shared/message-usage"
import { getModelContextWindow } from "../../../shared/model-context"
import { buildProviderOptions } from "../utils/provider-options"
import {
  buildSummarizationPrompt,
  formatCompactionSummary,
  SUMMARIZATION_SYSTEM_PROMPT
} from "./prompts"
import { estimateTokens, TOKEN_ESTIMATION_VERSION } from "./token-estimate"

export { estimateTokens } from "./token-estimate"

export function addUsage(
  a: LanguageModelUsage | undefined,
  b: LanguageModelUsage
): LanguageModelUsage {
  if (!a) {
    return b
  }
  const sum = (x?: number, y?: number) =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0)
  return {
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens: sum(a.outputTokens, b.outputTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens),
    inputTokenDetails: {
      noCacheTokens: sum(a.inputTokenDetails?.noCacheTokens, b.inputTokenDetails?.noCacheTokens),
      cacheReadTokens: sum(
        a.inputTokenDetails?.cacheReadTokens,
        b.inputTokenDetails?.cacheReadTokens
      ),
      cacheWriteTokens: sum(
        a.inputTokenDetails?.cacheWriteTokens,
        b.inputTokenDetails?.cacheWriteTokens
      )
    },
    outputTokenDetails: {
      textTokens: sum(a.outputTokenDetails?.textTokens, b.outputTokenDetails?.textTokens),
      reasoningTokens: sum(
        a.outputTokenDetails?.reasoningTokens,
        b.outputTokenDetails?.reasoningTokens
      )
    }
  }
}

export interface ContextEntry {
  id: string
  message: UIMessage
  models: ModelMessage[]
  pending: boolean
}

export interface ContextOptions {
  model?: LanguageModel
  modelProvider: string
  modelId: string
  instructions: string
  tools: ToolSet
  abortSignal?: AbortSignal
  requestOptions?: unknown
  contextWindow?: number | null
  keepRecentTokens?: number
  reserveTokens?: number
  summarize?: (
    text: string,
    previous: string | undefined
  ) => Promise<{ text: string; usage?: CompactionEntry["usage"] }>
  onStatus?: (status: "compacting" | "compacted" | "failed") => void
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export async function createContextEntries(
  messages: UIMessage[],
  tools: ToolSet
): Promise<ContextEntry[]> {
  const entries: ContextEntry[] = []
  const activeAssistant = messages.at(-1)?.role === "assistant" ? messages.at(-1)?.id : undefined
  for (const message of messages) {
    const chunks: UIMessage["parts"][] = []
    let parts: UIMessage["parts"] = []
    for (const part of message.parts) {
      if (part.type === "step-start" && parts.length) {
        chunks.push(parts)
        parts = []
      }
      if (part.type !== "step-start" && !part.type.startsWith("data-")) {
        parts.push(part)
      }
    }
    if (parts.length) {
      chunks.push(parts)
    }
    for (const [index, chunk] of chunks.entries()) {
      const slice = { ...message, parts: chunk }
      entries.push({
        id: `${message.id}:${index}`,
        message: slice,
        models: await convertToModelMessages([slice], { tools, ignoreIncompleteToolCalls: true }),
        pending:
          message.id === activeAssistant &&
          chunk.some(
            part =>
              isToolUIPart(part) &&
              !["output-available", "output-error", "output-denied"].includes(part.state)
          )
      })
    }
  }
  return entries
}

/** Keep media references, not opaque payload bytes, in standalone summary prompts. */
export function serializeConversation(messages: ModelMessage[]): string {
  return JSON.stringify(messages, (_key, value: unknown) => {
    if (!value || typeof value !== "object") {
      return value
    }
    const part = value as Record<string, unknown>
    if (typeof part.type === "string" && /^(image|file)(-|$)/.test(part.type)) {
      const reference = part.image ?? part.data ?? part.url
      return {
        type: part.type,
        mediaType: part.mediaType,
        filename: part.filename,
        reference:
          typeof reference === "string" &&
          !reference.startsWith("data:") &&
          /^(https?:|file:|\/)/.test(reference)
            ? reference
            : "[Embedded attachment retained in original history]"
      }
    }
    return value
  })
}

function entryHash(entries: ContextEntry[]): string {
  return fingerprint(entries.map(entry => [entry.id, entry.models]))
}

function summaryMessage(summary: string): ModelMessage {
  return {
    role: "user",
    content: formatCompactionSummary(summary)
  }
}

export function projectContext(entries: ContextEntry[], state: ContextState) {
  let compaction: CompactionEntry | undefined
  let start = 0
  for (const event of state.events) {
    if (event.type !== "compaction") {
      continue
    }
    const index = entries.findIndex(entry => entry.id === event.firstKeptEntryId)
    if (index > 0 && entryHash(entries.slice(0, index)) === event.prefixHash) {
      compaction = event
      start = index
    }
  }
  const kept = entries.slice(start)
  const messages: ModelMessage[] = compaction ? [summaryMessage(compaction.summary)] : []
  const previousDate = [...state.events]
    .reverse()
    .find(
      event =>
        event.type === "temporal" &&
        entries.slice(0, start).some(entry => entry.message.id === event.beforeMessageId)
    )
  if (previousDate?.type === "temporal") {
    messages.push({
      role: "user",
      content: `<runtime_context>Current date: ${previousDate.date}. Time zone: ${previousDate.timeZone}.</runtime_context>`
    })
  }
  for (const entry of kept) {
    if (entry.id.endsWith(":0")) {
      for (const event of state.events) {
        if (event.type === "temporal" && event.beforeMessageId === entry.message.id) {
          messages.push({
            role: "user",
            content: `<runtime_context>Current date: ${event.date}. Time zone: ${event.timeZone}.</runtime_context>`
          })
        }
      }
    }
    messages.push(...entry.models)
  }
  return { messages, kept, start, compaction }
}

export function appendTemporalContext(
  messages: UIMessage[],
  state: ContextState,
  now = new Date()
): ContextState {
  const lastUser = messages.findLast(message => message.role === "user")
  if (!lastUser) {
    return state
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now)
  const ids = new Set(messages.map(message => message.id))
  const previous = state.events.findLast(
    event => event.type === "temporal" && ids.has(event.beforeMessageId)
  )
  if (previous?.type === "temporal" && previous.date === date && previous.timeZone === timeZone) {
    return state
  }
  // Do not insert a new date before an already-sent user message during a continuation.
  if (
    state.events.some(event => event.type === "temporal" && event.beforeMessageId === lastUser.id)
  ) {
    return state
  }
  return {
    ...state,
    events: [
      ...state.events,
      { type: "temporal", id: randomUUID(), beforeMessageId: lastUser.id, date, timeZone }
    ]
  }
}

export class ConversationContext {
  state: ContextState
  entries: ContextEntry[] = []
  readonly window: number | null
  readonly reserve: number
  readonly keep: number
  requestFingerprint: string
  private readonly systemTokens: number
  private toolSchemaTokens = 0
  private projectedTokenEstimate?: {
    entries: ContextEntry[]
    events: ContextState["events"]
    tokens: number
  }
  private initialized = false

  constructor(
    readonly options: ContextOptions,
    state: ContextState = emptyContextState()
  ) {
    this.state = structuredClone(state)
    this.systemTokens = estimateTokens(options.instructions)
    this.window =
      options.contextWindow === undefined
        ? getModelContextWindow(options.modelProvider, options.modelId)
        : options.contextWindow
    this.reserve = Math.min(
      options.reserveTokens ?? 16384,
      this.window ? Math.floor(this.window / 4) : 16384
    )
    this.keep = Math.min(
      options.keepRecentTokens ?? 20000,
      this.window ? Math.floor(this.window / 3) : 20000
    )
    this.requestFingerprint = fingerprint([
      options.modelProvider,
      options.modelId,
      options.instructions,
      Object.keys(options.tools).sort(),
      options.requestOptions,
      TOKEN_ESTIMATION_VERSION
    ])
  }

  async update(messages: UIMessage[]): Promise<void> {
    if (!this.initialized) {
      const schemas = await Promise.all(
        Object.entries(this.options.tools)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(async ([name, tool]) => [
            name,
            tool.description,
            await asSchema(tool.inputSchema).jsonSchema
          ])
      )
      this.toolSchemaTokens = schemas.length ? estimateTokens(JSON.stringify(schemas)) : 0
      this.requestFingerprint = fingerprint([
        this.requestFingerprint,
        schemas,
        this.state.events.filter(
          event =>
            event.type === "temporal" &&
            messages.some(message => message.id === event.beforeMessageId)
        )
      ])
      this.initialized = true
    }
    this.entries = await createContextEntries(messages, this.options.tools)
  }

  project() {
    return projectContext(this.entries, this.state)
  }

  private overhead(): number {
    return this.systemTokens + this.toolSchemaTokens
  }

  private estimateProjectedTokens(messages: ModelMessage[]): number {
    // Usage is read multiple times per checkpoint; reprice only changed context.
    if (
      this.projectedTokenEstimate?.entries !== this.entries ||
      this.projectedTokenEstimate.events !== this.state.events
    ) {
      this.projectedTokenEstimate = {
        entries: this.entries,
        events: this.state.events,
        tokens: estimateTokens(messages)
      }
    }
    return this.projectedTokenEstimate.tokens
  }

  usage(): ContextUsage {
    const projection = this.project()
    const messageTokens = this.estimateProjectedTokens(projection.messages)
    const isValid = (usage: ContextUsage | undefined): usage is ContextUsage =>
      Boolean(
        usage &&
          usage.requestFingerprint === this.requestFingerprint &&
          usage.compactionId === projection.compaction?.id &&
          usage.entryCount <= this.entries.length &&
          usage.prefixHash === entryHash(this.entries.slice(0, usage.entryCount))
      )
    let previous = this.state.usage
    if (!isValid(previous) || previous.baselineTokens === undefined) {
      // An older inspection may have replaced the checkpoint, while the response
      // still carries its valid measurement. Never restore it across a changed prompt.
      for (let index = this.entries.length - 1; index >= 0; index--) {
        const message = this.entries[index].message
        if (message.role !== "assistant") {
          continue
        }
        const metadata = message.metadata as { contextUsage?: unknown } | undefined
        const candidate = contextUsageSchema.safeParse(metadata?.contextUsage)
        if (
          candidate.success &&
          candidate.data.baselineTokens !== undefined &&
          isValid(candidate.data)
        ) {
          previous = candidate.data
          break
        }
      }
    }
    const checkpoint = isValid(previous) ? previous : undefined
    const tokens = checkpoint
      ? checkpoint.tokens +
        estimateTokens(this.entries.slice(checkpoint.entryCount).flatMap(entry => entry.models))
      : this.overhead() + messageTokens
    return {
      tokens,
      breakdown: {
        systemTokens: this.systemTokens,
        toolsTokens: this.toolSchemaTokens,
        messageTokens
      },
      baselineTokens: checkpoint?.baselineTokens,
      modelProvider: this.options.modelProvider,
      modelId: this.options.modelId,
      contextWindow: this.window,
      source:
        checkpoint && checkpoint.entryCount === this.entries.length
          ? checkpoint.source
          : "estimated",
      prefixHash: entryHash(this.entries),
      entryCount: this.entries.length,
      requestFingerprint: this.requestFingerprint,
      compactionId: projection.compaction?.id
    }
  }

  recordUsage(
    usage: LanguageModelUsage,
    inputEntryCount: number,
    response: ModelMessage[],
    finishReason?: string
  ): boolean {
    const baselineTokens = getMessageUsageTokenBreakdown(usage).total
    if (finishReason === "error" || baselineTokens <= 0 || inputEntryCount > this.entries.length) {
      return false
    }
    // The API total includes the assistant output, but not subsequent local tool results.
    const trailingTokens = estimateTokens(response.filter(message => message.role === "tool"))
    this.state.usage = {
      ...this.usage(),
      tokens: baselineTokens + trailingTokens,
      baselineTokens,
      source: trailingTokens > 0 ? "estimated" : "measured",
      entryCount: this.entries.length,
      prefixHash: entryHash(this.entries)
    }
    return true
  }

  async prepare(
    reason?: CompactionEntry["reason"],
    instructions?: string
  ): Promise<ModelMessage[]> {
    const usage = this.usage()
    if (reason || (this.window && usage.tokens > this.window - this.reserve)) {
      await this.compact(reason ?? "threshold", instructions)
    }
    const next = this.usage()
    if (this.window && next.tokens > this.window - this.reserve) {
      throw new Error(
        "CONTEXT_TOO_LARGE: The retained conversation or latest input cannot fit the model context."
      )
    }
    this.state.usage = next
    return this.project().messages
  }

  async compact(reason: CompactionEntry["reason"], instructions?: string): Promise<boolean> {
    const projection = this.project()
    let index = this.entries.length
    let tokens = 0
    while (index > projection.start && tokens < this.keep) {
      index--
      tokens += estimateTokens(this.entries[index].models)
    }
    // Prefer a recent user boundary; otherwise retain a whole assistant/tool step.
    const userIndex = this.entries.findLastIndex(
      (entry, i) => i <= index && i >= projection.start && entry.message.role === "user"
    )
    if (
      userIndex > projection.start &&
      estimateTokens(this.entries.slice(userIndex).flatMap(entry => entry.models)) <=
        this.keep * 1.5
    ) {
      index = userIndex
    }
    const pendingIndex = this.entries.findIndex(
      (entry, i) => i >= projection.start && entry.pending
    )
    if (pendingIndex >= 0) {
      index = Math.min(index, pendingIndex)
    }
    // The current user input itself must remain verbatim until an assistant step exists.
    const lastUser = this.entries.findLastIndex(entry => entry.message.role === "user")
    if (lastUser === this.entries.length - 1) {
      index = Math.min(index, lastUser)
    }
    if (index <= projection.start || index >= this.entries.length) {
      return false
    }

    const tokensBefore = this.usage().tokens
    this.options.onStatus?.("compacting")
    try {
      const history = this.entries.slice(projection.start, index).flatMap(entry => entry.models)
      const serialized = serializeConversation(history)
      const summaryLimit = Math.min(4096, Math.max(128, Math.floor(this.reserve / 2)))
      const budget = Math.max(256, (this.window ?? 32000) - summaryLimit * 2 - 2048)
      // Most compactions fit one standalone request. Only oversized histories need batching.
      const chunkChars =
        estimateTokens(serialized) <= budget
          ? serialized.length
          : Math.max(128, Math.floor(budget / 2))
      let summary = projection.compaction?.summary
      let usage: CompactionEntry["usage"]
      for (let offset = 0; offset < serialized.length; offset += chunkChars) {
        this.options.abortSignal?.throwIfAborted()
        const input = serialized.slice(offset, offset + chunkChars)
        const result = this.options.summarize
          ? await this.options.summarize(input, summary)
          : await this.summarize(input, summary, instructions)
        if (!result.text.trim()) {
          throw new Error("COMPACTION_FAILED: Empty summary")
        }
        summary = result.text.trim()
        if (result.usage) {
          usage = addUsage(usage, result.usage)
        }
      }
      if (!summary) {
        return false
      }
      const event: CompactionEntry = {
        type: "compaction",
        id: randomUUID(),
        previousId: projection.compaction?.id,
        createdAt: Date.now(),
        summary,
        firstKeptEntryId: this.entries[index].id,
        prefixHash: entryHash(this.entries.slice(0, index)),
        reason,
        tokensBefore,
        tokensAfter: 0,
        modelProvider: this.options.modelProvider,
        modelId: this.options.modelId,
        usage
      }
      const nextState = { ...this.state, events: [...this.state.events, event], usage: undefined }
      event.tokensAfter =
        this.overhead() + estimateTokens(projectContext(this.entries, nextState).messages)
      if (
        event.tokensAfter >= tokensBefore ||
        (this.window && event.tokensAfter > this.window - this.reserve)
      ) {
        throw new Error("COMPACTION_FAILED: Summary did not free enough context")
      }
      this.options.abortSignal?.throwIfAborted()
      this.state = nextState
      this.options.onStatus?.("compacted")
      return true
    } catch (error) {
      this.options.onStatus?.("failed")
      if (
        this.options.abortSignal?.aborted ||
        (error instanceof Error && error.message.startsWith("COMPACTION_FAILED"))
      ) {
        throw error
      }
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`COMPACTION_FAILED: ${detail}`, { cause: error })
    }
  }

  private async summarize(text: string, previous?: string, focus?: string) {
    if (!this.options.model) {
      throw new Error("A model is required to generate a summary")
    }
    const providerOptions = buildProviderOptions({
      modelProvider: this.options.modelProvider,
      modelId: this.options.modelId,
      reasoningEnabled: false,
      reasoningEffort: "default"
    })
    // Standalone summaries should not write to the main conversation's cache policy.
    if (providerOptions?.anthropic) {
      delete providerOptions.anthropic.cacheControl
    }
    const result = await generateText({
      model: this.options.model,
      providerOptions,
      instructions: SUMMARIZATION_SYSTEM_PROMPT,
      prompt: buildSummarizationPrompt(text, previous, focus),
      maxOutputTokens: Math.min(4096, Math.max(128, Math.floor(this.reserve / 2))),
      abortSignal: this.options.abortSignal,
      maxRetries: 1
    })
    if (result.finishReason !== "stop") {
      throw new Error("COMPACTION_FAILED: Summary was interrupted or truncated")
    }
    return { text: result.text, usage: result.usage }
  }
}
