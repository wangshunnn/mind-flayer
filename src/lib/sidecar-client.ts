import { invoke } from "@tauri-apps/api/core"

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

export interface ChannelRuntimeConfigPayload {
  selectedModel: {
    provider: string
    modelId: string
  } | null
  channels: {
    telegram: {
      enabled: boolean
    }
  }
}

export async function syncChannelRuntimeConfig(
  payload: ChannelRuntimeConfigPayload
): Promise<void> {
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
