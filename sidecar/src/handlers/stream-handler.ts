import { createUIMessageStreamResponse } from "ai"
import type { ContextState, ContextUsage } from "../../../shared/context"
import { emptyContextState } from "../../../shared/context"
import { ConversationContext } from "../context/engine"
import type { ConversationRunOptions } from "../context/runner"
import { acquireConversation, createConversationStream } from "../context/runner"
import { discoverSkillsSafely, filterDisabledSkills } from "../skills/catalog"
import { buildProviderOptions } from "../utils/provider-options"
import { buildSystemPrompt } from "../utils/system-prompt-builder"
import { loadWorkspacePromptContextSafely } from "../workspace"

export interface StreamHandlerOptions
  extends Omit<ConversationRunOptions, "instructions" | "chatId"> {
  chatId: string
  disabledSkillIds?: string[]
  channel?: string
}

type ContextInspectionOptions = Omit<StreamHandlerOptions, "model">

export function prepareConversationOptions(
  options: StreamHandlerOptions
): Promise<ConversationRunOptions>
export function prepareConversationOptions(
  options: ContextInspectionOptions
): Promise<ContextInspectionOptions & { instructions: string }>
export async function prepareConversationOptions(
  options: StreamHandlerOptions | ContextInspectionOptions
) {
  const [skills, workspaceContext] = await Promise.all([
    discoverSkillsSafely("conversation request"),
    loadWorkspacePromptContextSafely("conversation request")
  ])
  return {
    ...options,
    instructions: buildSystemPrompt({
      modelProvider: options.modelProvider,
      modelProviderLabel: options.modelProviderLabel,
      modelId: options.modelId,
      modelLabel: options.modelLabel,
      ...(options.channel ? { channel: options.channel } : {}),
      skills: filterDisabledSkills(skills, options.disabledSkillIds ?? []).sort((a, b) =>
        a.id.localeCompare(b.id)
      ),
      workspaceContext
    })
  }
}

/** Inspect the effective prompt without calling a model, compacting, or changing history. */
export async function estimateConversationUsage(
  options: ContextInspectionOptions
): Promise<ContextUsage> {
  const prepared = await prepareConversationOptions(options)
  options.abortSignal.throwIfAborted()
  const context = new ConversationContext(
    { ...prepared, requestOptions: buildProviderOptions(options) },
    { ...(options.contextState ?? emptyContextState()), usage: undefined }
  )
  await context.update(options.messages)
  options.abortSignal.throwIfAborted()
  return context.usage()
}

export async function createStreamResponse(options: StreamHandlerOptions) {
  return createUIMessageStreamResponse({
    stream: createConversationStream(await prepareConversationOptions(options))
  })
}

export async function compactConversation(
  options: StreamHandlerOptions,
  instructions?: string
): Promise<{ contextState: ContextState; compacted: boolean }> {
  const release = acquireConversation(options.chatId)
  try {
    const prepared = await prepareConversationOptions(options)
    const context = new ConversationContext(prepared, options.contextState ?? emptyContextState())
    await context.update(options.messages)
    const compacted = await context.compact("manual", instructions)
    context.state.usage = context.usage()
    return { contextState: context.state, compacted }
  } finally {
    release()
  }
}
