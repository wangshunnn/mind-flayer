import { createMemoryState } from "@chat-adapter/state-memory"
import { createTelegramAdapter } from "@chat-adapter/telegram"
import type { LanguageModel } from "ai"
import { stepCountIs, streamText, type UIMessage } from "ai"
import { Chat } from "chat"
import { processMessages } from "../utils/message-processor"
import { buildSystemPrompt } from "../utils/system-prompt-builder"
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

type LogValue = string | number | boolean | null | undefined

interface TelegramApiResponse<T> {
  ok: boolean
  result: T
  description?: string
}

interface TelegramThread {
  id: string
  isDM?: boolean
  subscribe: () => Promise<void>
  post: (message: string | AsyncIterable<string>) => Promise<void>
}

interface TelegramMessage {
  text?: string
  isMention?: boolean
  author?: {
    isMe?: boolean
  }
}

/**
 * Orchestrates Telegram adapter lifecycle and long polling.
 * Runs only when channel is enabled, token exists, and selected model is set.
 */
export class TelegramBotService {
  private bot: Chat | null = null
  private pollingAbortController: AbortController | null = null
  private pollingTask: Promise<void> | null = null
  private runtimeSignature: string | null = null
  private refreshChain: Promise<void> = Promise.resolve()
  private sessionMessages = new Map<string, UIMessage[]>()

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
      this.logInfo("Runtime is not eligible to run", {
        enabled: telegramEnabled,
        hasToken: Boolean(botToken),
        hasSelectedModel: Boolean(selectedModel)
      })
      await this.stopRuntime("disabled or missing runtime dependencies")
      return
    }

    const isAlreadyRunning =
      this.bot !== null &&
      this.pollingTask !== null &&
      this.pollingAbortController !== null &&
      this.runtimeSignature === nextSignature

    if (isAlreadyRunning) {
      this.logInfo("Runtime already active, skipping restart")
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
    this.logInfo("Starting runtime", {
      apiBaseUrl,
      hasToken: Boolean(botToken)
    })

    const bot = new Chat({
      userName: "mind-flayer",
      adapters: {
        telegram: createTelegramAdapter({
          botToken,
          apiBaseUrl
        })
      },
      state: createMemoryState()
    })

    bot.onNewMention(async (thread: unknown, message: unknown) => {
      const telegramThread = thread as unknown as TelegramThread
      const telegramMessage = message as unknown as TelegramMessage
      this.logInfo("Received onNewMention event", {
        threadId: telegramThread.id,
        textPreview: this.toTextPreview(telegramMessage.text),
        isMe: Boolean(telegramMessage.author?.isMe)
      })

      try {
        await telegramThread.subscribe()
        this.logInfo("Subscribed to thread", {
          threadId: telegramThread.id
        })
      } catch (error) {
        console.warn("[TelegramBotService] Failed to subscribe thread:", error)
      }

      await this.handleIncomingMessage(telegramThread, telegramMessage)
    })

    bot.onSubscribedMessage(async (thread: unknown, message: unknown) => {
      const telegramThread = thread as unknown as TelegramThread
      const telegramMessage = message as unknown as TelegramMessage
      this.logInfo("Received onSubscribedMessage event", {
        threadId: telegramThread.id,
        textPreview: this.toTextPreview(telegramMessage.text),
        isMe: Boolean(telegramMessage.author?.isMe)
      })
      await this.handleIncomingMessage(telegramThread, telegramMessage)
    })

    // Fallback for Telegram DM first message without explicit @mention.
    // Only handles DM or explicit mentions to avoid group-wide noise.
    bot.onNewMessage(/[\s\S]+/, async (thread: unknown, message: unknown) => {
      const telegramThread = thread as unknown as TelegramThread
      const telegramMessage = message as unknown as TelegramMessage
      const isDM = Boolean(telegramThread.isDM)
      const isMention = Boolean(telegramMessage.isMention)

      this.logInfo("Received onNewMessage event", {
        threadId: telegramThread.id,
        isDM,
        isMention,
        textPreview: this.toTextPreview(telegramMessage.text)
      })

      if (!isDM && !isMention) {
        this.logInfo("Ignoring onNewMessage event (not DM and not mention)", {
          threadId: telegramThread.id
        })
        return
      }

      if (!isDM && isMention) {
        try {
          await telegramThread.subscribe()
          this.logInfo("Subscribed to thread via onNewMessage mention", {
            threadId: telegramThread.id
          })
        } catch (error) {
          console.warn("[TelegramBotService] Failed to subscribe thread:", error)
        }
      }

      await this.handleIncomingMessage(telegramThread, telegramMessage)
    })

    const pollAbortController = new AbortController()

    this.bot = bot
    this.pollingAbortController = pollAbortController
    this.runtimeSignature = runtimeSignature
    this.pollingTask = this.runPollingLoop(bot, botToken, apiBaseUrl, pollAbortController.signal)
    this.logInfo("Runtime started")
  }

  private async stopRuntime(reason: string): Promise<void> {
    if (!this.bot && !this.pollingTask && !this.pollingAbortController) {
      return
    }

    this.logInfo("Stopping runtime", {
      reason
    })

    const runningTask = this.pollingTask

    if (this.pollingAbortController) {
      this.pollingAbortController.abort()
    }

    this.bot = null
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
    bot: Chat,
    botToken: string,
    apiBaseUrl: string,
    signal: AbortSignal
  ): Promise<void> {
    let offset: number | undefined
    let retryDelayMs = RETRY_BASE_DELAY_MS
    let webhookDeleted = false

    this.logInfo("Long polling started", {
      baseUrl: apiBaseUrl,
      timeoutSeconds: LONG_POLL_TIMEOUT_SECONDS
    })

    while (!signal.aborted) {
      try {
        if (!webhookDeleted) {
          await this.deleteWebhook(botToken, apiBaseUrl)
          webhookDeleted = true
          this.logInfo("Webhook cleared, switched to long polling", {
            baseUrl: apiBaseUrl
          })
        }

        const updates = await this.getUpdates(botToken, apiBaseUrl, offset, signal)
        retryDelayMs = RETRY_BASE_DELAY_MS

        if (updates.length > 0) {
          this.logInfo("Polling received updates", {
            count: updates.length,
            currentOffset: offset ?? null
          })
        }

        for (const update of updates) {
          if (signal.aborted) {
            break
          }

          const updateId = this.extractUpdateId(update)
          if (updateId !== null) {
            offset = updateId + 1
          }

          await this.dispatchUpdate(bot, update)
        }
      } catch (error) {
        if (signal.aborted) {
          break
        }

        console.error(`[TelegramBotService] Polling error (baseURL=${apiBaseUrl}):`, error)
        this.logInfo("Polling retry scheduled", {
          retryDelayMs
        })
        await this.delay(retryDelayMs, signal)
        retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_DELAY_MS)
      }
    }

    this.logInfo("Long polling stopped")
  }

  private async deleteWebhook(botToken: string, apiBaseUrl: string): Promise<void> {
    this.logInfo("Deleting webhook", {
      baseUrl: apiBaseUrl
    })

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

    this.logInfo("deleteWebhook succeeded")
  }

  private async getUpdates(
    botToken: string,
    apiBaseUrl: string,
    offset: number | undefined,
    signal: AbortSignal
  ): Promise<unknown[]> {
    const response = await fetch(`${apiBaseUrl}/bot${botToken}/getUpdates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        timeout: LONG_POLL_TIMEOUT_SECONDS,
        offset
      }),
      signal
    })

    if (!response.ok) {
      throw new Error(`getUpdates failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TelegramApiResponse<unknown[]>
    if (!payload.ok) {
      throw new Error(`getUpdates failed: ${payload.description || "unknown error"}`)
    }
    if (!Array.isArray(payload.result)) {
      return []
    }

    return payload.result
  }

  private async dispatchUpdate(bot: Chat, update: unknown): Promise<void> {
    const updateId = this.extractUpdateId(update)
    const updateType = this.extractUpdateType(update)

    this.logInfo("Dispatching update", {
      updateId,
      updateType
    })

    const startedAt = Date.now()
    const request = new Request("http://localhost/telegram-long-polling", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(update)
    })

    const response = await bot.webhooks.telegram(request)
    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      const responseText = await response.text().catch(() => "")
      console.warn(
        `[TelegramBotService] Telegram webhook handler returned ${response.status}: ${responseText}`
      )
      this.logInfo("Update dispatch failed", {
        updateId,
        updateType,
        status: response.status,
        durationMs
      })
      return
    }

    this.logInfo("Update dispatched successfully", {
      updateId,
      updateType,
      status: response.status,
      durationMs
    })
  }

  private async handleIncomingMessage(
    thread: TelegramThread,
    message: TelegramMessage
  ): Promise<void> {
    this.logInfo("Incoming message received", {
      threadId: thread.id,
      isMe: Boolean(message.author?.isMe),
      hasText: Boolean(message.text?.trim()),
      textPreview: this.toTextPreview(message.text)
    })

    if (message.author?.isMe) {
      this.logInfo("Ignoring self-authored message", {
        threadId: thread.id
      })
      return
    }

    const text = message.text?.trim()
    if (!text) {
      this.logInfo("Ignoring message without text", {
        threadId: thread.id
      })
      return
    }

    const selectedModel = this.channelRuntimeConfigService.getSelectedModel()
    if (!selectedModel) {
      this.logInfo("No selected model, sending user guidance", {
        threadId: thread.id
      })
      await this.postToThread(
        thread,
        "No model is selected in Mind Flayer. Please select one and try again.",
        "missing_selected_model"
      )
      return
    }

    if (!this.providerService.hasConfig(selectedModel.provider)) {
      this.logInfo("Model provider is not configured", {
        threadId: thread.id,
        provider: selectedModel.provider
      })
      await this.postToThread(
        thread,
        `Selected model provider '${selectedModel.provider}' is not configured in Mind Flayer settings.`,
        "missing_provider_config"
      )
      return
    }

    let model: LanguageModel
    try {
      model = this.providerService.createModel(selectedModel.provider, selectedModel.modelId)
    } catch (error) {
      await this.postToThread(
        thread,
        `Failed to load model '${selectedModel.modelId}'. Please verify your model settings in Mind Flayer.`,
        "model_create_failed"
      )
      console.error("[TelegramBotService] Failed to create model:", error)
      return
    }

    const sessionKey = `telegram:${thread.id}`
    const history = this.sessionMessages.get(sessionKey) ?? []
    const messagesWithLatestInput = this.trimSessionMessages([
      ...history,
      this.createTextMessage("user", text)
    ])
    this.sessionMessages.set(sessionKey, messagesWithLatestInput)

    this.logInfo("Prepared session context", {
      threadId: thread.id,
      sessionKey,
      historyCount: history.length,
      inputChars: text.length,
      contextCount: messagesWithLatestInput.length,
      selectedModel: `${selectedModel.provider}/${selectedModel.modelId}`
    })

    try {
      const tools = this.toolService.getRequestTools({
        useWebSearch: false,
        chatId: this.toSafeToolSessionId(sessionKey),
        includeBashExecution: false
      })
      const toolChoice = buildToolChoice({
        useWebSearch: false,
        webSearchMode: "auto",
        messages: messagesWithLatestInput
      })
      const modelMessages = await processMessages(messagesWithLatestInput, tools)

      this.logInfo("Starting assistant generation", {
        threadId: thread.id,
        sessionKey,
        toolCount: Object.keys(tools).length,
        modelMessageCount: modelMessages.length
      })

      const result = streamText({
        model,
        system: buildSystemPrompt(),
        messages: modelMessages,
        tools,
        toolChoice,
        stopWhen: Object.keys(tools).length > 0 ? stepCountIs(20) : stepCountIs(1)
      })

      let assistantText = ""
      let chunkCount = 0
      const textStream = this.captureTextStream(result.textStream, chunk => {
        assistantText += chunk
        chunkCount += 1
      })

      await this.postToThread(thread, textStream, "assistant_stream")

      const normalizedAssistantText = assistantText.trim()
      if (!normalizedAssistantText) {
        const fallbackText = "I could not generate a response. Please try again."
        this.logInfo("Assistant stream finished with empty content, sending fallback", {
          threadId: thread.id,
          sessionKey,
          chunkCount
        })
        await this.postToThread(thread, fallbackText, "assistant_empty_fallback")
        this.sessionMessages.set(
          sessionKey,
          this.trimSessionMessages([
            ...messagesWithLatestInput,
            this.createTextMessage("assistant", fallbackText)
          ])
        )
        return
      }

      const updatedMessages = this.trimSessionMessages([
        ...messagesWithLatestInput,
        this.createTextMessage("assistant", normalizedAssistantText)
      ])
      this.sessionMessages.set(sessionKey, updatedMessages)

      this.logInfo("Assistant response stored", {
        threadId: thread.id,
        sessionKey,
        chunkCount,
        outputChars: normalizedAssistantText.length,
        contextCount: updatedMessages.length
      })
    } catch (error) {
      console.error("[TelegramBotService] Failed to process message:", error)
      this.logInfo("Message processing failed", {
        threadId: thread.id,
        sessionKey
      })
      await this.postToThread(
        thread,
        "Error: Failed to generate response. Please try again.",
        "assistant_error_fallback"
      )
    }
  }

  private async postToThread(
    thread: TelegramThread,
    payload: string | AsyncIterable<string>,
    context: string
  ): Promise<void> {
    const mode = typeof payload === "string" ? "text" : "stream"
    this.logInfo("Telegram send start", {
      threadId: thread.id,
      context,
      mode,
      textPreview: typeof payload === "string" ? this.toTextPreview(payload) : undefined
    })

    try {
      await thread.post(payload)
      this.logInfo("Telegram send success", {
        threadId: thread.id,
        context,
        mode
      })
    } catch (error) {
      console.error("[TelegramBotService] Telegram send failed:", error)
      this.logInfo("Telegram send failed", {
        threadId: thread.id,
        context,
        mode
      })
      throw error
    }
  }

  private createTextMessage(role: "user" | "assistant", text: string): UIMessage {
    return {
      id: crypto.randomUUID(),
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

  private captureTextStream(
    source: AsyncIterable<string>,
    onChunk: (chunk: string) => void
  ): AsyncIterable<string> {
    return (async function* () {
      for await (const chunk of source) {
        onChunk(chunk)
        yield chunk
      }
    })()
  }

  private toSafeToolSessionId(rawSessionKey: string): string {
    const normalized = rawSessionKey
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120)

    return normalized || "telegram_session"
  }

  private extractUpdateId(update: unknown): number | null {
    if (
      typeof update === "object" &&
      update !== null &&
      "update_id" in update &&
      typeof (update as { update_id: unknown }).update_id === "number"
    ) {
      return (update as { update_id: number }).update_id
    }

    return null
  }

  private extractUpdateType(update: unknown): string {
    if (typeof update !== "object" || update === null) {
      return "unknown"
    }

    const updateRecord = update as Record<string, unknown>
    if ("message" in updateRecord) {
      return "message"
    }
    if ("edited_message" in updateRecord) {
      return "edited_message"
    }
    if ("channel_post" in updateRecord) {
      return "channel_post"
    }
    if ("edited_channel_post" in updateRecord) {
      return "edited_channel_post"
    }
    if ("callback_query" in updateRecord) {
      return "callback_query"
    }
    if ("inline_query" in updateRecord) {
      return "inline_query"
    }

    return "unknown"
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
