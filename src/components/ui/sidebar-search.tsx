import { Search, X } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { SidebarGroup, SidebarGroupContent, SidebarInput } from "@/components/ui/sidebar"
import { useLocalShortcut } from "@/hooks/use-local-shortcut"
import { useShortcutDisplay } from "@/hooks/use-shortcut-config"
import { cn } from "@/lib/utils"
import { ShortcutAction } from "@/types/settings"

interface SearchChatProps {
  query: string
  onQueryChange: (value: string) => void
  totalCount: number
  filteredCount: number
}

export function SearchChat({ query, onQueryChange, totalCount, filteredCount }: SearchChatProps) {
  const { t } = useTranslation("common")
  const shortcutKeys = useShortcutDisplay(ShortcutAction.SEARCH_HISTORY)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchId = useId()
  const [isFocused, setIsFocused] = useState(false)

  useLocalShortcut(ShortcutAction.SEARCH_HISTORY, () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  })

  const hasQuery = query.trim().length > 0

  return (
    <SidebarGroup>
      <SidebarGroupContent className="space-y-1.5">
        <label htmlFor={searchId} className="sr-only">
          {t("sidebar.searchChat")}
        </label>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <SidebarInput
            ref={inputRef}
            id={searchId}
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={t("sidebar.searchPlaceholder")}
            className={cn(
              "h-8 pl-8 pr-16 bg-sidebar-search border-sidebar-search-border",
              "text-sidebar-search-foreground placeholder:text-sidebar-search-foreground/60"
            )}
          />
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
            {!isFocused && (
              <KbdGroup>
                {shortcutKeys.map(key => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </KbdGroup>
            )}
            {hasQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() => onQueryChange("")}
                aria-label={t("sidebar.clearSearch")}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        {isFocused && (
          <div className="px-0.5 text-[11px] text-muted-foreground/70 tabular-nums">
            {hasQuery
              ? t("sidebar.searchResultCount", { filtered: filteredCount, total: totalCount })
              : t("sidebar.chatCount", { count: totalCount })}
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
