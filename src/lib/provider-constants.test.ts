import { describe, expect, it } from "vitest"
import {
  ALL_PROVIDERS,
  DEFAULT_FORM_DATA,
  MODEL_PROVIDERS,
  sortProvidersByAvailabilityAndName,
  UPCOMING_PROVIDERS
} from "@/lib/provider-constants"

const expectedMinimaxPricing = {
  "MiniMax-M2.5": {
    currency: "CNY",
    input: 2.1,
    output: 8.4,
    cachedRead: 0.21,
    cachedWrite: 2.625
  },
  "MiniMax-M2.5-highspeed": {
    currency: "CNY",
    input: 4.2,
    output: 16.8,
    cachedRead: 0.21,
    cachedWrite: 2.625
  },
  "MiniMax-M2.1": {
    currency: "CNY",
    input: 2.1,
    output: 8.4,
    cachedRead: 0.21,
    cachedWrite: 2.625
  },
  "MiniMax-M2.1-highspeed": {
    currency: "CNY",
    input: 4.2,
    output: 16.8,
    cachedRead: 0.21,
    cachedWrite: 2.625
  }
} as const

const expectedModelProviderCatalog = {
  minimax: {
    name: "MiniMax",
    defaultBaseUrl: "https://api.minimaxi.com/anthropic/v1",
    modelIds: Object.keys(expectedMinimaxPricing)
  },
  openai: {
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelIds: ["gpt-5.4-pro", "gpt-5.4", "gpt-5.3-chat-latest"]
  },
  anthropic: {
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    modelIds: ["claude-opus-4-6", "claude-sonnet-4-6"]
  }
} as const

describe("MODEL_PROVIDERS minimax pricing", () => {
  it("matches the expected minimax model set and excludes M2-her", () => {
    const minimaxProvider = MODEL_PROVIDERS.find(provider => provider.id === "minimax")

    expect(minimaxProvider).toBeDefined()
    if (!minimaxProvider) {
      return
    }

    const modelIds = (minimaxProvider.models ?? []).map(model => model.api_id).sort()
    const expectedModelIds = Object.keys(expectedMinimaxPricing).sort()

    expect(modelIds).toEqual(expectedModelIds)
    expect(modelIds).not.toContain("M2-her")
  })

  it("uses CNY pricing and expected values for all minimax models", () => {
    const minimaxProvider = MODEL_PROVIDERS.find(provider => provider.id === "minimax")

    expect(minimaxProvider).toBeDefined()
    if (!minimaxProvider) {
      return
    }

    for (const model of minimaxProvider.models ?? []) {
      const expectedPricing =
        expectedMinimaxPricing[model.api_id as keyof typeof expectedMinimaxPricing]

      expect(expectedPricing).toBeDefined()
      expect(model.pricing).toEqual(expectedPricing)
      expect(model.pricing?.currency).toBe("CNY")
    }
  })
})

describe("MODEL_PROVIDERS supported providers", () => {
  it("includes openai and anthropic as active model providers", () => {
    const providerIds = MODEL_PROVIDERS.map(provider => provider.id)

    expect(providerIds).toContain("openai")
    expect(providerIds).toContain("anthropic")
  })

  it("pins the exact catalog metadata for active model providers", () => {
    for (const [providerId, expected] of Object.entries(expectedModelProviderCatalog)) {
      const provider = MODEL_PROVIDERS.find(item => item.id === providerId)

      expect(provider).toBeDefined()
      expect(provider?.id).toBe(providerId)
      expect(provider?.name).toBe(expected.name)
      expect(provider?.defaultBaseUrl).toBe(expected.defaultBaseUrl)
      expect(provider?.models?.map(model => model.api_id)).toEqual(expected.modelIds)
    }
  })

  it("does not keep openai or anthropic in upcoming providers", () => {
    const upcomingProviderIds = UPCOMING_PROVIDERS.map(provider => provider.id)

    expect(upcomingProviderIds).not.toContain("openai")
    expect(upcomingProviderIds).not.toContain("anthropic")
  })

  it("does not mark openai or anthropic as disabled", () => {
    const openaiProvider = MODEL_PROVIDERS.find(provider => provider.id === "openai")
    const anthropicProvider = MODEL_PROVIDERS.find(provider => provider.id === "anthropic")

    expect(openaiProvider?.disabled ?? false).toBe(false)
    expect(anthropicProvider?.disabled ?? false).toBe(false)
  })
})

describe("DEFAULT_FORM_DATA", () => {
  it("includes form entries for all providers", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(DEFAULT_FORM_DATA[provider.id]).toEqual({
        apiKey: "",
        baseUrl: ""
      })
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
