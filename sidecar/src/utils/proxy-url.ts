const PROXY_ENV_KEYS = [
  "MINDFLAYER_PROXY_URL",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "https_proxy",
  "http_proxy"
] as const

const URL_WITH_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//
const PORT_ONLY_RE = /^\d{1,5}$/
const HOST_PORT_RE = /^(?:\[[^\]]+\]|[^:/?#\s]+):\d{1,5}$/

export function getRawConfiguredProxyUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const key of PROXY_ENV_KEYS) {
    const value = env[key]
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

export function normalizeProxyUrl(proxyUrl: string): string {
  const trimmedProxyUrl = proxyUrl.trim()

  if (URL_WITH_SCHEME_RE.test(trimmedProxyUrl)) {
    return trimmedProxyUrl
  }

  if (PORT_ONLY_RE.test(trimmedProxyUrl)) {
    return `http://127.0.0.1:${trimmedProxyUrl}`
  }

  if (trimmedProxyUrl.startsWith(":") && PORT_ONLY_RE.test(trimmedProxyUrl.slice(1))) {
    return `http://127.0.0.1${trimmedProxyUrl}`
  }

  if (HOST_PORT_RE.test(trimmedProxyUrl)) {
    return `http://${trimmedProxyUrl}`
  }

  return trimmedProxyUrl
}

export function getConfiguredProxyUrl(env: NodeJS.ProcessEnv = process.env): {
  rawProxyUrl: string | null
  proxyUrl: string | null
} {
  const rawProxyUrl = getRawConfiguredProxyUrl(env)

  if (!rawProxyUrl) {
    return {
      rawProxyUrl: null,
      proxyUrl: null
    }
  }

  return {
    rawProxyUrl,
    proxyUrl: normalizeProxyUrl(rawProxyUrl)
  }
}
