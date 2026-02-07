import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import type { ChatSearchResult } from "@/types/chat"

interface ChatHistorySearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectResult: (payload: { chatId: string; messageId: string }) => void
  searchHistoryMessages: (
    keyword: string,
    options?: { limit?: number }
  ) => Promise<ChatSearchResult[]>
}

const SEARCH_DEBOUNCE_MS = 120

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function HighlightedSnippet({ text, keyword }: { text: string; keyword: string }) {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) {
    return <span>{text}</span>
  }

  const pattern = new RegExp(`(${escapeRegExp(normalizedKeyword)})`, "ig")
  const parts = text.split(pattern)
  const normalizedKeywordLower = normalizedKeyword.toLocaleLowerCase()
  let cursor = 0

  return (
    <span>
      {parts.map(part => {
        const key = `${cursor}-${part}`
        cursor += part.length
        return part.toLocaleLowerCase() === normalizedKeywordLower ? (
          <mark key={key} className="bg-primary/20 text-foreground rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={key}>{part}</span>
        )
      })}
    </span>
  )
}

export function ChatHistorySearchDialog({
  open,
  onOpenChange,
  onSelectResult,
  searchHistoryMessages
}: ChatHistorySearchDialogProps) {
  const { t, i18n } = useTranslation("common")

  const [keyword, setKeyword] = useState("")
  const [results, setResults] = useState<ChatSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const requestCounterRef = useRef(0)

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
    [i18n.language]
  )

  useEffect(() => {
    if (open) {
      return
    }
    setKeyword("")
    setResults([])
    setIsLoading(false)
    setErrorText(null)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const trimmedKeyword = keyword.trim()
    if (!trimmedKeyword) {
      setResults([])
      setErrorText(null)
      setIsLoading(false)
      return
    }

    const currentRequest = requestCounterRef.current + 1
    requestCounterRef.current = currentRequest
    setIsLoading(true)

    const timer = window.setTimeout(async () => {
      try {
        const nextResults = await searchHistoryMessages(trimmedKeyword)
        if (requestCounterRef.current !== currentRequest) {
          return
        }
        setResults(nextResults)
        setErrorText(null)
      } catch (error) {
        if (requestCounterRef.current !== currentRequest) {
          return
        }
        console.error("[SearchHistory] Failed to search history:", error)
        setErrorText(t("sidebar.searchDialog.error"))
        setResults([])
      } finally {
        if (requestCounterRef.current === currentRequest) {
          setIsLoading(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [keyword, open, searchHistoryMessages, t])

  const roleText = (role: ChatSearchResult["role"]) => {
    if (role === "assistant") {
      return t("sidebar.searchDialog.roleAssistant")
    }
    return t("sidebar.searchDialog.roleUser")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>{t("sidebar.searchDialog.title")}</DialogTitle>
          <DialogDescription>{t("sidebar.searchDialog.description")}</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("sidebar.searchDialog.placeholder")}
            value={keyword}
            onValueChange={setKeyword}
          />
          <CommandList className="max-h-96">
            {!keyword.trim() && (
              <CommandEmpty>{t("sidebar.searchDialog.emptyKeyword")}</CommandEmpty>
            )}
            {isLoading && <CommandEmpty>{t("sidebar.searchDialog.loading")}</CommandEmpty>}
            {errorText && !isLoading && <CommandEmpty>{errorText}</CommandEmpty>}
            {!isLoading && !errorText && keyword.trim() && results.length === 0 && (
              <CommandEmpty>{t("sidebar.searchDialog.noResults")}</CommandEmpty>
            )}
            {!isLoading && !errorText && results.length > 0 && (
              <CommandGroup
                heading={t("sidebar.searchDialog.resultCount", { count: results.length })}
              >
                {results.map(result => (
                  <CommandItem
                    key={result.messageId}
                    value={`${result.messageId}-${result.chatTitle}-${result.fullText}`}
                    onSelect={() =>
                      onSelectResult({
                        chatId: result.chatId,
                        messageId: result.messageId
                      })
                    }
                    className="items-start py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-sm">{result.chatTitle}</span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {dateTimeFormatter.format(new Date(result.createdAt))}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">{roleText(result.role)}</p>
                      <p className="line-clamp-2 text-sm">
                        <HighlightedSnippet text={result.snippet} keyword={keyword} />
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
