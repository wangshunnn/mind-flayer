import type { LanguageModelUsage, UIMessage } from "ai"
import { z } from "zod"

export const uiMessagesSchema = z
  .array(
    z
      .object({
        id: z.string().min(1),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.object({ type: z.string().min(1) }).passthrough()),
        metadata: z.object({}).passthrough().optional()
      })
      .passthrough()
  )
  .refine(
    messages => new Set(messages.map(message => message.id)).size === messages.length,
    "Message IDs must be unique"
  )
  .transform(messages => messages as UIMessage[])

const temporalEventSchema = z.object({
  type: z.literal("temporal"),
  id: z.string(),
  beforeMessageId: z.string(),
  date: z.string(),
  timeZone: z.string()
})

const compactionEventSchema = z.object({
  type: z.literal("compaction"),
  id: z.string(),
  previousId: z.string().optional(),
  createdAt: z.number(),
  summary: z.string().min(1),
  firstKeptEntryId: z.string(),
  prefixHash: z.string(),
  reason: z.enum(["threshold", "manual", "overflow"]),
  tokensBefore: z.number(),
  tokensAfter: z.number(),
  modelProvider: z.string(),
  modelId: z.string(),
  usage: z.custom<LanguageModelUsage>().optional()
})

export const contextUsageSchema = z.object({
  tokens: z.number().nonnegative(),
  baselineTokens: z.number().positive().optional(),
  modelProvider: z.string().optional(),
  modelId: z.string().optional(),
  contextWindow: z.number().positive().nullable(),
  source: z.enum(["measured", "estimated"]),
  /** Heuristic composition; independent of the provider-calibrated total. */
  breakdown: z
    .object({
      systemTokens: z.number().int().nonnegative(),
      toolsTokens: z.number().int().nonnegative(),
      messageTokens: z.number().int().nonnegative()
    })
    .optional(),
  prefixHash: z.string(),
  entryCount: z.number().int().nonnegative(),
  requestFingerprint: z.string(),
  compactionId: z.string().optional()
})

export const contextStateSchema = z.object({
  version: z.literal(1),
  events: z.array(z.discriminatedUnion("type", [temporalEventSchema, compactionEventSchema])),
  usage: contextUsageSchema.optional()
})

export type ContextState = z.infer<typeof contextStateSchema>
export type ContextUsage = z.infer<typeof contextUsageSchema>
export type CompactionEntry = z.infer<typeof compactionEventSchema>
export type ContextEvent = ContextState["events"][number]

export function emptyContextState(): ContextState {
  return { version: 1, events: [] }
}

/** A checkpoint follows the corresponding completed step in the UI stream. */
export interface ConversationCheckpoint {
  chatId: string
  contextState: ContextState
  messages: UIMessage[]
  messageIds: string[]
}
