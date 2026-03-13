import { randomInt, randomUUID } from "node:crypto"
import type { LanguageModel } from "ai"
import { stepCountIs, streamText, type UIMessage } from "ai"
import { discoverSkillsSafely, filterDisabledSkills } from "../skills/catalog"
import { processMessages } from "../utils/message-processor"
import { buildSystemPrompt } from "../utils/system-prompt-builder"
import {
  type TelegramMediaUpload,
  transformTelegramMediaMessage
} from "../utils/telegram-media-message"
import { toTelegramHtml } from "../utils/telegram-rich-text"
import { buildToolChoice } from "../utils/tool-choice"
import type { ChannelRuntimeConfigService } from "./channel-runtime-config-service"
import type { ProviderService } from "./provider-service"
import type { ToolService } from "./tool-service"

const TELEGRAM_PROVIDER_ID = "telegram"
const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org"
const LONG_POLL_TIMEOUT_SECONDS = 30
const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 30_000
const MAX_SESSION_MESSAGES = 40
const LOG_TEXT_PREVIEW_LENGTH = 100
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096
const TELEGRAM_DRAFT_UPDATE_INTERVAL_MS = 700
const TELEGRAM_CHAT_ACTION_INTERVAL_MS = 3000
const WHITELIST_JOIN_BUTTON_TEXT = "Join the Channel"
const JOIN_REQUEST_CALLBACK_DATA = "mf_join_request_v1"
const WHITELIST_DENY_COOLDOWN_MS = 10 * 60 * 1000

interface TelegramApiResponse<T> {
  ok: boolean
  result: T
  description?: string
  error_code?: number
}

interface TelegramChat {
  id: number
  type: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

interface TelegramUser {
  id: number
  is_bot: boolean
  username?: string
  first_name?: string
  last_name?: string
}

interface TelegramPhotoSize {
  file_id: string
  width: number
  height: number
  file_size?: number
}

interface TelegramDocument {
  file_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

interface TelegramVideo {
  file_id: string
  width?: number
  height?: number
  duration?: number
  file_name?: string
  mime_type?: string
  file_size?: number
}

interface TelegramAudio {
  file_id: string
  duration?: number
  performer?: string
  title?: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

interface TelegramVoice {
  file_id: string
  duration?: number
  mime_type?: string
  file_size?: number
}

interface TelegramMessage {
  message_id: number
  chat: TelegramChat
  from?: TelegramUser
  text?: string
  caption?: string
  date?: number
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
  video?: TelegramVideo
  audio?: TelegramAudio
  voice?: TelegramVoice
}

interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

interface TelegramSentMessage {
  message_id: number
}

type TelegramChatAction =
  | "typing"
  | "upload_photo"
  | "upload_video"
  | "upload_voice"
  | "upload_document"
  | "choose_sticker"
  | "upload_video_note"

type LogValue = string | number | boolean | null | undefined

export interface TelegramSessionSummary {
  sessionKey: string
  chatId: string
  updatedAt: number
  messageCount: number
  lastMessageRole: UIMessage["role"] | null
  lastMessagePreview: string
}

export interface TelegramWhitelistRequest {
  requestId: string
  userId: string
  chatId: string
  username?: string
  firstName?: string
  lastName?: string
  requestedAt: number
  lastMessagePreview: string
}

export type TelegramWhitelistDecision = "approve" | "reject"

export class TelegramBotService {
  private pollingAbortController: AbortController | null = null
  private pollingTask: Promise<void> | null = null
  private runtimeSignature: string | null = null
  private refreshChain: Promise<void> = Promise.resolve()
  private sessionMessages = new Map<string, UIMessage[]>()
  private sessionUpdatedAt = new Map<string, number>()
  private whitelistRequests = new Map<string, TelegramWhitelistRequest>()
  private pendingWhitelistPreviewByUserId = new Map<string, string>()
  private deniedCooldownByUserId = new Map<string, number>()
  private temporaryApprovedUserIds = new Set<string>()

  constructor(
    private readonly providerService: ProviderService,
    private readonly toolService: ToolService,
    private readonly channelRuntimeConfigService: ChannelRuntimeConfigService
  ) {}

  refresh(): Promise<void> {
    this.refreshChain = this.refreshChain
      .then(async () => {
        await this.refreshInternal()
      })
      .catch(error => {
        console.error("[TelegramBotService] Refresh failed:", error)
      })

    return this.refreshChain
  }

  async stop(): Promise<void> {
    await this.stopRuntime("service shutdown")
  }

  listSessions(): TelegramSessionSummary[] {
    const summaries: TelegramSessionSummary[] = []

    for (const [sessionKey, messages] of this.sessionMessages.entries()) {
      const chatId = this.extractChatIdFromSessionKey(sessionKey)
      const updatedAt = this.sessionUpdatedAt.get(sessionKey) ?? 0
      const lastMessage = messages[messages.length - 1]
      const lastMessageText = this.extractMessageText(lastMessage)

      summaries.push({
        sessionKey,
        chatId,
        updatedAt,
        messageCount: messages.length,
        lastMessageRole: lastMessage?.role ?? null,
        lastMessagePreview: this.toTextPreview(lastMessageText)
      })
    }

    summaries.sort((a, b) => b.updatedAt - a.updatedAt)
    return summaries
  }

  getSessionMessages(sessionKey: string): UIMessage[] | null {
    const messages = this.sessionMessages.get(sessionKey)
    if (!messages) {
      return null
    }

    return JSON.parse(JSON.stringify(messages)) as UIMessage[]
  }

  listWhitelistRequests(): TelegramWhitelistRequest[] {
    return [...this.whitelistRequests.values()].sort((a, b) => b.requestedAt - a.requestedAt)
  }

  async decideWhitelistRequest(
    requestId: string,
    decision: TelegramWhitelistDecision
  ): Promise<TelegramWhitelistRequest | null> {
    const request = this.whitelistRequests.get(requestId)
    if (!request) {
      return null
    }

    this.whitelistRequests.delete(requestId)

    if (decision === "approve") {
      this.temporaryApprovedUserIds.add(request.userId)
      await this.sendTextMessage(
        request.chatId,
        "Your access request has been approved. You can now chat with this bot."
      )
      this.logInfo("Whitelist request approved", {
        requestId,
        userId: request.userId,
        chatId: request.chatId
      })
      return request
    }

    this.deniedCooldownByUserId.set(request.userId, Date.now() + WHITELIST_DENY_COOLDOWN_MS)
    await this.sendTextMessage(
      request.chatId,
      "Your access request was declined. You can submit another request in 10 minutes."
    )
    this.logInfo("Whitelist request rejected", {
      requestId,
      userId: request.userId,
      chatId: request.chatId
    })

    return request
  }

  private async refreshInternal(): Promise<void> {
    const selectedModel = this.channelRuntimeConfigService.getSelectedModel()
    const telegramEnabled = this.channelRuntimeConfigService.isTelegramEnabled()
    const telegramConfig = this.providerService.getConfig(TELEGRAM_PROVIDER_ID)
    const botToken = telegramConfig?.apiKey?.trim() ?? ""
    const apiBaseUrl = telegramConfig?.baseUrl?.trim() || DEFAULT_TELEGRAM_API_BASE_URL
    const nextSignature = `${botToken}::${apiBaseUrl}`

    this.logInfo("Refresh evaluation", {
      enabled: telegramEnabled,
      hasToken: Boolean(botToken),
      hasSelectedModel: Boolean(selectedModel),
      selectedModel: selectedModel ? `${selectedModel.provider}/${selectedModel.modelId}` : "none",
      apiBaseUrl
    })

    const shouldRun = telegramEnabled && Boolean(botToken) && Boolean(selectedModel)
    if (!shouldRun) {
      await this.stopRuntime("disabled or missing runtime dependencies")
      return
    }

    const isAlreadyRunning =
      this.pollingTask !== null &&
      this.pollingAbortController !== null &&
      this.runtimeSignature === nextSignature

    if (isAlreadyRunning) {
      return
    }

    await this.stopRuntime("refresh restart")
    await this.startRuntime(botToken, apiBaseUrl, nextSignature)
  }

  private async startRuntime(
    botToken: string,
    apiBaseUrl: string,
    runtimeSignature: string
  ): Promise<void> {
    await this.deleteWebhook(botToken, apiBaseUrl)

    const pollAbortController = new AbortController()
    this.pollingAbortController = pollAbortController
    this.runtimeSignature = runtimeSignature
    this.pollingTask = this.runPollingLoop(botToken, apiBaseUrl, pollAbortController.signal)

    this.logInfo("Runtime started", {
      apiBaseUrl
    })
  }

  private async stopRuntime(reason: string): Promise<void> {
    if (!this.pollingTask && !this.pollingAbortController) {
      return
    }

    this.logInfo("Stopping runtime", {
      reason
    })

    const runningTask = this.pollingTask

    if (this.pollingAbortController) {
      this.pollingAbortController.abort()
    }

    this.pollingAbortController = null
    this.pollingTask = null
    this.runtimeSignature = null

    if (runningTask) {
      try {
        await runningTask
      } catch (error) {
        console.warn("[TelegramBotService] Polling task stopped with error:", error)
      }
    }

    this.logInfo("Runtime stopped")
  }

  private async runPollingLoop(
    botToken: string,
    apiBaseUrl: string,
    signal: AbortSignal
  ): Promise<void> {
    let offset: number | undefined
    let retryDelayMs = RETRY_BASE_DELAY_MS

    this.logInfo("Long polling started", {
      baseUrl: apiBaseUrl,
      timeoutSeconds: LONG_POLL_TIMEOUT_SECONDS
    })

    while (!signal.aborted) {
      try {
        const updates = await this.getUpdates(botToken, apiBaseUrl, offset, signal)
        retryDelayMs = RETRY_BASE_DELAY_MS

        for (const update of updates) {
          if (signal.aborted) {
            break
          }

          offset = update.update_id + 1
          await this.handleUpdate(botToken, apiBaseUrl, update)
        }
      } catch (error) {
        if (signal.aborted) {
          break
        }

        console.error(`[TelegramBotService] Polling error (baseURL=${apiBaseUrl}):`, error)
        await this.delay(retryDelayMs, signal)
        retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_DELAY_MS)
      }
    }

    this.logInfo("Long polling stopped")
  }

  private async handleUpdate(
    botToken: string,
    apiBaseUrl: string,
    update: TelegramUpdate
  ): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(botToken, apiBaseUrl, update.callback_query)
      return
    }

    if (!update.message) {
      return
    }

    await this.handleIncomingMessage(botToken, apiBaseUrl, update.message)
  }

  private isAllowedPrivateUser(userId: string): boolean {
    const configuredUserIds = new Set(this.channelRuntimeConfigService.getAllowedTelegramUserIds())
    if (configuredUserIds.has(userId)) {
      return true
    }

    return this.temporaryApprovedUserIds.has(userId)
  }

  private async handleCallbackQuery(
    botToken: string,
    apiBaseUrl: string,
    callback: TelegramCallbackQuery
  ): Promise<void> {
    if (callback.data !== JOIN_REQUEST_CALLBACK_DATA) {
      await this.answerCallbackQuery(botToken, apiBaseUrl, callback.id, "Unsupported action")
      return
    }

    const message = callback.message
    if (!message || message.chat.type !== "private") {
      await this.answerCallbackQuery(
        botToken,
        apiBaseUrl,
        callback.id,
        "Join requests are only supported in private chat"
      )
      return
    }

    const userId = String(callback.from.id)
    const chatId = String(message.chat.id)

    if (this.isAllowedPrivateUser(userId)) {
      await this.answerCallbackQuery(botToken, apiBaseUrl, callback.id, "Already approved")
      return
    }

    const cooldownUntil = this.deniedCooldownByUserId.get(userId) ?? 0
    if (cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000)
      await this.answerCallbackQuery(
        botToken,
        apiBaseUrl,
        callback.id,
        `Please retry in ${secondsLeft}s`,
        true
      )
      return
    }

    const requestId = userId
    const existing = this.whitelistRequests.get(requestId)
    if (!existing) {
      const pendingPreview = this.pendingWhitelistPreviewByUserId.get(userId) ?? ""
      const callbackPreview = this.toTextPreview(message.text ?? message.caption)
      this.whitelistRequests.set(requestId, {
        requestId,
        userId,
        chatId,
        username: callback.from.username,
        firstName: callback.from.first_name,
        lastName: callback.from.last_name,
        requestedAt: Date.now(),
        lastMessagePreview: pendingPreview || callbackPreview
      })
    }
    this.pendingWhitelistPreviewByUserId.delete(userId)

    await this.answerCallbackQuery(botToken, apiBaseUrl, callback.id, "Request submitted", true)
    await this.sendTextMessage(chatId, "Your join request has been submitted for approval.")

    this.logInfo("Whitelist request queued", {
      requestId,
      userId,
      chatId
    })
  }

  private async handleIncomingMessage(
    botToken: string,
    apiBaseUrl: string,
    message: TelegramMessage
  ): Promise<void> {
    if (message.chat.type !== "private") {
      return
    }

    if (message.from?.is_bot) {
      return
    }

    const userId = message.from ? String(message.from.id) : ""
    const chatId = String(message.chat.id)

    if (!userId) {
      return
    }

    const incomingText = this.buildIncomingMessageText(message)

    if (!this.isAllowedPrivateUser(userId)) {
      const incomingPreview = this.toTextPreview(incomingText)
      if (incomingPreview) {
        this.pendingWhitelistPreviewByUserId.set(userId, incomingPreview)
      }
      await this.sendWhitelistJoinButton(chatId)
      return
    }

    if (!incomingText) {
      return
    }

    const selectedModel = this.channelRuntimeConfigService.getSelectedModel()
    if (!selectedModel) {
      await this.sendTextMessage(
        chatId,
        "No model is selected in Mind Flayer. Please select one and try again."
      )
      return
    }

    if (!this.providerService.hasConfig(selectedModel.provider)) {
      await this.sendTextMessage(
        chatId,
        `Selected model provider '${selectedModel.provider}' is not configured in Mind Flayer settings.`
      )
      return
    }

    let model: LanguageModel
    try {
      model = this.providerService.createModel(selectedModel.provider, selectedModel.modelId)
    } catch (error) {
      await this.sendTextMessage(
        chatId,
        `Failed to load model '${selectedModel.modelId}'. Please verify your model settings in Mind Flayer.`
      )
      console.error("[TelegramBotService] Failed to create model:", error)
      return
    }

    const sessionKey = `telegram:${chatId}`
    const history = this.sessionMessages.get(sessionKey) ?? []
    const messagesWithLatestInput = this.trimSessionMessages([
      ...history,
      this.createTextMessage("user", incomingText)
    ])
    this.setSessionMessages(sessionKey, messagesWithLatestInput)

    let currentChatAction: TelegramChatAction = "typing"
    let chatActionAbortController: AbortController | null = null
    let chatActionTask: Promise<void> | null = null

    const startChatActionLoop = () => {
      if (chatActionTask) {
        return
      }

      chatActionAbortController = new AbortController()
      chatActionTask = this.runChatActionLoop(
        botToken,
        apiBaseUrl,
        chatId,
        () => currentChatAction,
        chatActionAbortController.signal
      )
    }

    const switchChatAction = async (action: TelegramChatAction) => {
      currentChatAction = action

      try {
        await this.sendChatAction(botToken, apiBaseUrl, chatId, action)
      } catch (error) {
        this.logInfo("sendChatAction failed", {
          chatId,
          action,
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const stopChatActionLoop = async () => {
      if (chatActionAbortController) {
        chatActionAbortController.abort()
        chatActionAbortController = null
      }

      if (!chatActionTask) {
        return
      }

      try {
        await chatActionTask
      } catch (error) {
        this.logInfo("Chat action loop stopped with error", {
          chatId,
          reason: error instanceof Error ? error.message : String(error)
        })
      } finally {
        chatActionTask = null
      }
    }

    startChatActionLoop()

    try {
      const tools = this.toolService.getRequestTools({
        useWebSearch: true,
        chatId: this.toSafeToolSessionId(sessionKey),
        includeBashExecution: true,
        source: "channel"
      })
      const toolChoice = buildToolChoice({
        useWebSearch: true,
        webSearchMode: "auto",
        messages: messagesWithLatestInput
      })
      const [skills, modelMessages] = await Promise.all([
        discoverSkillsSafely("Telegram request"),
        processMessages(messagesWithLatestInput, tools)
      ])
      const enabledSkills = filterDisabledSkills(
        skills,
        this.channelRuntimeConfigService.getDisabledSkillIds()
      )

      console.info("[TelegramBotService] handling message", {
        chatId,
        model: `${selectedModel.provider}/${selectedModel.modelId}`,
        inputMessage: this.toTextPreview(incomingText)
      })

      const result = streamText({
        model,
        system: buildSystemPrompt({
          modelProvider: selectedModel.provider,
          modelId: selectedModel.modelId,
          channel: "telegram",
          skills: enabledSkills
        }),
        messages: modelMessages,
        tools,
        toolChoice,
        stopWhen: Object.keys(tools).length > 0 ? stepCountIs(20) : stepCountIs(1)
      })

      let assistantText = ""
      let lastDraftAt = 0
      let draftSupported = true
      const draftId = this.createDraftId()

      for await (const chunk of result.textStream) {
        assistantText += chunk

        if (!draftSupported) {
          continue
        }

        const now = Date.now()
        if (now - lastDraftAt < TELEGRAM_DRAFT_UPDATE_INTERVAL_MS) {
          continue
        }

        const draftText = assistantText.trim()
        if (!draftText) {
          continue
        }

        const previewDraft = this.sliceTelegramMessage(draftText)

        try {
          await this.sendMessageDraft(botToken, apiBaseUrl, chatId, draftId, previewDraft)
          lastDraftAt = now
        } catch (error) {
          draftSupported = false
          this.logInfo("sendMessageDraft unavailable, fallback to final sendMessage only", {
            chatId,
            reason: error instanceof Error ? error.message : String(error)
          })
        }
      }

      const normalizedAssistantText = assistantText.trim()
      if (!normalizedAssistantText) {
        const fallbackText = "I could not generate a response. Please try again."
        await this.sendTextMessage(chatId, fallbackText)
        this.setSessionMessages(
          sessionKey,
          this.trimSessionMessages([
            ...messagesWithLatestInput,
            this.createTextMessage("assistant", fallbackText)
          ])
        )
        return
      }

      const transformed = await transformTelegramMediaMessage(normalizedAssistantText)
      transformed.warnings.forEach(warning => {
        this.logInfo("Telegram media transform warning", {
          chatId,
          warning
        })
      })

      const sanitizedText = transformed.sanitizedText || normalizedAssistantText
      await this.sendTextInChunks(chatId, sanitizedText)
      await this.sendMediaUploads(chatId, transformed.uploads, async upload => {
        await switchChatAction(this.mapUploadKindToChatAction(upload.kind))
      })

      this.setSessionMessages(
        sessionKey,
        this.trimSessionMessages([
          ...messagesWithLatestInput,
          this.createTextMessage("assistant", sanitizedText)
        ])
      )
    } catch (error) {
      console.error("[TelegramBotService] Failed to process message:", error)
      await this.sendTextMessage(chatId, "Error: Failed to generate response. Please try again.")
    } finally {
      await stopChatActionLoop()
    }
  }

  private buildIncomingMessageText(message: TelegramMessage): string {
    const parts: string[] = []
    const text = message.text?.trim()
    const caption = message.caption?.trim()

    if (text) {
      parts.push(text)
    }

    if (caption && caption !== text) {
      parts.push(caption)
    }

    if (message.photo && message.photo.length > 0) {
      const largest = message.photo.reduce((max, next) => {
        const maxArea = max.width * max.height
        const nextArea = next.width * next.height
        return nextArea > maxArea ? next : max
      })
      parts.push(
        `[user sent photo id=${largest.file_id} width=${largest.width} height=${largest.height}${largest.file_size ? ` size=${largest.file_size}` : ""}]`
      )
    }

    if (message.video) {
      const { file_id, width, height, duration, file_name, mime_type, file_size } = message.video
      parts.push(
        `[user sent video id=${file_id}${file_name ? ` file=${file_name}` : ""}${mime_type ? ` mime=${mime_type}` : ""}${width ? ` width=${width}` : ""}${height ? ` height=${height}` : ""}${duration ? ` duration=${duration}s` : ""}${file_size ? ` size=${file_size}` : ""}]`
      )
    }

    if (message.audio) {
      const { file_id, duration, performer, title, file_name, mime_type, file_size } = message.audio
      parts.push(
        `[user sent audio id=${file_id}${file_name ? ` file=${file_name}` : ""}${title ? ` title=${title}` : ""}${performer ? ` performer=${performer}` : ""}${mime_type ? ` mime=${mime_type}` : ""}${duration ? ` duration=${duration}s` : ""}${file_size ? ` size=${file_size}` : ""}]`
      )
    }

    if (message.voice) {
      const { file_id, duration, mime_type, file_size } = message.voice
      parts.push(
        `[user sent voice id=${file_id}${mime_type ? ` mime=${mime_type}` : ""}${duration ? ` duration=${duration}s` : ""}${file_size ? ` size=${file_size}` : ""}]`
      )
    }

    if (message.document) {
      const { file_id, file_name, mime_type, file_size } = message.document
      parts.push(
        `[user sent document id=${file_id}${file_name ? ` file=${file_name}` : ""}${mime_type ? ` mime=${mime_type}` : ""}${file_size ? ` size=${file_size}` : ""}]`
      )
    }

    return parts.join("\n").trim()
  }

  private async sendWhitelistJoinButton(chatId: string): Promise<void> {
    await this.callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: "You are not authorized yet. Request access below.",
      reply_markup: {
        inline_keyboard: [
          [{ text: WHITELIST_JOIN_BUTTON_TEXT, callback_data: JOIN_REQUEST_CALLBACK_DATA }]
        ]
      }
    })
  }

  private async sendMediaUploads(
    chatId: string,
    uploads: TelegramMediaUpload[],
    beforeUpload?: (upload: TelegramMediaUpload) => Promise<void>
  ): Promise<void> {
    for (const upload of uploads) {
      if (beforeUpload) {
        await beforeUpload(upload)
      }

      try {
        await this.sendMediaUpload(chatId, upload)
      } catch (error) {
        console.warn("[TelegramBotService] Failed to send media upload:", error)
      }
    }
  }

  private async sendMediaUpload(chatId: string, upload: TelegramMediaUpload): Promise<void> {
    const method = this.resolveMediaUploadMethod(upload.kind)

    try {
      await this.callTelegramApi(method, this.createMediaUploadPayload(chatId, upload, true), true)
    } catch (error) {
      if (!this.isTelegramEntityParseError(error)) {
        throw error
      }

      this.logInfo("Media upload parse_mode HTML failed, retrying plain text caption", {
        chatId,
        method,
        reason: error instanceof Error ? error.message : String(error)
      })

      await this.callTelegramApi(method, this.createMediaUploadPayload(chatId, upload, false), true)
    }
  }

  private async sendTextInChunks(chatId: string, text: string): Promise<void> {
    const chunks = this.splitTelegramMessage(text)

    for (const chunk of chunks) {
      await this.sendTextMessage(chatId, chunk)
    }
  }

  private async sendTextMessage(chatId: string, text: string): Promise<void> {
    const htmlPayload = {
      chat_id: chatId,
      text: toTelegramHtml(text),
      parse_mode: "HTML" as const
    }

    try {
      await this.callTelegramApi("sendMessage", htmlPayload)
    } catch (error) {
      if (!this.isTelegramEntityParseError(error)) {
        throw error
      }

      this.logInfo("sendMessage parse_mode HTML failed, retrying plain text", {
        chatId,
        reason: error instanceof Error ? error.message : String(error)
      })

      await this.callTelegramApi("sendMessage", {
        chat_id: chatId,
        text
      })
    }
  }

  private resolveMediaUploadMethod(uploadKind: TelegramMediaUpload["kind"]): string {
    if (uploadKind === "photo") {
      return "sendPhoto"
    }
    if (uploadKind === "video") {
      return "sendVideo"
    }
    if (uploadKind === "audio") {
      return "sendAudio"
    }
    return "sendDocument"
  }

  private createMediaUploadPayload(
    chatId: string,
    upload: TelegramMediaUpload,
    useHtmlParseMode: boolean
  ): FormData {
    const formData = new FormData()
    formData.set("chat_id", chatId)

    if (useHtmlParseMode) {
      formData.set("parse_mode", "HTML")
    }

    if (upload.caption) {
      formData.set("caption", useHtmlParseMode ? toTelegramHtml(upload.caption) : upload.caption)
    }

    const blob = new Blob([new Uint8Array(upload.data)], { type: upload.mimeType })
    const mediaFieldName = upload.kind === "photo" ? "photo" : upload.kind
    formData.set(mediaFieldName, blob, upload.filename)

    return formData
  }

  private isTelegramEntityParseError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
    return message.includes("can't parse entities") || message.includes("parse entities")
  }

  private mapUploadKindToChatAction(kind: TelegramMediaUpload["kind"]): TelegramChatAction {
    if (kind === "photo") {
      return "upload_photo"
    }

    if (kind === "video") {
      return "upload_video"
    }

    if (kind === "audio") {
      return "upload_voice"
    }

    return "upload_document"
  }

  private async runChatActionLoop(
    botToken: string,
    apiBaseUrl: string,
    chatId: string,
    getAction: () => TelegramChatAction,
    signal: AbortSignal
  ): Promise<void> {
    while (!signal.aborted) {
      const action = getAction()

      try {
        await this.sendChatAction(botToken, apiBaseUrl, chatId, action)
      } catch (error) {
        this.logInfo("sendChatAction failed", {
          chatId,
          action,
          reason: error instanceof Error ? error.message : String(error)
        })
      }

      await this.delay(TELEGRAM_CHAT_ACTION_INTERVAL_MS, signal)
    }
  }

  private async sendChatAction(
    botToken: string,
    apiBaseUrl: string,
    chatId: string,
    action: TelegramChatAction
  ): Promise<void> {
    const response = await fetch(`${apiBaseUrl}/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        action
      })
    })

    if (!response.ok) {
      throw new Error(`sendChatAction failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TelegramApiResponse<true>
    if (!payload.ok) {
      throw new Error(`sendChatAction failed: ${payload.description || "unknown error"}`)
    }
  }

  private async sendMessageDraft(
    botToken: string,
    apiBaseUrl: string,
    chatId: string,
    draftId: number,
    text: string
  ): Promise<void> {
    const body = new URLSearchParams()
    body.set("chat_id", chatId)
    body.set("draft_id", String(draftId))
    body.set("text", text)

    const response = await fetch(`${apiBaseUrl}/bot${botToken}/sendMessageDraft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    })

    if (!response.ok) {
      throw new Error(`sendMessageDraft failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TelegramApiResponse<unknown>
    if (!payload.ok) {
      throw new Error(`sendMessageDraft failed: ${payload.description || "unknown error"}`)
    }
  }

  private createDraftId(): number {
    // Telegram requires non-zero draft_id; keep it in signed 32-bit range.
    return randomInt(1, 2_147_483_647)
  }

  private splitTelegramMessage(text: string): string[] {
    const trimmed = text.trim()
    if (!trimmed) {
      return ["I could not generate a response. Please try again."]
    }

    const chunks: string[] = []
    let cursor = 0

    while (cursor < trimmed.length) {
      const limit = Math.min(cursor + TELEGRAM_MAX_MESSAGE_LENGTH, trimmed.length)
      let nextCursor = limit

      if (limit < trimmed.length) {
        const lastNewline = trimmed.lastIndexOf("\n", limit)
        const lastSpace = trimmed.lastIndexOf(" ", limit)
        const boundary = Math.max(lastNewline, lastSpace)
        if (boundary > cursor + TELEGRAM_MAX_MESSAGE_LENGTH * 0.6) {
          nextCursor = boundary + 1
        }
      }

      const chunk = trimmed.slice(cursor, nextCursor).trim()
      if (chunk) {
        chunks.push(chunk)
      }

      cursor = nextCursor
    }

    return chunks.length > 0 ? chunks : [trimmed]
  }

  private sliceTelegramMessage(text: string): string {
    if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      return text
    }

    return `${text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 1)}…`
  }

  private async answerCallbackQuery(
    botToken: string,
    apiBaseUrl: string,
    callbackQueryId: string,
    text: string,
    showAlert = false
  ): Promise<void> {
    const response = await fetch(`${apiBaseUrl}/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert
      })
    })

    if (!response.ok) {
      throw new Error(`answerCallbackQuery failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TelegramApiResponse<true>
    if (!payload.ok) {
      throw new Error(`answerCallbackQuery failed: ${payload.description || "unknown error"}`)
    }
  }

  private async deleteWebhook(botToken: string, apiBaseUrl: string): Promise<void> {
    const response = await fetch(`${apiBaseUrl}/bot${botToken}/deleteWebhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ drop_pending_updates: false })
    })

    if (!response.ok) {
      throw new Error(`deleteWebhook failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TelegramApiResponse<true>
    if (!payload.ok) {
      throw new Error(`deleteWebhook failed: ${payload.description || "unknown error"}`)
    }
  }

  private async getUpdates(
    botToken: string,
    apiBaseUrl: string,
    offset: number | undefined,
    signal: AbortSignal
  ): Promise<TelegramUpdate[]> {
    const response = await fetch(`${apiBaseUrl}/bot${botToken}/getUpdates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        timeout: LONG_POLL_TIMEOUT_SECONDS,
        offset,
        allowed_updates: ["message", "callback_query"]
      }),
      signal
    })

    if (!response.ok) {
      throw new Error(`getUpdates failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TelegramApiResponse<TelegramUpdate[]>
    if (!payload.ok) {
      throw new Error(`getUpdates failed: ${payload.description || "unknown error"}`)
    }

    return Array.isArray(payload.result) ? payload.result : []
  }

  private async callTelegramApi<T = TelegramSentMessage>(
    method: string,
    payload: object | FormData,
    isFormData = false
  ): Promise<T> {
    const telegramConfig = this.providerService.getConfig(TELEGRAM_PROVIDER_ID)
    const botToken = telegramConfig?.apiKey?.trim() ?? ""
    const apiBaseUrl = telegramConfig?.baseUrl?.trim() || DEFAULT_TELEGRAM_API_BASE_URL

    if (!botToken) {
      throw new Error("Telegram bot token is not configured")
    }

    const response = await fetch(`${apiBaseUrl}/bot${botToken}/${method}`, {
      method: "POST",
      headers: isFormData
        ? undefined
        : {
            "Content-Type": "application/json"
          },
      body: isFormData ? (payload as FormData) : JSON.stringify(payload)
    })

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`

      try {
        const errorPayload = (await response.json()) as Partial<TelegramApiResponse<unknown>>
        if (typeof errorPayload.description === "string" && errorPayload.description.trim()) {
          errorDetail = errorPayload.description
        }
      } catch {
        // Ignore JSON parsing errors and keep HTTP status details.
      }

      throw new Error(`${method} failed: ${errorDetail}`)
    }

    const result = (await response.json()) as TelegramApiResponse<T>
    if (!result.ok) {
      throw new Error(`${method} failed: ${result.description || "unknown error"}`)
    }

    return result.result
  }

  private createTextMessage(role: "user" | "assistant", text: string): UIMessage {
    return {
      id: randomUUID(),
      role,
      parts: [
        {
          type: "text",
          text
        }
      ]
    } as UIMessage
  }

  private trimSessionMessages(messages: UIMessage[]): UIMessage[] {
    if (messages.length <= MAX_SESSION_MESSAGES) {
      return messages
    }

    return messages.slice(messages.length - MAX_SESSION_MESSAGES)
  }

  private toSafeToolSessionId(rawSessionKey: string): string {
    const normalized = rawSessionKey
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120)

    return normalized || "telegram_session"
  }

  private setSessionMessages(sessionKey: string, messages: UIMessage[]): void {
    this.sessionMessages.set(sessionKey, messages)
    this.sessionUpdatedAt.set(sessionKey, Date.now())
  }

  private extractChatIdFromSessionKey(sessionKey: string): string {
    return sessionKey.startsWith("telegram:") ? sessionKey.slice("telegram:".length) : sessionKey
  }

  private extractMessageText(message: UIMessage | undefined): string {
    if (!message?.parts || message.parts.length === 0) {
      return ""
    }

    return message.parts
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join(" ")
  }

  private toTextPreview(text: string | undefined): string {
    const normalized = text?.replace(/\s+/g, " ").trim() ?? ""
    if (!normalized) {
      return ""
    }
    if (normalized.length <= LOG_TEXT_PREVIEW_LENGTH) {
      return normalized
    }
    return `${normalized.slice(0, LOG_TEXT_PREVIEW_LENGTH)}...`
  }

  private logInfo(event: string, details?: Record<string, LogValue>): void {
    const suffix = this.formatLogDetails(details)
    console.log(`[TelegramBotService] ${event}${suffix}`)
  }

  private formatLogDetails(details?: Record<string, LogValue>): string {
    if (!details) {
      return ""
    }

    const entries = Object.entries(details).filter(([, value]) => value !== undefined)
    if (entries.length === 0) {
      return ""
    }

    const serialized = entries.map(([key, value]) => `${key}=${this.formatLogValue(value)}`)
    return ` ${serialized.join(" ")}`
  }

  private formatLogValue(value: LogValue): string {
    if (value === undefined) {
      return "undefined"
    }
    if (typeof value === "string") {
      return JSON.stringify(value)
    }
    return String(value)
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return
    }

    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        resolve()
      }, ms)

      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true }
      )
    })
  }
}
