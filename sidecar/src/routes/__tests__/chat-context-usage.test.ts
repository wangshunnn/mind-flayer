import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import { ChannelRuntimeConfigService } from "../../services/channel-runtime-config-service"
import { handleChat } from "../chat"

const provider = vi.hoisted(() => ({ hasConfig: vi.fn(() => false), createModel: vi.fn() }))
vi.mock("../../services/provider-service", () => ({ providerService: provider }))
vi.mock("../../services/tool-service", () => ({ toolService: { getRequestTools: () => ({}) } }))
vi.mock("../../skills/catalog", () => ({
  discoverSkillsSafely: async () => [],
  filterDisabledSkills: () => []
}))
vi.mock("../../workspace", () => ({ loadWorkspacePromptContextSafely: async () => undefined }))

describe("context usage inspection route", () => {
  it("works without provider credentials and never creates a model", async () => {
    const app = new Hono()
    app.post("/api/chat/context-usage", c =>
      handleChat(c, new AbortController(), new ChannelRuntimeConfigService())
    )
    const response = await app.request("/api/chat/context-usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "old-chat",
        provider: "openai",
        model: "gpt-5.3-chat-latest",
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [{ type: "text", text: "Legacy response" }],
            metadata: { totalUsage: { inputTokens: 900000 } }
          }
        ]
      })
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as { usage: { source: string; tokens: number } }
    expect(result.usage.source).toBe("estimated")
    expect(result.usage.tokens).toBeLessThan(10000)
    expect(provider.hasConfig).not.toHaveBeenCalled()
    expect(provider.createModel).not.toHaveBeenCalled()
  })
})
