import { Folder, MoreVertical, Share, Trash2 } from "lucide-react"
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
import type { Chat } from "@/types/chat"

export function NavChats({
  chats,
  activeChat,
  onChatClick,
  onDeleteChat
}: {
  chats: Chat[]
  activeChat?: Chat | null
  onChatClick: (chat: Chat) => void
  onDeleteChat: (chatId: string) => void
}) {
  console.log("[NavChats] Rendering with chats:", chats)

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chat</SidebarGroupLabel>
      <SidebarMenu>
        {chats.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground text-center">
            No chats yet. Start a conversation!
          </div>
        )}
        {chats.map(chat => (
          <SidebarMenuItem key={chat.id}>
            <SidebarMenuButton
              isActive={activeChat?.id === chat.id}
              onClick={() => onChatClick(chat)}
            >
              <span className="truncate">{chat.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover>
                  <MoreVertical />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44" side="bottom" align="start">
                <DropdownMenuItem disabled>
                  <Folder className="text-muted-foreground" />
                  <span>View Project</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Share className="text-muted-foreground" />
                  <span>Share Project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation()
                    onDeleteChat(chat.id)
                  }}
                >
                  <Trash2 className="text-muted-foreground" />
                  <span>Delete Chat</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
