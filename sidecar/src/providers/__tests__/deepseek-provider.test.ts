import { beforeEach, describe, expect, it, vi } from "vitest"
import { MODEL_PROVIDERS } from "../../config/constants"
import type { ProviderConfig } from "../../type"
import { DeepSeekProvider } from "../deepseek-provider"

const { createDeepSeekMock, deepSeekModelFactoryMock } = vi.hoisted(() => ({
  createDeepSeekMock: vi.fn(),
  deepSeekModelFactoryMock: vi.fn()
}))

vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: createDeepSeekMock
}))

describe("DeepSeekProvider", () => {
  beforeEach(() => {
    createDeepSeekMock.mockReset()
    deepSeekModelFactoryMock.mockReset()

    createDeepSeekMock.mockReturnValue(deepSeekModelFactoryMock)
    deepSeekModelFactoryMock.mockImplementation((modelId: string) => ({
      provider: "deepseek",
      modelId
    }))
  })

  it("should have correct name", () => {
    const provider = new DeepSeekProvider()
    expect(provider.name).toBe("deepseek")
  })

  describe("createModel", () => {
    it("passes the API key and selected model ID to createDeepSeek", () => {
      const provider = new DeepSeekProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }
      const modelId = "deepseek-v4-flash"

      const model = provider.createModel(modelId, config)

      expect(createDeepSeekMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: MODEL_PROVIDERS.deepseek.defaultBaseUrl
      })
      expect(deepSeekModelFactoryMock).toHaveBeenCalledWith(modelId)
      expect(model).toEqual({
        provider: "deepseek",
        modelId
      })
    })

    it("uses a custom base URL when provided", () => {
      const provider = new DeepSeekProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://custom.deepseek.example"
      }
      const modelId = "deepseek-v4-pro"

      provider.createModel(modelId, config)

      expect(createDeepSeekMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      expect(deepSeekModelFactoryMock).toHaveBeenCalledWith(modelId)
    })

    it("falls back to the default base URL when one is not provided", () => {
      const provider = new DeepSeekProvider()
      const config: ProviderConfig = {
        apiKey: "test-api-key"
      }
      const modelId = "deepseek-v4-pro"

      provider.createModel(modelId, config)

      expect(createDeepSeekMock).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: MODEL_PROVIDERS.deepseek.defaultBaseUrl
      })
      expect(deepSeekModelFactoryMock).toHaveBeenCalledWith(modelId)
    })
  })
})
