import { randomUUID } from "node:crypto"
import type {
  FinishReason,
  LanguageModel,
  LanguageModelUsage,
  ToolChoice,
  ToolSet,
  UIMessage
} from "ai"
import { createUIMessageStream, isStepCount, isToolUIPart, streamText } from "ai"
import type { ContextState, ConversationCheckpoint } from "../../../shared/context"
import { emptyContextState } from "../../../shared/context"
import type { ReasoningEffort } from "../type"
import { buildProviderOptions } from "../utils/provider-options"
import { addUsage, appendTemporalContext, ConversationContext } from "./engine"

const activeConversations = new Set<string>()

export function acquireConversation(id: string): () => void {
  if (activeConversations.has(id)) {
    throw new Error("CONVERSATION_BUSY")
  }
  activeConversations.add(id)
  return () => activeConversations.delete(id)
}

export function isContextOverflow(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /context[_ ]length[_ ]exceeded|maximum context length|context window|prompt (?:is )?too long|too many (?:input )?tokens|input tokens exceed/i.test(
    text
  )
}

export interface ConversationRunOptions {
  chatId: string
  model: LanguageModel
  modelProvider: string
  modelId: string
  modelProviderLabel?: string
  modelLabel?: string
  instructions: string
  messages: UIMessage[]
  tools: ToolSet
  toolChoice: ToolChoice<ToolSet>
  contextState?: ContextState
  abortSignal: AbortSignal
  reasoningEnabled: boolean
  reasoningEffort: ReasoningEffort
  createModel?: (messages: UIMessage[]) => LanguageModel
  onCheckpoint?: (messages: UIMessage[], state: ContextState) => Promise<void>
}

/** Shared desktop/channel loop. Each SDK call executes at most one tool step. */
export function createConversationStream(options: ConversationRunOptions) {
  const release = acquireConversation(options.chatId)
  const cancellation = new AbortController()
  options = { ...options, abortSignal: AbortSignal.any([options.abortSignal, cancellation.signal]) }
  let rawMessages = structuredClone(options.messages)
  const previousAssistant = rawMessages.at(-1)
  const assistantId = previousAssistant?.role === "assistant" ? previousAssistant.id : randomUUID()
  const startedAt = Date.now()
  let firstTokenAt: number | undefined
  let lastTokenAt: number | undefined
  let totalUsage: LanguageModelUsage | undefined
  let finishReason: FinishReason = "stop"
  let context: ConversationContext | undefined
  let overflowRecovered = false
  const providerOptions = buildProviderOptions(options)
  const initialState = appendTemporalContext(
    rawMessages,
    options.contextState ?? emptyContextState()
  )
  const sentMessages = new Map<string, string>()

  const stream = createUIMessageStream({
    originalMessages: options.messages,
    generateId: () => assistantId,
    onError: error => (error instanceof Error ? error.message : "CONVERSATION_FAILED"),
    execute: async ({ writer }) => {
      const checkpoint = async () => {
        if (!context) {
          return
        }
        const state = structuredClone(context.state)
        await options.onCheckpoint?.(rawMessages, state)
        const changed = rawMessages.filter(
          message => sentMessages.get(message.id) !== JSON.stringify(message)
        )
        const data: ConversationCheckpoint = {
          chatId: options.chatId,
          messages: changed,
          messageIds: rawMessages.map(message => message.id),
          contextState: state
        }
        writer.write({ type: "data-context-checkpoint", data, transient: true })
        for (const message of changed) sentMessages.set(message.id, JSON.stringify(message))
      }
      try {
        context = new ConversationContext(
          {
            ...options,
            requestOptions: providerOptions,
            onStatus: status =>
              writer.write({
                type: "data-compaction-status",
                data: { chatId: options.chatId, status },
                transient: true
              })
          },
          initialState
        )
        await context.update(rawMessages)
        // Commit the new user input and date even if compaction or generation fails.
        await checkpoint()
        writer.write({
          type: "start",
          messageId: assistantId,
          messageMetadata: {
            createdAt: startedAt,
            modelProvider: options.modelProvider,
            modelId: options.modelId,
            modelProviderLabel: options.modelProviderLabel,
            modelLabel: options.modelLabel
          }
        })
        for (let step = 0; step < (Object.keys(options.tools).length ? 20 : 1); ) {
          options.abortSignal.throwIfAborted()
          const modelMessages = await context.prepare()
          await checkpoint()
          const inputCount = context.entries.length
          const beforeStep = rawMessages
          let stepError: unknown
          let emittedContent = false
          const replayMessages = context.project().kept.map(entry => entry.message)
          const result = streamText({
            model: options.createModel?.(replayMessages) ?? options.model,
            instructions: options.instructions,
            messages: modelMessages,
            tools: options.tools,
            toolChoice: step === 0 ? options.toolChoice : "auto",
            stopWhen: isStepCount(1),
            maxOutputTokens: context.window ? context.reserve : undefined,
            abortSignal: options.abortSignal,
            providerOptions,
            onError: ({ error }) => {
              stepError ??= error
            },
            onChunk: ({ chunk }) => {
              if (chunk.type === "source" || chunk.type === "raw") {
                return
              }
              const now = Date.now()
              firstTokenAt ??= now
              lastTokenAt = now
            }
          })
          const uiStream = result.toUIMessageStream({
            originalMessages: rawMessages,
            generateMessageId: () => assistantId,
            sendStart: false,
            sendFinish: false,
            sendSources: true,
            onError: error => (error instanceof Error ? error.message : "CONVERSATION_FAILED"),
            onEnd: ({ messages }) => {
              rawMessages = messages
            }
          })
          const reader = uiStream.getReader()
          try {
            for (;;) {
              const next = await reader.read()
              if (next.done) {
                break
              }
              if (next.value.type === "error") {
                stepError ??= new Error(next.value.errorText)
                continue
              }
              if (!["start-step", "finish-step", "abort"].includes(next.value.type)) {
                emittedContent = true
              }
              writer.write(next.value)
            }
          } finally {
            reader.releaseLock()
          }
          if (stepError) {
            if (!emittedContent && !overflowRecovered && isContextOverflow(stepError)) {
              overflowRecovered = true
              rawMessages = beforeStep
              await context.update(rawMessages)
              if (await context.compact("overflow")) {
                await checkpoint()
                continue
              }
            }
            await context.update(rawMessages)
            await checkpoint()
            throw stepError
          }
          options.abortSignal.throwIfAborted()
          const finalStep = await result.finalStep
          finishReason = finalStep.finishReason
          totalUsage = addUsage(totalUsage, finalStep.usage)
          await context.update(rawMessages)
          context.recordUsage(finalStep.usage.inputTokens, inputCount, finalStep.response.messages)
          const assistant = rawMessages.at(-1)
          if (assistant?.role === "assistant") {
            assistant.metadata = {
              ...(assistant.metadata ?? {}),
              isError: false,
              isAbort: false,
              isDisconnect: false,
              createdAt: startedAt,
              firstTokenAt,
              lastTokenAt,
              totalUsage,
              contextUsage: context.usage(),
              modelProvider: options.modelProvider,
              modelId: options.modelId,
              modelProviderLabel: options.modelProviderLabel,
              modelLabel: options.modelLabel
            }
            writer.write({ type: "message-metadata", messageMetadata: assistant.metadata })
          }
          await checkpoint()
          console.info("[context] Completed model step", {
            chatId: options.chatId,
            step,
            contextTokens: context.usage().tokens,
            contextWindow: context.window,
            compactionId: context.project().compaction?.id,
            cacheReadTokens: finalStep.usage.inputTokenDetails?.cacheReadTokens,
            cacheWriteTokens: finalStep.usage.inputTokenDetails?.cacheWriteTokens
          })
          step++
          const calls = finalStep.toolCalls.filter(call => !call.providerExecuted)
          const results = new Set(
            (assistant?.parts ?? [])
              .filter(isToolUIPart)
              .filter(part =>
                ["output-available", "output-error", "output-denied"].includes(part.state)
              )
              .map(part => part.toolCallId)
          )
          if (!calls.length || calls.some(call => !results.has(call.toolCallId))) {
            break
          }
        }
        writer.write({ type: "finish", finishReason })
      } catch (error) {
        const assistant = rawMessages.at(-1)
        if (assistant?.role === "assistant") {
          assistant.metadata = {
            ...(assistant.metadata ?? {}),
            isError: !options.abortSignal.aborted,
            isAbort: options.abortSignal.aborted,
            errorMessage: error instanceof Error ? error.message : String(error)
          }
          writer.write({ type: "message-metadata", messageMetadata: assistant.metadata })
        }
        if (context) {
          await context.update(rawMessages)
          await checkpoint()
        }
        if (options.abortSignal.aborted) {
          writer.write({ type: "abort" })
        } else {
          throw error
        }
      } finally {
        release()
      }
    }
  })
  const reader = stream.getReader()
  return new ReadableStream({
    async pull(controller) {
      const result = await reader.read()
      if (result.done) {
        controller.close()
      } else {
        controller.enqueue(result.value)
      }
    },
    async cancel(reason) {
      cancellation.abort(reason)
      await reader.cancel(reason)
    }
  })
}
