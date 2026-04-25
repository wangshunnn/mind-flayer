import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart, type UIMessage } from "ai"

type FetchFunction = typeof globalThis.fetch

type JsonObject = {
  [key: string]: unknown
}

interface ToolCallSnapshot {
  id: string
  name: string
  arguments: string
}

interface AssistantReplayBlock {
  text: string
  reasoning: string
  toolCalls: ToolCallSnapshot[]
}

type ReasoningReplayMap = Map<string, string[]>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringifyToolInput(input: unknown): string | undefined {
  const value = JSON.stringify(input)
  return typeof value === "string" ? value : undefined
}

function createSignature(block: Pick<AssistantReplayBlock, "text" | "toolCalls">): string {
  return JSON.stringify({
    text: block.text,
    toolCalls: block.toolCalls.map(toolCall => [toolCall.id, toolCall.name, toolCall.arguments])
  })
}

function appendReplayValue(map: ReasoningReplayMap, signature: string, reasoning: string) {
  const existing = map.get(signature)
  if (existing) {
    existing.push(reasoning)
    return
  }
  map.set(signature, [reasoning])
}

function hasReplayContent(block: AssistantReplayBlock): boolean {
  return block.text.length > 0 || block.reasoning.length > 0 || block.toolCalls.length > 0
}

function createEmptyBlock(): AssistantReplayBlock {
  return {
    text: "",
    reasoning: "",
    toolCalls: []
  }
}

function collectAssistantReplayBlocks(message: UIMessage): AssistantReplayBlock[] {
  const blocks: AssistantReplayBlock[] = []
  let currentBlock = createEmptyBlock()

  const pushCurrentBlock = () => {
    if (!hasReplayContent(currentBlock)) {
      return
    }
    blocks.push(currentBlock)
    currentBlock = createEmptyBlock()
  }

  for (const part of message.parts) {
    if (part.type === "step-start") {
      pushCurrentBlock()
      continue
    }

    if (isTextUIPart(part)) {
      currentBlock.text += part.text
      continue
    }

    if (isReasoningUIPart(part)) {
      currentBlock.reasoning += part.text
      continue
    }

    if (isToolUIPart(part)) {
      if (part.state === "input-streaming" || part.state === "input-available") {
        continue
      }

      const rawInput =
        part.state === "output-error" && part.input === undefined && "rawInput" in part
          ? part.rawInput
          : part.input
      const stringifiedInput = stringifyToolInput(rawInput)

      if (stringifiedInput === undefined) {
        continue
      }

      currentBlock.toolCalls.push({
        id: part.toolCallId,
        name: getToolName(part),
        arguments: stringifiedInput
      })
    }
  }

  pushCurrentBlock()
  return blocks
}

export function buildDeepSeekReasoningReplayMap(messages: UIMessage[]): ReasoningReplayMap {
  const replayMap: ReasoningReplayMap = new Map()

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue
    }

    const blocks = collectAssistantReplayBlocks(message)
    const turnUsedTools = blocks.some(block => block.toolCalls.length > 0)

    if (!turnUsedTools) {
      continue
    }

    for (const block of blocks) {
      if (!block.reasoning) {
        continue
      }
      appendReplayValue(replayMap, createSignature(block), block.reasoning)
    }
  }

  return replayMap
}

function isThinkingDisabled(body: JsonObject): boolean {
  const thinking = body.thinking
  return isRecord(thinking) && thinking.type === "disabled"
}

function getAssistantMessageSignature(message: JsonObject): string | undefined {
  if (message.role !== "assistant") {
    return undefined
  }

  const text = typeof message.content === "string" ? message.content : ""
  const rawToolCalls = message.tool_calls

  if (rawToolCalls !== undefined && !Array.isArray(rawToolCalls)) {
    return undefined
  }

  const toolCalls: ToolCallSnapshot[] = []

  for (const rawToolCall of rawToolCalls ?? []) {
    if (!isRecord(rawToolCall) || typeof rawToolCall.id !== "string") {
      return undefined
    }

    const rawFunction = rawToolCall.function
    if (!isRecord(rawFunction)) {
      return undefined
    }

    const name = rawFunction.name
    const args = rawFunction.arguments
    if (typeof name !== "string" || typeof args !== "string") {
      return undefined
    }

    toolCalls.push({
      id: rawToolCall.id,
      name,
      arguments: args
    })
  }

  return createSignature({ text, toolCalls })
}

function cloneReplayMap(map: ReasoningReplayMap): ReasoningReplayMap {
  return new Map([...map.entries()].map(([key, values]) => [key, values.slice()]))
}

export function patchDeepSeekReasoningRequestBody(
  bodyText: string,
  replayMap: ReasoningReplayMap
): string {
  if (replayMap.size === 0) {
    return bodyText
  }

  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    return bodyText
  }

  if (!isRecord(body) || !Array.isArray(body.messages) || isThinkingDisabled(body)) {
    return bodyText
  }

  const remainingReplayMap = cloneReplayMap(replayMap)
  let changed = false
  const messages = body.messages.map(rawMessage => {
    if (!isRecord(rawMessage)) {
      return rawMessage
    }

    if (
      typeof rawMessage.reasoning_content === "string" &&
      rawMessage.reasoning_content.length > 0
    ) {
      return rawMessage
    }

    const signature = getAssistantMessageSignature(rawMessage)
    if (signature === undefined) {
      return rawMessage
    }

    const replayValues = remainingReplayMap.get(signature)
    const reasoning = replayValues?.shift()
    if (!reasoning) {
      return rawMessage
    }

    changed = true
    return {
      ...rawMessage,
      reasoning_content: reasoning
    }
  })

  if (!changed) {
    return bodyText
  }

  return JSON.stringify({
    ...body,
    messages
  })
}

export function createDeepSeekReasoningReplayFetch(
  messages: UIMessage[],
  fetchImpl: FetchFunction = globalThis.fetch
): FetchFunction {
  const replayMap = buildDeepSeekReasoningReplayMap(messages)

  if (replayMap.size === 0) {
    return fetchImpl
  }

  return async (input, init) => {
    const body = init?.body

    if (typeof body !== "string") {
      return fetchImpl(input, init)
    }

    const patchedBody = patchDeepSeekReasoningRequestBody(body, replayMap)

    if (patchedBody === body) {
      return fetchImpl(input, init)
    }

    return fetchImpl(input, {
      ...init,
      body: patchedBody
    })
  }
}
