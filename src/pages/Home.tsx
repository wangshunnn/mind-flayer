import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { AppChat } from "@/components/app-chat"
import { AppSidebar } from "@/components/app-sidebar"
import { AppUpdaterOwner } from "@/components/app-updater-owner"
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
import { useAppUpdater } from "@/hooks/use-app-updater"
import { useAvailableModels } from "@/hooks/use-available-models"
import { useChatStorage } from "@/hooks/use-chat-storage"
import { useLocalShortcut } from "@/hooks/use-local-shortcut"
import { useSettingWithLoaded } from "@/hooks/use-settings-store"
import {
  decideTelegramWhitelistRequest,
  getTelegramWhitelistRequests,
  type RuntimeConfigPayload,
  syncRuntimeConfig,
  type TelegramWhitelistRequest
} from "@/lib/sidecar-client"
import { toErrorMessage } from "@/lib/updater"
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

interface RuntimeConfigSettingsSnapshot {
  selectedModelApiId?: string
  enabledChannels: Record<string, boolean>
  telegramAllowedUserIds: string[]
  disabledSkills: string[]
}

function createRuntimeConfigSettingsSnapshot(
  selectedModelApiId: string | undefined,
  enabledChannels: Record<string, boolean>,
  telegramAllowedUserIds: string[],
  disabledSkills: string[]
): RuntimeConfigSettingsSnapshot {
  return {
    selectedModelApiId,
    enabledChannels: { ...enabledChannels },
    telegramAllowedUserIds: [...telegramAllowedUserIds],
    disabledSkills: [...disabledSkills]
  }
}

function createRuntimeConfigPayload(
  settingsSnapshot: RuntimeConfigSettingsSnapshot,
  selectedModelProvider: string | null,
  selectedModelProviderLabel: string | null,
  selectedModelId: string | null,
  selectedModelLabel: string | null
): RuntimeConfigPayload {
  return {
    selectedModel:
      selectedModelProvider && selectedModelId
        ? {
            provider: selectedModelProvider,
            ...(selectedModelProviderLabel ? { providerLabel: selectedModelProviderLabel } : {}),
            modelId: selectedModelId,
            ...(selectedModelLabel ? { modelLabel: selectedModelLabel } : {})
          }
        : null,
    channels: {
      telegram: {
        enabled: settingsSnapshot.enabledChannels.telegram ?? false,
        allowedUserIds: settingsSnapshot.telegramAllowedUserIds
      }
    },
    disabledSkills: settingsSnapshot.disabledSkills
  }
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function booleanRecordEqual(
  left: Record<string, boolean>,
  right: Record<string, boolean>
): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()

  if (!arraysEqual(leftKeys, rightKeys)) {
    return false
  }

  return leftKeys.every(key => left[key] === right[key])
}

function runtimeConfigSettingsEqual(
  left: RuntimeConfigSettingsSnapshot,
  right: RuntimeConfigSettingsSnapshot
): boolean {
  return (
    left.selectedModelApiId === right.selectedModelApiId &&
    booleanRecordEqual(left.enabledChannels, right.enabledChannels) &&
    arraysEqual(left.telegramAllowedUserIds, right.telegramAllowedUserIds) &&
    arraysEqual(left.disabledSkills, right.disabledSkills)
  )
}

export default function Page() {
  const { t } = useTranslation(["common", "settings"])
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
  const [selectedModelApiId, setSelectedModelApiId, isSelectedModelApiIdLoaded] =
    useSettingWithLoaded("selectedModelApiId")
  const [enabledChannels, setEnabledChannels, areEnabledChannelsLoaded] =
    useSettingWithLoaded("enabledChannels")
  const [telegramAllowedUserIds, setTelegramAllowedUserIds, areTelegramAllowedUserIdsLoaded] =
    useSettingWithLoaded("telegramAllowedUserIds")
  const [disabledSkills, setDisabledSkills, areDisabledSkillsLoaded] =
    useSettingWithLoaded("disabledSkills")
  const [whitelistRequests, setWhitelistRequests] = useState<TelegramWhitelistRequest[]>([])
  const [isDecidingWhitelistRequest, setIsDecidingWhitelistRequest] = useState(false)
  const sidebarActiveChatId = activePane === "desktop-chat" ? activeChatId : null
  const draftStoreRef = useRef<Map<string, string>>(new Map())
  const activePaneRef = useRef<ActivePane>(activePane)
  const activeChatIdRef = useRef(activeChatId)
  const newChatTokenRef = useRef(newChatToken)
  const telegramAllowedUserIdsRef = useRef(telegramAllowedUserIds)
  const runtimeConfigSyncQueueRef = useRef<Promise<void>>(Promise.resolve())
  const latestRuntimeConfigSyncIdRef = useRef(0)
  const lastAppliedRuntimeConfigRef = useRef<RuntimeConfigSettingsSnapshot | null>(null)
  const { installUpdate, relaunchApp, status: appUpdaterStatus } = useAppUpdater()
  const selectedModel =
    availableModels.find(model => model.api_id === selectedModelApiId) ?? availableModels[0] ?? null
  const selectedModelProvider = selectedModel?.provider ?? null
  const selectedModelProviderLabel = selectedModel?.providerLabel ?? null
  const selectedModelId = selectedModel?.api_id ?? null
  const selectedModelLabel = selectedModel?.label ?? null
  const areRuntimeSettingsLoaded =
    isSelectedModelApiIdLoaded &&
    areEnabledChannelsLoaded &&
    areTelegramAllowedUserIdsLoaded &&
    areDisabledSkillsLoaded

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

  const restoreRuntimeConfigSnapshot = useCallback(
    async (snapshot: RuntimeConfigSettingsSnapshot) => {
      await Promise.all([
        setSelectedModelApiId(snapshot.selectedModelApiId),
        setEnabledChannels(snapshot.enabledChannels),
        setTelegramAllowedUserIds(snapshot.telegramAllowedUserIds),
        setDisabledSkills(snapshot.disabledSkills)
      ])
    },
    [setDisabledSkills, setEnabledChannels, setSelectedModelApiId, setTelegramAllowedUserIds]
  )

  useEffect(() => {
    if (!areRuntimeSettingsLoaded) {
      return
    }

    let cancelled = false
    const syncId = latestRuntimeConfigSyncIdRef.current + 1
    latestRuntimeConfigSyncIdRef.current = syncId

    const settingsSnapshot = createRuntimeConfigSettingsSnapshot(
      selectedModelApiId,
      enabledChannels,
      telegramAllowedUserIds,
      disabledSkills
    )
    const payload = createRuntimeConfigPayload(
      settingsSnapshot,
      selectedModelProvider,
      selectedModelProviderLabel,
      selectedModelId,
      selectedModelLabel
    )

    runtimeConfigSyncQueueRef.current = runtimeConfigSyncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (cancelled || syncId !== latestRuntimeConfigSyncIdRef.current) {
          return
        }

        await syncRuntimeConfig(payload)
        lastAppliedRuntimeConfigRef.current = settingsSnapshot
      })
      .catch(async error => {
        if (cancelled || syncId !== latestRuntimeConfigSyncIdRef.current) {
          return
        }

        console.warn("[Home] Failed to sync runtime config:", error)
        const lastAppliedRuntimeConfig = lastAppliedRuntimeConfigRef.current
        const shouldRollback =
          lastAppliedRuntimeConfig &&
          !runtimeConfigSettingsEqual(lastAppliedRuntimeConfig, settingsSnapshot)

        if (!lastAppliedRuntimeConfig) {
          return
        }

        if (!shouldRollback) {
          return
        }

        console.warn("[Home] Restoring last applied runtime config snapshot after sync failure.")
        await restoreRuntimeConfigSnapshot(lastAppliedRuntimeConfig)
      })

    return () => {
      cancelled = true
    }
  }, [
    areRuntimeSettingsLoaded,
    disabledSkills,
    enabledChannels,
    restoreRuntimeConfigSnapshot,
    selectedModelApiId,
    selectedModelId,
    selectedModelLabel,
    selectedModelProvider,
    selectedModelProviderLabel,
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

  const handleInstallAppUpdate = useCallback(async () => {
    try {
      await installUpdate()
    } catch (nextError) {
      toast.error(t("about.updater.toast.installFailed", { ns: "settings" }), {
        description: toErrorMessage(nextError) ?? undefined
      })
    }
  }, [installUpdate, t])

  const handleRestartAppAfterUpdate = useCallback(async () => {
    try {
      await relaunchApp()
    } catch (nextError) {
      toast.error(t("about.updater.toast.restartFailed", { ns: "settings" }), {
        description: toErrorMessage(nextError) ?? undefined
      })
    }
  }, [relaunchApp, t])

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <AppUpdaterOwner />
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
        appUpdate={{
          status: appUpdaterStatus,
          onInstall: handleInstallAppUpdate,
          onRestart: handleRestartAppAfterUpdate
        }}
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
        <div className="relative h-full">
          {/* Keep AppChat mounted so background reply state stays in sync across pane switches. */}
          <div
            aria-hidden={activePane !== "desktop-chat"}
            className={cn("absolute inset-0", activePane !== "desktop-chat" && "hidden")}
          >
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
          </div>

          {activePane === "telegram-debug" ? (
            <div className="absolute inset-0">
              <ChannelTelegramChat />
            </div>
          ) : activePane === "skills" ? (
            <div className="absolute inset-0">
              <SkillsPane
                disabledSkillIds={disabledSkills}
                setDisabledSkillIds={setDisabledSkills}
              />
            </div>
          ) : null}
        </div>
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
