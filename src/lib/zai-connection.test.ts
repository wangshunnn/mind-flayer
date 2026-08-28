import { describe, expect, it } from "vitest"
import {
  DEFAULT_ZAI_CONNECTION_PRESET,
  findZaiConnectionPreset,
  normalizeZaiChatBaseUrl,
  resolveZaiConnectionChoice,
  validateZaiChatBaseUrl,
  ZAI_CONNECTION_PRESETS
} from "../../shared/zai-connection"

describe("Z.AI connection presets", () => {
  it("defines domestic and international API and Coding Plan endpoints", () => {
    expect(ZAI_CONNECTION_PRESETS.map(({ id, baseUrl }) => [id, baseUrl])).toEqual([
      ["cn-api", "https://open.bigmodel.cn/api/paas/v4"],
      ["cn-coding-plan", "https://open.bigmodel.cn/api/coding/paas/v4"],
      ["international-api", "https://api.z.ai/api/paas/v4"],
      ["international-coding-plan", "https://api.z.ai/api/coding/paas/v4"]
    ])
  })

  it("maps an empty legacy URL to the domestic API preset", () => {
    expect(resolveZaiConnectionChoice()).toBe("cn-api")
    expect(findZaiConnectionPreset()).toEqual(DEFAULT_ZAI_CONNECTION_PRESET)
  })

  it("normalizes trailing slashes and full Chat Completions URLs", () => {
    expect(normalizeZaiChatBaseUrl(" https://api.z.ai/api/coding/paas/v4/chat/completions/ ")).toBe(
      "https://api.z.ai/api/coding/paas/v4"
    )
    expect(resolveZaiConnectionChoice("https://api.z.ai/api/coding/paas/v4/chat/completions")).toBe(
      "international-coding-plan"
    )
  })

  it("preserves valid custom Chat Completions base URLs", () => {
    expect(resolveZaiConnectionChoice("https://proxy.example.com/v4")).toBe("custom")
    expect(validateZaiChatBaseUrl("https://proxy.example.com/v4")).toBeNull()
  })

  it("rejects invalid, insecure, and Responses URLs", () => {
    expect(validateZaiChatBaseUrl("not-a-url")).toBe("invalidUrl")
    expect(validateZaiChatBaseUrl("http://proxy.example.com/v4")).toBe("httpsRequired")
    expect(validateZaiChatBaseUrl("https://api.z.ai/api/v1/responses")).toBe("responsesUnsupported")
  })
})
