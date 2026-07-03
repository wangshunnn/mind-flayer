import type * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { NavChannelDebug } from "@/components/nav-channel-debug"
import { NavChats } from "@/components/nav-chats"
import { NavMain } from "@/components/nav-main"
import { NavSkills } from "@/components/nav-skills"
import { NavUser } from "@/components/nav-user"
import { SidebarUpdateIndicator } from "@/components/SidebarUpdateIndicator"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import { SearchChat } from "@/components/ui/sidebar-search"
import type { AppUpdateInfo, AppUpdaterStatus } from "@/lib/updater"
import type { Chat, ChatId } from "@/types/chat"

interface SidebarAppUpdate {
  availableUpdate: AppUpdateInfo | null
  status: AppUpdaterStatus
  onCheck: () => void | Promise<void>
  onInstall: () => void | Promise<void>
  onRestart: () => void | Promise<void>
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  chats: Chat[]
  onChatClick: (chatId: ChatId) => void
  onDeleteChat: (chatId: ChatId) => Promise<void>
  activeChatId?: ChatId | null
  unreadChatIds?: ReadonlySet<ChatId>
  replyingChatIds?: ReadonlySet<ChatId>
  onNewChat?: () => void
  isSkillsActive?: boolean
  onSkillsClick?: () => void
  onRenameChat: (chatId: ChatId, title: string) => Promise<void>
  isTelegramChannelEnabled?: boolean
  isTelegramDebugActive?: boolean
  onTelegramDebugClick?: () => void
  appUpdate?: SidebarAppUpdate | null
}

export function AppSidebar({
  chats,
  activeChatId,
  unreadChatIds,
  replyingChatIds,
  onChatClick,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  isSkillsActive = false,
  onSkillsClick,
  isTelegramChannelEnabled = false,
  isTelegramDebugActive = false,
  onTelegramDebugClick,
  appUpdate,
  ...props
}: AppSidebarProps) {
  const { t } = useTranslation("common")

  const handleDeleteChat = async (chatId: string) => {
    try {
      await onDeleteChat(chatId)
      toast.success(t("toast.chatDeleted"))
    } catch (error) {
      console.error("Failed to delete chat:", error)
      toast.error(t("toast.error"), { description: t("toast.failedToDeleteChat") })
    }
  }

  const handleRenameChat = async (chatId: string, title: string) => {
    try {
      await onRenameChat(chatId, title)
      toast.success(t("toast.chatRenamed"))
    } catch (error) {
      console.error("Failed to rename chat:", error)
      toast.error(t("toast.error"), { description: t("toast.failedToRenameChat") })
      throw error
    }
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SearchChat />
      </SidebarHeader>
      <SidebarContent>
        <div className="flex flex-col py-3">
          <NavMain onNewChat={onNewChat} />
          {onSkillsClick && <NavSkills isActive={isSkillsActive} onClick={onSkillsClick} />}
          {isTelegramChannelEnabled && onTelegramDebugClick && (
            <NavChannelDebug isActive={isTelegramDebugActive} onClick={onTelegramDebugClick} />
          )}
        </div>

        <NavChats
          chats={chats}
          activeChatId={activeChatId}
          unreadChatIds={unreadChatIds}
          replyingChatIds={replyingChatIds}
          onChatClick={onChatClick}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
        />
        {/* Draggable empty space below chat list */}
        <div data-tauri-drag-region className="flex-1 min-h-0" />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <NavUser />
          </div>
          {appUpdate && (
            <SidebarUpdateIndicator
              hasAvailableUpdate={Boolean(appUpdate.availableUpdate)}
              status={appUpdate.status}
              onCheck={appUpdate.onCheck}
              onInstall={appUpdate.onInstall}
              onRestart={appUpdate.onRestart}
            />
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
