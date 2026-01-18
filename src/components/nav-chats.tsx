import { Folder, MoreVertical, Share, Trash2 } from "lucide-react"
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
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"
import type { Chat, ChatId } from "@/types/chat"

export function NavChats({
  chats,
  activeChatId,
  onChatClick,
  onDeleteChat
}: {
  chats: Chat[]
  activeChatId?: ChatId | null
  onChatClick: (chatId: ChatId) => void
  onDeleteChat: (chatId: ChatId) => void
}) {
  const { t } = useTranslation("common")
  console.log("[NavChats] Rendering with chats:", chats)

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("nav.recentChats")}</SidebarGroupLabel>
      <SidebarMenu>
        {chats.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground/50 text-center">
            {t("nav.noChatsYet")}
          </div>
        )}
        {chats.map(chat => (
          <SidebarMenuItem key={chat.id}>
            <SidebarMenuButton
              isActive={activeChatId === chat.id}
              onClick={() => onChatClick(chat.id)}
            >
              <span className="truncate">{chat.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
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
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
