import { CircleIcon, Folder, Loader2Icon, MoreVertical, Pencil, Share, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  replyingChatIds,
  onChatClick,
  onDeleteChat,
  onRenameChat
}: {
  chats: Chat[]
  activeChatId?: ChatId | null
  unreadChatIds?: ReadonlySet<ChatId>
  replyingChatIds?: ReadonlySet<ChatId>
  onChatClick: (chatId: ChatId) => void
  onDeleteChat: (chatId: ChatId) => void
  onRenameChat: (chatId: ChatId, title: string) => Promise<void>
}) {
  const { t } = useTranslation("common")
  const now = Date.now()
  const [showAll, setShowAll] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<ChatId | null>(null)
  const [renamingChat, setRenamingChat] = useState<Chat | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  const visibleChats = showAll ? chats : chats.slice(0, 10)
  const canToggle = chats.length > 10
  const trimmedRenameTitle = renameTitle.trim()

  const handleStartRename = (chat: Chat) => {
    setRenamingChat(chat)
    setRenameTitle(chat.title)
  }

  const handleRenameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!renamingChat || isRenaming || !trimmedRenameTitle) {
      return
    }

    if (trimmedRenameTitle === renamingChat.title) {
      setRenamingChat(null)
      return
    }

    setIsRenaming(true)
    try {
      await onRenameChat(renamingChat.id, trimmedRenameTitle)
      setRenamingChat(null)
    } catch {
      // Parent owns user-facing error messaging so the dialog can stay open for retry.
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("nav.recentChats")}</SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {chats.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground/50 text-center">
            {t("nav.noChatsYet")}
          </div>
        )}
        {visibleChats.map(chat => {
          const isUnread = unreadChatIds?.has(chat.id) ?? false
          const isReplying = replyingChatIds?.has(chat.id) ?? false

          return (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton
                isActive={activeChatId === chat.id}
                onClick={() => onChatClick(chat.id)}
              >
                <span className="truncate">{chat.title}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge
                className="text-muted-foreground/60 transition-opacity group-hover/menu-item:opacity-0 group-focus-within/menu-item:opacity-0 data-[hidden=true]:opacity-0"
                data-hidden={openMenuId === chat.id}
              >
                {isReplying ? (
                  <>
                    <Loader2Icon aria-hidden className="size-3 animate-spin text-sidebar-primary" />
                    <span className="sr-only">{t("nav.replying")}</span>
                  </>
                ) : isUnread ? (
                  <>
                    <CircleIcon
                      aria-hidden
                      className="size-1.5 fill-current text-sidebar-primary"
                    />
                    <span className="sr-only">{t("nav.unread")}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground/60">
                    {formatCreatedAge(chat.created_at, now)}
                  </span>
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
                      handleStartRename(chat)
                    }}
                  >
                    <Pencil className="text-muted-foreground" />
                    <span>{t("menu.renameChat")}</span>
                  </DropdownMenuItem>
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
      <Dialog
        open={renamingChat !== null}
        onOpenChange={open => {
          if (!open && !isRenaming) {
            setRenamingChat(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("renameChat.title")}</DialogTitle>
            <DialogDescription>{t("renameChat.description")}</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleRenameSubmit}>
            <div className="space-y-2">
              <Label htmlFor="chat-title">{t("renameChat.label")}</Label>
              <Input
                id="chat-title"
                name="chat-title"
                value={renameTitle}
                placeholder={t("renameChat.placeholder")}
                aria-invalid={trimmedRenameTitle.length === 0}
                disabled={isRenaming}
                autoFocus
                onChange={event => setRenameTitle(event.target.value)}
              />
              {trimmedRenameTitle.length === 0 && (
                <p className="text-xs text-destructive">{t("renameChat.titleRequired")}</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenamingChat(null)}
                disabled={isRenaming}
              >
                {t("renameChat.cancel")}
              </Button>
              <Button type="submit" disabled={isRenaming || trimmedRenameTitle.length === 0}>
                {isRenaming ? t("renameChat.saving") : t("renameChat.save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
  )
}
