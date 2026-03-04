const UNORDERED_LIST_ITEM_REGEX = /^(\s*)[-*+]\s+/
const MARKDOWN_BLOCKQUOTE_REGEX = /^\s*>\s?(.*)$/
const ATX_HEADING_REGEX = /^(\s{0,3})#{1,6}(?:[ \t]+|$)(.*)$/
const TRAILING_HEADING_MARKER_REGEX = /[ \t]+#+[ \t]*$/
const FENCED_CODE_BLOCK_REGEX = /```([^\n`]*)\n?([\s\S]*?)```/g
const INLINE_CODE_REGEX = /`([^`\n]+)`/g
const HTML_HEADING_REGEX = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
const HTML_TAG_REGEX = /<[^>]*>/g
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g
const STRONG_ASTERISK_REGEX = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g
const STRONG_UNDERSCORE_REGEX = /__(?=\S)(.+?)(?<=\S)__/g
const UNDERLINE_PLUS_REGEX = /\+\+(?=\S)(.+?)(?<=\S)\+\+/g
const STRIKETHROUGH_REGEX = /~~(?=\S)(.+?)(?<=\S)~~/g
const EMPHASIS_ASTERISK_REGEX = /(^|[^*])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g
const EMPHASIS_UNDERSCORE_REGEX = /(^|[^_])_(?=\S)(.+?)(?<=\S)_(?!_)/g
const SPOILER_REGEX = /\|\|(?=\S)(.+?)(?<=\S)\|\|/g
const MARKDOWN_LINK_TITLE_SEPARATOR_REGEX = /\s+"/
const HTTP_URL_REGEX = /^https?:\/\//i
const FENCED_CODE_LANGUAGE_REGEX = /^[\w#+.-]+$/

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;")
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
}

function normalizeFenceCode(code: string): string {
  return code.replace(/^\n/, "").replace(/\n$/, "")
}

function normalizeFenceLanguage(language: string): string | null {
  const token = language.trim().split(/\s+/)[0] ?? ""
  if (!token || !FENCED_CODE_LANGUAGE_REGEX.test(token)) {
    return null
  }

  return token
}

function replaceUnorderedListMarker(line: string): string {
  return line.replace(UNORDERED_LIST_ITEM_REGEX, "$1• ")
}

function normalizeHeadingText(rawHeadingText: string): string {
  return rawHeadingText.replace(TRAILING_HEADING_MARKER_REGEX, "").trim()
}

function wrapBoldPlaceholder(
  value: string,
  createPlaceholder: (content: string) => string
): string {
  return createPlaceholder(`<b>${escapeHtml(value)}</b>`)
}

function replaceMarkdownAtxHeadings(
  value: string,
  createPlaceholder: (content: string) => string
): string {
  return value
    .split("\n")
    .map(line => {
      const match = line.match(ATX_HEADING_REGEX)
      if (!match) {
        return line
      }

      const headingText = normalizeHeadingText(String(match[2] ?? ""))
      return wrapBoldPlaceholder(headingText, createPlaceholder)
    })
    .join("\n")
}

function replaceHtmlHeadings(
  value: string,
  createPlaceholder: (content: string) => string
): string {
  return value.replace(HTML_HEADING_REGEX, (_match, _level, innerText) => {
    const headingText = unescapeHtml(String(innerText ?? ""))
      .replace(HTML_TAG_REGEX, "")
      .trim()
    return wrapBoldPlaceholder(headingText, createPlaceholder)
  })
}

function replaceMarkdownBlockquotes(
  value: string,
  createPlaceholder: (content: string) => string
): string {
  const lines = value.split("\n")
  const transformed: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line?.match(MARKDOWN_BLOCKQUOTE_REGEX)

    if (!match) {
      transformed.push(line ?? "")
      continue
    }

    const quoteLines = [String(match[1] ?? "")]

    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1]
      const nextMatch = nextLine?.match(MARKDOWN_BLOCKQUOTE_REGEX)
      if (!nextMatch) {
        break
      }

      quoteLines.push(String(nextMatch[1] ?? ""))
      index += 1
    }

    transformed.push(
      createPlaceholder(`<blockquote>${escapeHtml(quoteLines.join("\n"))}</blockquote>`)
    )
  }

  return transformed.join("\n")
}

function unwrapMarkdownLinkTarget(rawTarget: string): string {
  let next = rawTarget.trim()

  if (next.startsWith("<") && next.endsWith(">")) {
    next = next.slice(1, -1).trim()
  }

  const titleSeparator = next.search(MARKDOWN_LINK_TITLE_SEPARATOR_REGEX)
  if (titleSeparator >= 0) {
    next = next.slice(0, titleSeparator)
  }

  return next
}

export function toTelegramHtml(markdown: string): string {
  if (!markdown) {
    return ""
  }

  const normalizedText = markdown.replace(/\r\n/g, "\n")
  const listNormalizedText = normalizedText
    .split("\n")
    .map(line => replaceUnorderedListMarker(line))
    .join("\n")

  const placeholders = new Map<string, string>()
  let placeholderIndex = 0
  const createPlaceholder = (content: string) => {
    const key = `@@TGPH${placeholderIndex}@@`
    placeholderIndex += 1
    placeholders.set(key, content)
    return key
  }

  const withCodeBlocks = listNormalizedText.replace(
    FENCED_CODE_BLOCK_REGEX,
    (_match, rawLanguage, code) => {
      const escapedCode = escapeHtml(normalizeFenceCode(String(code ?? "")))
      const language = normalizeFenceLanguage(String(rawLanguage ?? ""))
      const classAttribute = language ? ` class="language-${language}"` : ""
      return createPlaceholder(`<pre><code${classAttribute}>${escapedCode}</code></pre>`)
    }
  )

  const withInlineCode = withCodeBlocks.replace(INLINE_CODE_REGEX, (_match, inlineCode) => {
    return createPlaceholder(`<code>${escapeHtml(String(inlineCode ?? ""))}</code>`)
  })

  const withHeadingPlaceholders = replaceMarkdownAtxHeadings(
    replaceHtmlHeadings(withInlineCode, createPlaceholder),
    createPlaceholder
  )
  const withBlockquotePlaceholders = replaceMarkdownBlockquotes(
    withHeadingPlaceholders,
    createPlaceholder
  )

  const escapedText = escapeHtml(withBlockquotePlaceholders)
  const withStrong = escapedText
    .replace(STRONG_ASTERISK_REGEX, "<b>$1</b>")
    .replace(STRONG_UNDERSCORE_REGEX, "<b>$1</b>")
    .replace(UNDERLINE_PLUS_REGEX, "<u>$1</u>")
    .replace(STRIKETHROUGH_REGEX, "<s>$1</s>")

  const withEmphasis = withStrong
    .replace(EMPHASIS_ASTERISK_REGEX, "$1<i>$2</i>")
    .replace(EMPHASIS_UNDERSCORE_REGEX, "$1<i>$2</i>")
    .replace(SPOILER_REGEX, "<tg-spoiler>$1</tg-spoiler>")

  const withLinks = withEmphasis.replace(LINK_REGEX, (match, label, rawTarget) => {
    const target = unescapeHtml(unwrapMarkdownLinkTarget(String(rawTarget ?? "")))
    if (!HTTP_URL_REGEX.test(target)) {
      return match
    }

    return `<a href="${escapeHtmlAttribute(target)}">${label}</a>`
  })

  let restored = withLinks
  for (const [placeholder, content] of placeholders.entries()) {
    restored = restored.replaceAll(placeholder, content)
  }

  return restored
}
