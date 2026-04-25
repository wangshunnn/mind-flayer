import type { UIMessage } from "ai"
import { describe, expect, it, vi } from "vitest"
import {
  buildDeepSeekReasoningReplayMap,
  createDeepSeekReasoningReplayFetch,
  patchDeepSeekReasoningRequestBody
} from "../deepseek-reasoning-replay"

function createDeepSeekToolTurnMessages(): UIMessage[] {
  return [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "How is the weather?" }]
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Need to look up the weather.", state: "done" },
        { type: "text", text: "Let me check that." },
        {
          type: "tool-webSearch",
          toolCallId: "call-weather",
          state: "output-available",
          input: { query: "weather" },
          output: "Sunny"
        },
        { type: "step-start" },
        { type: "reasoning", text: "The tool returned sunny weather.", state: "done" },
        { type: "text", text: "It is sunny." }
      ]
    },
    {
      id: "user-2",
      role: "user",
      parts: [{ type: "text", text: "What about tomorrow?" }]
    }
  ] as UIMessage[]
}

function createDeepSeekRequestBody() {
  return {
    model: "deepseek-v4-pro",
    thinking: { type: "enabled" },
    messages: [
      { role: "user", content: "How is the weather?" },
      {
        role: "assistant",
        content: "Let me check that.",
        tool_calls: [
          {
            id: "call-weather",
            type: "function",
            function: {
              name: "webSearch",
              arguments: '{"query":"weather"}'
            }
          }
        ]
      },
      { role: "tool", tool_call_id: "call-weather", content: "Sunny" },
      { role: "assistant", content: "It is sunny." },
      { role: "user", content: "What about tomorrow?" }
    ]
  }
}

describe("deepseek reasoning replay", () => {
  it("patches reasoning_content back into DeepSeek thinking tool turns", () => {
    const replayMap = buildDeepSeekReasoningReplayMap(createDeepSeekToolTurnMessages())
    const patchedBody = patchDeepSeekReasoningRequestBody(
      JSON.stringify(createDeepSeekRequestBody()),
      replayMap
    )
    const parsed = JSON.parse(patchedBody) as ReturnType<typeof createDeepSeekRequestBody>

    expect(parsed.messages[1]).toMatchObject({
      role: "assistant",
      reasoning_content: "Need to look up the weather."
    })
    expect(parsed.messages[3]).toMatchObject({
      role: "assistant",
      reasoning_content: "The tool returned sunny weather."
    })
  })

  it("does not patch requests with disabled thinking", () => {
    const replayMap = buildDeepSeekReasoningReplayMap(createDeepSeekToolTurnMessages())
    const body = createDeepSeekRequestBody()
    body.thinking = { type: "disabled" }
    const bodyText = JSON.stringify(body)

    expect(patchDeepSeekReasoningRequestBody(bodyText, replayMap)).toBe(bodyText)
  })

  it("leaves unmatched assistant messages unchanged", () => {
    const replayMap = buildDeepSeekReasoningReplayMap(createDeepSeekToolTurnMessages())
    const body = createDeepSeekRequestBody()
    body.messages[1] = {
      role: "assistant",
      content: "Different text",
      tool_calls: []
    }

    const patchedBody = patchDeepSeekReasoningRequestBody(JSON.stringify(body), replayMap)
    const parsed = JSON.parse(patchedBody) as ReturnType<typeof createDeepSeekRequestBody>

    expect(parsed.messages[1]).not.toHaveProperty("reasoning_content")
  })

  it("patches fetch request bodies before forwarding them", async () => {
    const fetchMock = vi.fn(
      async (
        _input: Parameters<typeof globalThis.fetch>[0],
        _init?: Parameters<typeof globalThis.fetch>[1]
      ) => {
        return new Response("ok")
      }
    )
    const replayFetch = createDeepSeekReasoningReplayFetch(
      createDeepSeekToolTurnMessages(),
      fetchMock
    )

    await replayFetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      body: JSON.stringify(createDeepSeekRequestBody())
    })

    const forwardedInit = fetchMock.mock.calls[0]?.[1]
    expect(typeof forwardedInit?.body).toBe("string")
    const parsed = JSON.parse(String(forwardedInit?.body)) as ReturnType<
      typeof createDeepSeekRequestBody
    >
    expect(parsed.messages[1]).toMatchObject({
      reasoning_content: "Need to look up the weather."
    })
  })
})
