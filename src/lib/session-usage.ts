import type { ContextEvent } from "../../shared/context"
import {
  getMessageStepCount,
  getMessageUsageTokenBreakdown,
  hasCompleteCacheDetails,
  type MessageUsageMetadata,
  normalizeTokenCount,
  type UsageMessage
} from "../../shared/message-usage"

export type { UsageMessage } from "../../shared/message-usage"

interface SessionUsageRecord extends MessageUsageMetadata {
  role: "user" | "assistant"
  stepCount: number
}
export type SessionUsageRecords = ReadonlyMap<string, SessionUsageRecord>

export interface SessionUsageSummary {
  turns: number
  steps: number
  input: number
  output: number
  cacheRead: number | null
  cacheHitPercent: number | null
  cacheDetailsIncomplete: boolean
  hasUsage: boolean
}

/** Replace per-message snapshots; never add the same cumulative snapshot twice. */
export function mergeSessionUsage(
  records: SessionUsageRecords,
  messages: UsageMessage[]
): SessionUsageRecords {
  let next: Map<string, SessionUsageRecord> | undefined
  for (const message of messages) {
    if (message.role !== "assistant" && message.role !== "user") {
      continue
    }
    const metadata = (message.metadata ?? {}) as MessageUsageMetadata
    if (message.role === "assistant" && !metadata.totalUsage) {
      continue
    }
    const existing = (next ?? records).get(message.id)
    if (existing && (existing.lastStepAt ?? 0) > (metadata.lastStepAt ?? 0)) {
      continue
    }
    const snapshot: SessionUsageRecord = {
      role: message.role,
      stepCount: getMessageStepCount(message),
      totalUsage: metadata.totalUsage,
      lastStepUsage: metadata.lastStepUsage,
      lastStepAt: metadata.lastStepAt,
      cacheDetailsIncomplete: metadata.cacheDetailsIncomplete
    }
    if (JSON.stringify(existing) === JSON.stringify(snapshot)) {
      continue
    }
    next ??= new Map(records)
    next.set(message.id, structuredClone(snapshot))
  }
  return next ?? records
}

export function summarizeSessionUsage(
  records: SessionUsageRecords,
  events: ContextEvent[] = []
): SessionUsageSummary {
  const result: SessionUsageSummary = {
    turns: 0,
    steps: 0,
    input: 0,
    output: 0,
    cacheRead: null,
    cacheHitPercent: null,
    cacheDetailsIncomplete: false,
    hasUsage: false
  }
  let latest: MessageUsageMetadata | undefined
  const usages: MessageUsageMetadata[] = []
  for (const metadata of records.values()) {
    if (metadata.role === "user") {
      result.turns++
      continue
    }
    result.steps += metadata.stepCount
    usages.push(metadata)
    if (
      metadata.lastStepUsage &&
      metadata.lastStepAt !== undefined &&
      (!latest || metadata.lastStepAt >= (latest.lastStepAt ?? 0))
    ) {
      latest = metadata
    }
  }
  const seenEvents = new Set<string>()
  for (const event of events) {
    if (event.type !== "compaction" || !event.usage || seenEvents.has(event.id)) {
      continue
    }
    seenEvents.add(event.id)
    usages.push({ totalUsage: event.usage })
  }
  for (const metadata of usages) {
    const usage = metadata.totalUsage
    if (!usage) {
      continue
    }
    const tokens = getMessageUsageTokenBreakdown(usage)
    result.hasUsage ||= tokens.total > 0
    result.input += tokens.noCacheInput
    result.output += tokens.output
    const cacheRead = normalizeTokenCount(usage.inputTokenDetails?.cacheReadTokens)
    if (cacheRead !== undefined) {
      result.cacheRead = (result.cacheRead ?? 0) + cacheRead
    }
    result.cacheDetailsIncomplete ||=
      metadata.cacheDetailsIncomplete === true || !hasCompleteCacheDetails(usage)
  }
  if (latest?.lastStepUsage) {
    const usage = latest.lastStepUsage
    const input = getMessageUsageTokenBreakdown(usage).input
    const read = normalizeTokenCount(usage.inputTokenDetails?.cacheReadTokens)
    if (input > 0 && read !== undefined && read <= input) {
      result.cacheHitPercent = (read / input) * 100
    }
  }
  return result
}

export function formatCompactTokens(count: number): string {
  if (count < 1000) {
    return Math.round(count).toString()
  }
  if (count < 10000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  if (count < 1000000) {
    return `${Math.round(count / 1000)}k`
  }
  if (count < 10000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  return `${Math.round(count / 1000000)}M`
}
