import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import { ChannelRuntimeConfigService } from "../../services/channel-runtime-config-service"
import { handleChannelRuntimeConfig } from "../channel-runtime-config"

describe("channel runtime config routes", () => {
  it("accepts payloads that omit disabledSkills and preserves the existing values", async () => {
    const app = new Hono()
    const channelRuntimeConfigService = new ChannelRuntimeConfigService()
    const telegramBotService = {
      refresh: vi.fn(async () => {})
    }

    channelRuntimeConfigService.update({
      selectedModel: { provider: "minimax", modelId: "model-a" },
      channels: {
        telegram: {
          enabled: true,
          allowedUserIds: ["1001"]
        }
      },
      disabledSkills: ["user:writer"]
    })

    app.post("/api/channel-runtime-config", c =>
      handleChannelRuntimeConfig(c, channelRuntimeConfigService, telegramBotService as never)
    )

    const res = await app.request("/api/channel-runtime-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        selectedModel: { provider: "minimax", modelId: "model-b" },
        channels: {
          telegram: {
            enabled: false,
            allowedUserIds: ["1002"]
          }
        }
      })
    })

    expect(res.status).toBe(200)
    expect(channelRuntimeConfigService.getConfig()).toMatchObject({
      selectedModel: { provider: "minimax", modelId: "model-b" },
      channels: {
        telegram: {
          enabled: false,
          allowedUserIds: ["1002"]
        }
      },
      disabledSkills: ["user:writer"]
    })
    expect(telegramBotService.refresh).toHaveBeenCalledOnce()
  })
})
