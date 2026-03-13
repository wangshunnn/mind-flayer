import { invoke } from "@tauri-apps/api/core"
import type { UIMessage } from "ai"

const DEFAULT_WAIT_TIMEOUT_MS = 15_000

let cachedSidecarPort: number | null = null
let sidecarPortPromise: Promise<number> | null = null

export async function getSidecarPort(timeoutMs = DEFAULT_WAIT_TIMEOUT_MS): Promise<number> {
  if (cachedSidecarPort !== null) {
    return cachedSidecarPort
  }

  if (!sidecarPortPromise) {
    sidecarPortPromise = invoke<number>("wait_for_sidecar_port", { timeoutMs })
      .then(port => {
        cachedSidecarPort = port
        return port
      })
      .finally(() => {
        sidecarPortPromise = null
      })
  }

  return sidecarPortPromise
}

export async function getSidecarUrl(
  path: string,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS
): Promise<string> {
  const port = await getSidecarPort(timeoutMs)
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `http://localhost:${port}${normalizedPath}`
}

export interface RuntimeConfigPayload {
  selectedModel: {
    provider: string
    modelId: string
  } | null
  channels: {
    telegram: {
      enabled: boolean
      allowedUserIds: string[]
    }
  }
  disabledSkills: string[]
}

export async function syncRuntimeConfig(payload: RuntimeConfigPayload): Promise<void> {
  const url = await getSidecarUrl("/api/channel-runtime-config")

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to sync channel runtime config (${response.status}): ${text}`)
  }
}

export type SkillSource = "bundled" | "user"

export interface SkillListItem {
  id: string
  name: string
  description: string
  source: SkillSource
  canUninstall: boolean
  location: string
  filePath: string
}

export interface SkillDetail extends SkillListItem {
  bodyMarkdown: string
}

export async function listSkills(): Promise<SkillListItem[]> {
  const url = await getSidecarUrl("/api/skills")
  const response = await fetch(url, {
    method: "GET"
  })

  if (!response.ok) {
    let details = ""
    try {
      const data = (await response.json()) as { error?: string }
      details = data.error || ""
    } catch {
      details = await response.text()
    }
    throw new Error(details || `Skills request failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    success: boolean
    skills: SkillListItem[]
  }

  return payload.skills ?? []
}

export async function getSkillDetail(skillId: string): Promise<SkillDetail> {
  const encodedSkillId = encodeURIComponent(skillId)
  const url = await getSidecarUrl(`/api/skills/${encodedSkillId}`)
  const response = await fetch(url, {
    method: "GET"
  })

  if (!response.ok) {
    let details = ""
    try {
      const data = (await response.json()) as { error?: string }
      details = data.error || ""
    } catch {
      details = await response.text()
    }
    throw new Error(details || `Skill detail request failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    success: boolean
    skill: SkillDetail
  }

  return payload.skill
}

export async function deleteSkill(skillId: string): Promise<void> {
  const encodedSkillId = encodeURIComponent(skillId)
  const url = await getSidecarUrl(`/api/skills/${encodedSkillId}`)
  const response = await fetch(url, {
    method: "DELETE"
  })

  if (!response.ok) {
    let details = ""
    try {
      const data = (await response.json()) as { error?: string }
      details = data.error || ""
    } catch {
      details = await response.text()
    }
    throw new Error(details || `Skill delete failed (${response.status})`)
  }
}

export interface TelegramConnectionTestResult {
  baseUrl: string
  bot: {
    id: number
    firstName: string
    username?: string
  }
}

export async function testTelegramConnection(): Promise<TelegramConnectionTestResult> {
  const url = await getSidecarUrl("/api/channels/telegram/test")
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  })

  if (!response.ok) {
    let details = ""
    try {
      const data = (await response.json()) as { error?: string }
      details = data.error || ""
    } catch {
      details = await response.text()
    }
    throw new Error(details || `Telegram test failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    success: boolean
    baseUrl: string
    bot: {
      id: number
      firstName: string
      username?: string
    }
  }

  return {
    baseUrl: payload.baseUrl,
    bot: payload.bot
  }
}

export interface TelegramChannelSessionSummary {
  sessionKey: string
  chatId: string
  updatedAt: number
  messageCount: number
  lastMessageRole: UIMessage["role"] | null
  lastMessagePreview: string
}

export interface TelegramChannelSessionsResult {
  sessions: TelegramChannelSessionSummary[]
}

export async function getTelegramChannelSessions(): Promise<TelegramChannelSessionsResult> {
  const url = await getSidecarUrl("/api/channels/telegram/sessions")
  const response = await fetch(url, {
    method: "GET"
  })

  if (!response.ok) {
    let details = ""
    try {
      const data = (await response.json()) as { error?: string }
      details = data.error || ""
    } catch {
      details = await response.text()
    }
    throw new Error(details || `Telegram sessions request failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    success: boolean
    sessions: TelegramChannelSessionSummary[]
  }

  return {
    sessions: payload.sessions ?? []
  }
}

export interface TelegramChannelSessionMessagesResult {
  sessionKey: string
  messages: UIMessage[]
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

export async function getTelegramChannelSessionMessages(
  sessionKey: string
): Promise<TelegramChannelSessionMessagesResult> {
  const encodedSessionKey = encodeURIComponent(sessionKey)
  const url = await getSidecarUrl(
    `/api/channels/telegram/session-messages?sessionKey=${encodedSessionKey}`
  )
  const response = await fetch(url, {
    method: "GET"
  })

  if (!response.ok) {
    let details = ""
    try {
      const data = (await response.json()) as { error?: string }
      details = data.error || ""
    } catch {
      details = await response.text()
    }
    throw new Error(details || `Telegram session messages request failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    success: boolean
    sessionKey: string
    messages: UIMessage[]
  }

  return {
    sessionKey: payload.sessionKey,
    messages: payload.messages ?? []
  }
}

export async function getTelegramWhitelistRequests(): Promise<TelegramWhitelistRequest[]> {
  const url = await getSidecarUrl("/api/channels/telegram/whitelist-requests")
  const response = await fetch(url, {
    method: "GET"
  })

  if (!response.ok) {
    let details = ""
    try {
      const data = (await response.json()) as { error?: string }
      details = data.error || ""
    } catch {
      details = await response.text()
    }
    throw new Error(details || `Telegram whitelist requests failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    success: boolean
    requests: TelegramWhitelistRequest[]
  }

  return payload.requests ?? []
}

export async function decideTelegramWhitelistRequest(
  requestId: string,
  decision: "approve" | "reject"
): Promise<void> {
  const url = await getSidecarUrl("/api/channels/telegram/whitelist-requests/decision")
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requestId,
      decision
    })
  })

  if (!response.ok) {
    let details = ""
    try {
      const data = (await response.json()) as { error?: string }
      details = data.error || ""
    } catch {
      details = await response.text()
    }
    throw new Error(details || `Telegram whitelist decision failed (${response.status})`)
  }
}

/**
 * Fire-and-forget LLM title generation via sidecar.
 * Returns the generated title on success, null on any error.
 */
export async function generateTitle(
  messageText: string,
  provider: string,
  modelId: string
): Promise<string | null> {
  try {
    const url = await getSidecarUrl("/api/title")
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Model-Provider": provider,
        "X-Model-Id": modelId
      },
      body: JSON.stringify({ messageText })
    })
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string }
    return data.title?.trim() || null
  } catch {
    return null
  }
}
