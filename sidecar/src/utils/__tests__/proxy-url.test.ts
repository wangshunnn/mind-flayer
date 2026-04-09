import { describe, expect, it } from "vitest"
import { getConfiguredProxyUrl, getRawConfiguredProxyUrl, normalizeProxyUrl } from "../proxy-url"

describe("proxy-url", () => {
  it("returns null when no proxy environment variable is configured", () => {
    expect(getRawConfiguredProxyUrl({})).toBeNull()
    expect(getConfiguredProxyUrl({})).toEqual({
      rawProxyUrl: null,
      proxyUrl: null
    })
  })

  it("normalizes a bare port to a localhost http proxy url", () => {
    expect(normalizeProxyUrl("7897")).toBe("http://127.0.0.1:7897")
    expect(normalizeProxyUrl(":7897")).toBe("http://127.0.0.1:7897")
  })

  it("normalizes host and port values without a scheme", () => {
    expect(normalizeProxyUrl("localhost:7897")).toBe("http://localhost:7897")
    expect(normalizeProxyUrl("127.0.0.1:7897")).toBe("http://127.0.0.1:7897")
  })

  it("keeps fully qualified proxy urls unchanged", () => {
    expect(normalizeProxyUrl("http://127.0.0.1:7897")).toBe("http://127.0.0.1:7897")
    expect(normalizeProxyUrl("https://proxy.example.com:8443")).toBe(
      "https://proxy.example.com:8443"
    )
  })

  it("uses the highest priority configured environment variable", () => {
    expect(
      getConfiguredProxyUrl({
        HTTP_PROXY: "7897",
        MINDFLAYER_PROXY_URL: "localhost:1087"
      })
    ).toEqual({
      rawProxyUrl: "localhost:1087",
      proxyUrl: "http://localhost:1087"
    })
  })
})
