import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { AppChat } from "@/components/app-chat"
import { AppSidebar } from "@/components/app-sidebar"
import { ChannelTelegramChat } from "@/components/channel-telegram-chat"
import { NewChatTrigger } from "@/components/nav-top"
import { SkillsPane } from "@/components/skills-pane"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useAvailableModels } from "@/hooks/use-available-models"
import { useChatStorage } from "@/hooks/use-chat-storage"
import { useLocalShortcut } from "@/hooks/use-local-shortcut"
import { useSetting } from "@/hooks/use-settings-store"
import {
  decideTelegramWhitelistRequest,
  getTelegramWhitelistRequests,
  syncRuntimeConfig,
  type TelegramWhitelistRequest
} from "@/lib/sidecar-client"
import { cn } from "@/lib/utils"
import { openSettingsWindow, SettingsSection } from "@/lib/window-manager"
import type { ChatId } from "@/types/chat"
import { ShortcutAction } from "@/types/settings"

// Handle open settings shortcut (Cmd+,)
const handleOpenSettings = () => {
  openSettingsWindow(SettingsSection.GENERAL)
}

const TELEGRAM_WHITELIST_POLL_INTERVAL_MS = 2000
const createNewChatToken = () => globalThis.crypto.randomUUID()
type ActivePane = "desktop-chat" | "skills" | "telegram-debug"

export default function Page() {
  const { t } = useTranslation("common")
  const {
    chats,
    activeChatId,
    switchChat,
    deleteChat,
    createChat,
    loadMessages,
    saveChatAllMessages,
    updateChatTitle
  } = useChatStorage()
  const { availableModels } = useAvailableModels()
  const [newChatToken, setNewChatToken] = useState(createNewChatToken)
  const [activePane, setActivePane] = useState<ActivePane>("desktop-chat")
  const [unreadChatIds, setUnreadChatIds] = useState<Set<ChatId>>(new Set())
  const [replyingChatIds, setReplyingChatIds] = useState<Set<ChatId>>(new Set())
  const [selectedModelApiId] = useSetting("selectedModelApiId")
  const [enabledChannels] = useSetting("enabledChannels")
  const [telegramAllowedUserIds, setTelegramAllowedUserIds] = useSetting("telegramAllowedUserIds")
  const [disabledSkills, setDisabledSkills] = useSetting("disabledSkills")
  const [whitelistRequests, setWhitelistRequests] = useState<TelegramWhitelistRequest[]>([])
  const [isDecidingWhitelistRequest, setIsDecidingWhitelistRequest] = useState(false)
  const sidebarActiveChatId = activePane === "desktop-chat" ? activeChatId : null
  const draftStoreRef = useRef<Map<string, string>>(new Map())
  const activePaneRef = useRef<ActivePane>(activePane)
  const activeChatIdRef = useRef(activeChatId)
  const newChatTokenRef = useRef(newChatToken)
  const telegramAllowedUserIdsRef = useRef(telegramAllowedUserIds)
  const selectedModel =
    availableModels.find(model => model.api_id === selectedModelApiId) ?? availableModels[0] ?? null
  const selectedModelProvider = selectedModel?.provider ?? null
  const selectedModelId = selectedModel?.api_id ?? null

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    newChatTokenRef.current = newChatToken
  }, [newChatToken])

  useEffect(() => {
    telegramAllowedUserIdsRef.current = telegramAllowedUserIds
  }, [telegramAllowedUserIds])

  useEffect(() => {
    activePaneRef.current = activePane
  }, [activePane])

  useEffect(() => {
    let cancelled = false

    const pushRuntimeConfig = async () => {
      try {
        await syncRuntimeConfig({
          selectedModel:
            selectedModelProvider && selectedModelId
              ? {
                  provider: selectedModelProvider,
                  modelId: selectedModelId
                }
              : null,
          channels: {
            telegram: {
              enabled: enabledChannels.telegram ?? false,
              allowedUserIds: telegramAllowedUserIds
            }
          },
          disabledSkills
        })
      } catch (error) {
        if (!cancelled) {
          console.warn("[Home] Failed to sync runtime config:", error)
        }
      }
    }

    void pushRuntimeConfig()

    return () => {
      cancelled = true
    }
  }, [
    disabledSkills,
    enabledChannels.telegram,
    selectedModelId,
    selectedModelProvider,
    telegramAllowedUserIds
  ])

  const handleNewChat = useCallback(() => {
    setActivePane("desktop-chat")
    switchChat(null)
    setNewChatToken(createNewChatToken())
  }, [switchChat])

  const handleChatClick = useCallback(
    (chatId: ChatId) => {
      setActivePane("desktop-chat")
      setUnreadChatIds(prev => {
        if (!prev.has(chatId)) {
          return prev
        }
        const next = new Set(prev)
        next.delete(chatId)
        return next
      })
      switchChat(chatId)
    },
    [switchChat]
  )

  const handleOpenTelegramDebug = useCallback(() => {
    setActivePane("telegram-debug")
  }, [])

  const handleOpenSkills = useCallback(() => {
    setActivePane("skills")
  }, [])

  const isDesktopChatPaneActive = useCallback(() => {
    return activePaneRef.current === "desktop-chat"
  }, [])

  const handleChatUnread = useCallback((chatId: ChatId) => {
    setUnreadChatIds(prev => {
      if (prev.has(chatId)) {
        return prev
      }
      const next = new Set(prev)
      next.add(chatId)
      return next
    })
  }, [])

  const handleChatReplyingChange = useCallback((chatId: ChatId, isReplying: boolean) => {
    setReplyingChatIds(prev => {
      const hasChat = prev.has(chatId)
      if (isReplying) {
        if (hasChat) {
          return prev
        }
        const next = new Set(prev)
        next.add(chatId)
        return next
      }

      if (!hasChat) {
        return prev
      }
      const next = new Set(prev)
      next.delete(chatId)
      return next
    })
  }, [])

  const handleRequestActivateChat = useCallback(
    (chatId: ChatId, tokenAtSend: string) => {
      if (activeChatIdRef.current === null && newChatTokenRef.current === tokenAtSend) {
        switchChat(chatId)
      }
    },
    [switchChat]
  )

  useEffect(() => {
    if (!activeChatId || activePane !== "desktop-chat") {
      return
    }
    setUnreadChatIds(prev => {
      if (!prev.has(activeChatId)) {
        return prev
      }
      const next = new Set(prev)
      next.delete(activeChatId)
      return next
    })
  }, [activeChatId, activePane])

  useEffect(() => {
    if ((enabledChannels.telegram ?? false) || activePane !== "telegram-debug") {
      return
    }

    setActivePane("desktop-chat")
  }, [activePane, enabledChannels.telegram])

  useEffect(() => {
    const chatIds = new Set(chats.map(chat => chat.id))
    setUnreadChatIds(prev => {
      let changed = false
      const next = new Set<ChatId>()
      for (const chatId of prev) {
        if (chatIds.has(chatId)) {
          next.add(chatId)
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
    setReplyingChatIds(prev => {
      let changed = false
      const next = new Set<ChatId>()
      for (const chatId of prev) {
        if (chatIds.has(chatId)) {
          next.add(chatId)
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [chats])

  useEffect(() => {
    if (!(enabledChannels.telegram ?? false)) {
      setWhitelistRequests([])
      return
    }

    let cancelled = false
    let timer: number | null = null

    const refreshWhitelistRequests = async () => {
      try {
        const requests = await getTelegramWhitelistRequests()
        if (!cancelled) {
          setWhitelistRequests(requests)
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[Home] Failed to poll Telegram whitelist requests:", error)
        }
      }
    }

    void refreshWhitelistRequests()
    timer = window.setInterval(() => {
      void refreshWhitelistRequests()
    }, TELEGRAM_WHITELIST_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearInterval(timer)
      }
    }
  }, [enabledChannels.telegram])

  // Handle search history shortcut (Cmd+F)
  const handleSearchHistory = useCallback(() => {
    // TODO: Implement search history functionality
    // For now, show a toast notification
    toast.info("Coming soon")
  }, [])

  // Register local shortcuts
  useLocalShortcut(ShortcutAction.NEW_CHAT, handleNewChat)
  useLocalShortcut(ShortcutAction.OPEN_SETTINGS, handleOpenSettings)
  useLocalShortcut(ShortcutAction.SEARCH_HISTORY, handleSearchHistory)

  const currentWhitelistRequest = whitelistRequests[0] ?? null

  const handleWhitelistDecision = useCallback(
    async (decision: "approve" | "reject") => {
      if (!currentWhitelistRequest || isDecidingWhitelistRequest) {
        return
      }

      setIsDecidingWhitelistRequest(true)

      try {
        await decideTelegramWhitelistRequest(currentWhitelistRequest.requestId, decision)

        if (decision === "approve") {
          const latestAllowed = telegramAllowedUserIdsRef.current
          if (!latestAllowed.includes(currentWhitelistRequest.userId)) {
            await setTelegramAllowedUserIds([...latestAllowed, currentWhitelistRequest.userId])
          }
        }

        const requests = await getTelegramWhitelistRequests()
        setWhitelistRequests(requests)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to handle whitelist request")
      } finally {
        setIsDecidingWhitelistRequest(false)
      }
    },
    [currentWhitelistRequest, isDecidingWhitelistRequest, setTelegramAllowedUserIds]
  )

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      {/* Left sidebar */}
      <AppSidebar
        chats={chats}
        activeChatId={sidebarActiveChatId}
        unreadChatIds={unreadChatIds}
        replyingChatIds={replyingChatIds}
        onChatClick={handleChatClick}
        onDeleteChat={deleteChat}
        onNewChat={handleNewChat}
        isSkillsActive={activePane === "skills"}
        onSkillsClick={handleOpenSkills}
        isTelegramChannelEnabled={enabledChannels.telegram ?? false}
        isTelegramDebugActive={activePane === "telegram-debug"}
        onTelegramDebugClick={handleOpenTelegramDebug}
      />

      {/* Top drag region */}
      <div data-tauri-drag-region className="z-50 h-12 fixed top-0 left-0 right-0"></div>

      {/* Top buttons */}
      <div
        data-tauri-drag-region
        className={cn(
          "z-50 h-12 fixed left-24 pt-1.5",
          "flex items-center justify-center gap-2",
          "pointer-events-auto"
        )}
      >
        <SidebarTrigger />
        <NewChatTrigger onClick={handleNewChat} />
      </div>

      {/* Main content area */}
      <SidebarInset className="overflow-hidden">
        {activePane === "telegram-debug" ? (
          <ChannelTelegramChat />
        ) : activePane === "skills" ? (
          <SkillsPane disabledSkillIds={disabledSkills} setDisabledSkillIds={setDisabledSkills} />
        ) : (
          <AppChat
            activeChatId={activeChatId}
            chats={chats}
            newChatToken={newChatToken}
            createChat={createChat}
            loadMessages={loadMessages}
            saveChatAllMessages={saveChatAllMessages}
            updateChatTitle={updateChatTitle}
            draftStore={draftStoreRef.current}
            isDesktopChatPaneActive={isDesktopChatPaneActive}
            onRequestActivateChat={handleRequestActivateChat}
            onChatUnread={handleChatUnread}
            onChatReplyingChange={handleChatReplyingChange}
          />
        )}
      </SidebarInset>

      <Dialog open={Boolean(currentWhitelistRequest)}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("telegramWhitelist.title")}</DialogTitle>
            <DialogDescription>{t("telegramWhitelist.description")}</DialogDescription>
          </DialogHeader>

          {currentWhitelistRequest && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{t("telegramWhitelist.userId")}:</span>{" "}
                {currentWhitelistRequest.userId}
              </p>
              <p>
                <span className="font-medium">{t("telegramWhitelist.chatId")}:</span>{" "}
                {currentWhitelistRequest.chatId}
              </p>
              {currentWhitelistRequest.username && (
                <p>
                  <span className="font-medium">Username:</span> @{currentWhitelistRequest.username}
                </p>
              )}
              {currentWhitelistRequest.firstName && (
                <p>
                  <span className="font-medium">Name:</span> {currentWhitelistRequest.firstName}
                  {currentWhitelistRequest.lastName ? ` ${currentWhitelistRequest.lastName}` : ""}
                </p>
              )}
              <p>
                <span className="font-medium">{t("telegramWhitelist.preview")}:</span>{" "}
                {currentWhitelistRequest.lastMessagePreview || "-"}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={isDecidingWhitelistRequest}
              onClick={() => void handleWhitelistDecision("reject")}
            >
              {t("telegramWhitelist.reject")}
            </Button>
            <Button
              disabled={isDecidingWhitelistRequest}
              onClick={() => void handleWhitelistDecision("approve")}
            >
              {t("telegramWhitelist.approve")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
