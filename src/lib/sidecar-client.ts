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
