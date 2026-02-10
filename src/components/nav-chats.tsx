import { CircleIcon, Folder, MoreVertical, Share, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"
import type { Chat, ChatId } from "@/types/chat"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

const formatCreatedAge = (createdAt: number, now: number) => {
  const elapsedMs = Math.max(0, now - createdAt)

  if (elapsedMs < DAY_MS) {
    const hours = Math.max(1, Math.floor(elapsedMs / HOUR_MS))
    return `${hours}h`
  }

  if (elapsedMs < WEEK_MS) {
    const days = Math.max(1, Math.floor(elapsedMs / DAY_MS))
    return `${days}d`
  }

  if (elapsedMs < MONTH_MS) {
    const weeks = Math.max(1, Math.floor(elapsedMs / WEEK_MS))
    return `${weeks}w`
  }

  if (elapsedMs < YEAR_MS) {
    const months = Math.max(1, Math.floor(elapsedMs / MONTH_MS))
    return `${months}m`
  }

  const years = Math.max(1, Math.floor(elapsedMs / YEAR_MS))
  return `${years}y`
}

export function NavChats({
  chats,
  activeChatId,
  unreadChatIds,
  onChatClick,
  onDeleteChat
}: {
  chats: Chat[]
  activeChatId?: ChatId | null
  unreadChatIds?: ReadonlySet<ChatId>
  onChatClick: (chatId: ChatId) => void
  onDeleteChat: (chatId: ChatId) => void
}) {
  const { t } = useTranslation("common")
  const now = Date.now()
  const [showAll, setShowAll] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<ChatId | null>(null)
  const visibleChats = showAll ? chats : chats.slice(0, 10)
  const canToggle = chats.length > 10

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("nav.recentChats")}</SidebarGroupLabel>
      <SidebarMenu>
        {chats.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground/50 text-center">
            {t("nav.noChatsYet")}
          </div>
        )}
        {visibleChats.map(chat => {
          const isUnread = unreadChatIds?.has(chat.id) ?? false

          return (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton
                isActive={activeChatId === chat.id}
                onClick={() => onChatClick(chat.id)}
              >
                <span className="truncate">{chat.title}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge
                className="text-muted-foreground/60 group-hover/menu-item:opacity-0 data-[hidden=true]:opacity-0"
                data-hidden={openMenuId === chat.id}
              >
                {isUnread ? (
                  <>
                    <CircleIcon aria-hidden className="size-1.5 fill-current text-brand-green" />
                    <span className="sr-only">{t("nav.unread")}</span>
                  </>
                ) : (
                  formatCreatedAge(chat.created_at, now)
                )}
              </SidebarMenuBadge>
              <DropdownMenu onOpenChange={open => setOpenMenuId(open ? chat.id : null)}>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <MoreVertical />
                    <span className="sr-only">{t("nav.more")}</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-44" side="bottom" align="start">
                  <DropdownMenuItem disabled>
                    <Folder className="text-muted-foreground" />
                    <span>{t("menu.viewProject")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <Share className="text-muted-foreground" />
                    <span>{t("menu.shareProject")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={e => {
                      e.stopPropagation()
                      onDeleteChat(chat.id)
                    }}
                  >
                    <Trash2 className="text-muted-foreground" />
                    <span>{t("menu.deleteChat")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )
        })}
        {canToggle && (
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setShowAll(current => !current)}>
              <SidebarMenuBadge className="truncate text-muted-foreground/60 left-1 justify-between">
                {showAll ? t("nav.showLess") : t("nav.showMore")}
              </SidebarMenuBadge>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
