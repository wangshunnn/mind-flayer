export const ZAI_PROVIDER_ID = "zhipu"

export type ZaiConnectionPresetId =
  | "cn-api"
  | "cn-coding-plan"
  | "international-api"
  | "international-coding-plan"

export type ZaiConnectionChoice = ZaiConnectionPresetId | "custom"

export interface ZaiConnectionPreset {
  id: ZaiConnectionPresetId
  baseUrl: string
  codingPlan: boolean
  credentialUrl: string
  documentationUrl: string
}

export const ZAI_CONNECTION_PRESETS = [
  {
    id: "cn-api",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    codingPlan: false,
    credentialUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    documentationUrl: "https://docs.bigmodel.cn/cn/api/introduction"
  },
  {
    id: "cn-coding-plan",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    codingPlan: true,
    credentialUrl: "https://docs.bigmodel.cn/cn/coding-plan/quick-start",
    documentationUrl: "https://docs.bigmodel.cn/cn/coding-plan/quick-start"
  },
  {
    id: "international-api",
    baseUrl: "https://api.z.ai/api/paas/v4",
    codingPlan: false,
    credentialUrl: "https://z.ai/manage-apikey/apikey-list",
    documentationUrl: "https://docs.z.ai/api-reference/introduction"
  },
  {
    id: "international-coding-plan",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    codingPlan: true,
    credentialUrl: "https://docs.z.ai/devpack/quick-start",
    documentationUrl: "https://docs.z.ai/devpack/quick-start"
  }
] as const satisfies readonly ZaiConnectionPreset[]

export const DEFAULT_ZAI_CONNECTION_PRESET = ZAI_CONNECTION_PRESETS[0]

const CHAT_COMPLETIONS_PATH = "/chat/completions"
const RESPONSES_PATH = "/responses"

export function normalizeZaiChatBaseUrl(baseUrl?: string): string {
  let normalizedBaseUrl = (baseUrl?.trim() || DEFAULT_ZAI_CONNECTION_PRESET.baseUrl).replace(
    /\/+$/,
    ""
  )

  if (normalizedBaseUrl.endsWith(CHAT_COMPLETIONS_PATH)) {
    normalizedBaseUrl = normalizedBaseUrl.slice(0, -CHAT_COMPLETIONS_PATH.length)
  }

  return normalizedBaseUrl
}

export function findZaiConnectionPreset(baseUrl?: string): ZaiConnectionPreset | undefined {
  const normalizedBaseUrl = normalizeZaiChatBaseUrl(baseUrl)
  return ZAI_CONNECTION_PRESETS.find(preset => preset.baseUrl === normalizedBaseUrl)
}

export function resolveZaiConnectionChoice(baseUrl?: string): ZaiConnectionChoice {
  return findZaiConnectionPreset(baseUrl)?.id ?? "custom"
}

export type ZaiBaseUrlValidationError = "invalidUrl" | "httpsRequired" | "responsesUnsupported"

export function validateZaiChatBaseUrl(baseUrl: string): ZaiBaseUrlValidationError | null {
  const normalizedBaseUrl = normalizeZaiChatBaseUrl(baseUrl)
  let parsedUrl: URL

  try {
    parsedUrl = new URL(normalizedBaseUrl)
  } catch {
    return "invalidUrl"
  }

  if (parsedUrl.protocol !== "https:") {
    return "httpsRequired"
  }

  if (parsedUrl.pathname.replace(/\/+$/, "").endsWith(RESPONSES_PATH)) {
    return "responsesUnsupported"
  }

  return null
}
