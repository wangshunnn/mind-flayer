type TextPart = {
  type?: unknown
  text?: unknown
}

type StoredMessagePayload = {
  parts?: unknown
}

/**
 * Extract plain text from stored message content_json.
 */
export function extractPlainTextFromContentJson(contentJson: string): string {
  try {
    const payload = JSON.parse(contentJson) as StoredMessagePayload
    if (!Array.isArray(payload.parts)) {
      return ""
    }

    const textParts = payload.parts
      .filter(
        (part): part is TextPart =>
          typeof part === "object" &&
          part !== null &&
          (part as TextPart).type === "text" &&
          typeof (part as TextPart).text === "string"
      )
      .map(part => part.text as string)

    return textParts.join(" ").replace(/\s+/g, " ").trim()
  } catch {
    return ""
  }
}

/**
 * Normalize text for case-insensitive keyword matching.
 */
export function normalizeForSearch(text: string): string {
  return text.trim().toLocaleLowerCase()
}

/**
 * Build a short snippet around the first keyword hit.
 */
export function buildSnippet(fullText: string, keyword: string, contextRadius = 36): string {
  const normalizedText = normalizeForSearch(fullText)
  const normalizedKeyword = normalizeForSearch(keyword)

  if (!normalizedText) {
    return ""
  }

  if (!normalizedKeyword) {
    return fullText.slice(0, 80)
  }

  const matchIndex = normalizedText.indexOf(normalizedKeyword)
  if (matchIndex === -1) {
    return fullText.length <= 80 ? fullText : `${fullText.slice(0, 77)}...`
  }

  const start = Math.max(0, matchIndex - contextRadius)
  const end = Math.min(fullText.length, matchIndex + keyword.length + contextRadius)
  const prefix = start > 0 ? "..." : ""
  const suffix = end < fullText.length ? "..." : ""
  return `${prefix}${fullText.slice(start, end)}${suffix}`
}
