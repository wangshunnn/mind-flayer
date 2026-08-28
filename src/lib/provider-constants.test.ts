import { describe, expect, it } from "vitest"
import {
  ALL_PROVIDERS,
  DEFAULT_FORM_DATA,
  findModelContextWindow,
  findModelPricing,
  MODEL_PROVIDERS,
  modelSupportsAttachments,
  modelSupportsMediaType,
  resolveModelReasoningSettings,
  sortProvidersByAvailabilityAndName,
  UPCOMING_PROVIDERS
} from "@/lib/provider-constants"

describe("MODEL_PROVIDERS minimax pricing", () => {
  const minimaxProvider = MODEL_PROVIDERS.find(provider => provider.id === "minimax")

  it("excludes M2-her from minimax models", () => {
    const modelIds = (minimaxProvider?.models ?? []).map(model => model.api_id)
    expect(modelIds).not.toContain("M2-her")
  })

  it("uses CNY currency for all priced minimax models", () => {
    for (const model of minimaxProvider?.models ?? []) {
      if (!model.pricing) {
        continue
      }

      expect(model.pricing?.currency).toBe("CNY")
    }
  })

  it("has valid numeric pricing fields for priced minimax models", () => {
    for (const model of minimaxProvider?.models ?? []) {
      if (!model.pricing) {
        continue
      }

      expect(model.pricing?.input).toBeGreaterThan(0)
      expect(model.pricing?.output).toBeGreaterThan(0)
      expect(model.pricing?.cachedRead).toBeGreaterThan(0)
      if (model.pricing.cachedWrite !== null) {
        expect(model.pricing.cachedWrite).toBeGreaterThan(0)
      }
    }
  })

  it("uses MiniMax-M3 standard low input-length pricing", () => {
    expect(findModelPricing("minimax", "MiniMax-M3")).toEqual({
      currency: "CNY",
      input: 2.1,
      output: 8.4,
      cachedRead: 0.42,
      cachedWrite: null
    })
  })
})

describe("MODEL_PROVIDERS supported providers", () => {
  it("includes openai, anthropic, deepseek, and zhipu as active model providers", () => {
    const providerIds = MODEL_PROVIDERS.map(provider => provider.id)

    expect(providerIds).toContain("openai")
    expect(providerIds).toContain("anthropic")
    expect(providerIds).toContain("deepseek")
    expect(providerIds).toContain("zhipu")
  })

  it("each active provider has name, defaultBaseUrl, and at least one model", () => {
    for (const provider of MODEL_PROVIDERS) {
      expect(provider.name).toBeTruthy()
      expect(provider.defaultBaseUrl).toMatch(/^https:\/\//)
      expect(provider.models?.length).toBeGreaterThan(0)
    }
  })

  it("pins the provider catalog via snapshot", () => {
    const catalog = MODEL_PROVIDERS.map(provider => ({
      id: provider.id,
      name: provider.name,
      defaultBaseUrl: provider.defaultBaseUrl,
      modelIds: provider.models?.map(model => model.api_id)
    }))

    expect(catalog).toMatchInlineSnapshot(`
      [
        {
          "defaultBaseUrl": "https://api.minimaxi.com/v1",
          "id": "minimax",
          "modelIds": [
            "MiniMax-M3",
            "MiniMax-M2.7",
            "MiniMax-M2.7-highspeed",
          ],
          "name": "MiniMax",
        },
        {
          "defaultBaseUrl": "https://api.openai.com/v1",
          "id": "openai",
          "modelIds": [
            "gpt-5.4-pro",
            "gpt-5.4",
            "gpt-5.3-chat-latest",
          ],
          "name": "OpenAI",
        },
        {
          "defaultBaseUrl": "https://api.anthropic.com/v1",
          "id": "anthropic",
          "modelIds": [
            "claude-opus-4-6",
            "claude-sonnet-4-6",
          ],
          "name": "Anthropic",
        },
        {
          "defaultBaseUrl": "https://api.deepseek.com",
          "id": "deepseek",
          "modelIds": [
            "deepseek-v4-flash",
            "deepseek-v4-pro",
          ],
          "name": "DeepSeek",
        },
        {
          "defaultBaseUrl": "https://open.bigmodel.cn/api/paas/v4",
          "id": "zhipu",
          "modelIds": [
            "glm-5.3",
            "glm-5.3-flash",
            "glm-5.2",
          ],
          "name": "Z.AI",
        },
      ]
    `)
  })

  it("does not keep openai, anthropic, deepseek, or zhipu in upcoming providers", () => {
    const upcomingProviderIds = UPCOMING_PROVIDERS.map(provider => provider.id)

    expect(upcomingProviderIds).not.toContain("openai")
    expect(upcomingProviderIds).not.toContain("anthropic")
    expect(upcomingProviderIds).not.toContain("deepseek")
    expect(upcomingProviderIds).not.toContain("zhipu")
  })

  it("does not mark openai, anthropic, deepseek, or zhipu as disabled", () => {
    const openaiProvider = MODEL_PROVIDERS.find(provider => provider.id === "openai")
    const anthropicProvider = MODEL_PROVIDERS.find(provider => provider.id === "anthropic")
    const deepSeekProvider = MODEL_PROVIDERS.find(provider => provider.id === "deepseek")
    const zhipuProvider = MODEL_PROVIDERS.find(provider => provider.id === "zhipu")

    expect(openaiProvider?.disabled ?? false).toBe(false)
    expect(anthropicProvider?.disabled ?? false).toBe(false)
    expect(deepSeekProvider?.disabled ?? false).toBe(false)
    expect(zhipuProvider?.disabled ?? false).toBe(false)
  })

  it("uses the domestic Z.AI base URL and current GLM model metadata", () => {
    const zhipuProvider = MODEL_PROVIDERS.find(provider => provider.id === "zhipu")

    expect(zhipuProvider).toEqual(
      expect.objectContaining({
        name: "Z.AI",
        defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
        apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
        models: [
          {
            label: "GLM-5.3",
            api_id: "glm-5.3",
            contextWindow: 1_000_000,
            inputModalities: ["text"],
            reasoningPolicy: {
              type: "always",
              supportedEfforts: ["default", "low", "high", "xhigh"]
            }
          },
          {
            label: "GLM-5.3-Flash",
            api_id: "glm-5.3-flash",
            contextWindow: 1_000_000,
            inputModalities: ["text", "image", "pdf"],
            reasoningPolicy: {
              type: "always",
              supportedEfforts: ["default", "low", "high", "xhigh"]
            }
          },
          {
            label: "GLM-5.2",
            api_id: "glm-5.2",
            contextWindow: 1_000_000,
            inputModalities: ["text"],
            reasoningPolicy: {
              type: "configurable",
              supportedEfforts: ["default", "low", "medium", "high", "xhigh"]
            }
          }
        ]
      })
    )
  })

  it("does not show pay-as-you-go pricing for region-dependent Z.AI connections", () => {
    expect(findModelPricing("zhipu", "glm-5.3")).toBeUndefined()
    expect(findModelPricing("zhipu", "glm-5.3-flash")).toBeUndefined()
    expect(findModelPricing("zhipu", "glm-5.2")).toBeUndefined()
  })

  it("uses current DeepSeek v4 pricing metadata", () => {
    const deepSeekProvider = MODEL_PROVIDERS.find(provider => provider.id === "deepseek")

    expect(deepSeekProvider?.models).toEqual([
      expect.objectContaining({
        api_id: "deepseek-v4-flash",
        contextWindow: 1_000_000,
        pricing: {
          currency: "USD",
          input: 0.14,
          output: 0.28,
          cachedRead: 0.028,
          cachedWrite: 0.14
        }
      }),
      expect.objectContaining({
        api_id: "deepseek-v4-pro",
        contextWindow: 1_000_000,
        pricing: {
          currency: "USD",
          input: 1.74,
          output: 3.48,
          cachedRead: 0.145,
          cachedWrite: 1.74
        }
      })
    ])
  })
})

describe("DEFAULT_FORM_DATA", () => {
  it("includes form entries for all providers", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(DEFAULT_FORM_DATA[provider.id]).toEqual(
        provider.id === "zhipu"
          ? { apiKey: "", baseUrl: "", connectionPreset: "cn-api" }
          : { apiKey: "", baseUrl: "" }
      )
    }
  })
})

describe("sortProvidersByAvailabilityAndName", () => {
  it("orders available providers first and sorts each group alphabetically", () => {
    const providers = [
      { id: "openai", name: "OpenAI" },
      { id: "anthropic", name: "Anthropic" },
      { id: "gemini", name: "Gemini", disabled: true },
      { id: "minimax", name: "MiniMax" }
    ]

    const sortedProviders = sortProvidersByAvailabilityAndName(providers, {
      openai: true,
      anthropic: false,
      gemini: true,
      minimax: true
    })

    expect(sortedProviders.map(provider => provider.id)).toEqual([
      "minimax",
      "openai",
      "anthropic",
      "gemini"
    ])
  })
})

describe("findModelContextWindow", () => {
  it("returns the configured context window for a known model", () => {
    expect(findModelContextWindow("openai", "gpt-5.4")).toBe(1_050_000)
    expect(findModelContextWindow("deepseek", "deepseek-v4-pro")).toBe(1_000_000)
    expect(findModelContextWindow("minimax", "MiniMax-M3")).toBe(1_000_000)
    expect(findModelContextWindow("zhipu", "glm-5.3")).toBe(1_000_000)
    expect(findModelContextWindow("zhipu", "glm-5.3-flash")).toBe(1_000_000)
    expect(findModelContextWindow("zhipu", "glm-5.2")).toBe(1_000_000)
  })

  it("returns undefined for unknown providers or models", () => {
    expect(findModelContextWindow("missing", "gpt-5.4")).toBeUndefined()
    expect(findModelContextWindow("openai", "missing")).toBeUndefined()
  })
})

describe("model capabilities", () => {
  it("restricts GLM-5.3 attachments and accepts images and PDFs for GLM-5.3-Flash", () => {
    const zhipu = MODEL_PROVIDERS.find(provider => provider.id === "zhipu")
    const glm53 = zhipu?.models?.find(model => model.api_id === "glm-5.3")
    const flash = zhipu?.models?.find(model => model.api_id === "glm-5.3-flash")

    expect(modelSupportsAttachments(glm53?.inputModalities)).toBe(false)
    expect(modelSupportsAttachments(flash?.inputModalities)).toBe(true)
    expect(modelSupportsMediaType(flash?.inputModalities, "image/png")).toBe(true)
    expect(modelSupportsMediaType(flash?.inputModalities, "application/pdf")).toBe(true)
    expect(modelSupportsMediaType(flash?.inputModalities, "video/mp4")).toBe(false)
  })

  it("forces always-reasoning models on without changing configurable model behavior", () => {
    const alwaysPolicy = {
      type: "always" as const,
      supportedEfforts: ["default", "low", "high", "xhigh"] as const
    }

    expect(resolveModelReasoningSettings(alwaysPolicy, false, "medium")).toEqual({
      enabled: true,
      effort: "high",
      locked: true
    })
    expect(resolveModelReasoningSettings(alwaysPolicy, false, "xhigh")).toEqual({
      enabled: true,
      effort: "xhigh",
      locked: true
    })
    expect(resolveModelReasoningSettings(undefined, false, "medium")).toEqual({
      enabled: false,
      effort: "medium",
      locked: false
    })
  })
})
