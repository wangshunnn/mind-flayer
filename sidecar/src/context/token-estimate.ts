import type { ModelMessage } from "ai"

export const TOKEN_ESTIMATION_VERSION = "pi-chars-4-v1"
const ESTIMATED_IMAGE_CHARS = 4800
// Pi has no generic file equivalent; retain the existing opaque-file fallback.
const ESTIMATED_FILE_CHARS = 4096 * 4

type MessagePart = Exclude<ModelMessage["content"], string>[number]
type ToolOutput = Extract<MessagePart, { type: "tool-result" }>["output"]
type ToolContentPart = Extract<ToolOutput, { type: "content" }>["value"][number]

function toolOutputChars(output: ToolOutput): number {
  switch (output.type) {
    case "text":
    case "error-text":
      return output.value.length
    case "json":
    case "error-json":
      return JSON.stringify(output.value).length
    case "execution-denied":
      return output.reason?.length ?? 0
    case "content":
      return contentChars(output.value)
  }
}

function contentChars(parts: Array<MessagePart | ToolContentPart>): number {
  let chars = 0
  for (const part of parts) {
    switch (part.type) {
      case "text":
      case "reasoning":
        chars += part.text.length
        break
      case "tool-call":
        chars += part.toolName.length + (JSON.stringify(part.input)?.length ?? 0)
        break
      case "tool-result":
        chars += toolOutputChars(part.output)
        break
      default: {
        const mediaType = "mediaType" in part ? part.mediaType : undefined
        if (
          part.type === "image" ||
          part.type.startsWith("image-") ||
          mediaType === "image" ||
          mediaType?.startsWith("image/")
        ) {
          chars += ESTIMATED_IMAGE_CHARS
        } else if (
          part.type === "file" &&
          typeof part.data === "object" &&
          part.data !== null &&
          "type" in part.data &&
          part.data.type === "text"
        ) {
          chars += part.data.text.length
        } else if (part.type === "reasoning-file" || /^(file|audio|video)(-|$)/.test(part.type)) {
          chars += ESTIMATED_FILE_CHARS
        }
      }
    }
  }
  return chars
}

/** Pi-style chars/4 heuristic, rounded per message. Not a model-specific tokenizer. */
export function estimateTokens(value: string | ModelMessage[]): number {
  if (typeof value === "string") {
    return Math.ceil(value.length / 4)
  }
  return value.reduce((tokens, message) => {
    const chars =
      typeof message.content === "string" ? message.content.length : contentChars(message.content)
    return tokens + Math.ceil(chars / 4)
  }, 0)
}
