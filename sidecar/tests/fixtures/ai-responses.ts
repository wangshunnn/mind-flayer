/**
 * Test fixtures for AI streaming responses.
 * Used in tests to mock AI SDK behavior.
 */

export const mockStreamSuccess = {
  text: "Hello, how can I help you?",
  usage: {
    promptTokens: 10,
    completionTokens: 8,
    totalTokens: 18
  }
}

export const mockStreamWithToolCall = {
  text: "Let me search for that information.",
  toolCalls: [
    {
      toolName: "webSearch",
      args: {
        objective: "Find latest news",
        maxResults: 5
      }
    }
  ]
}

export const mockErrorAbort = new Error("Request aborted")
mockErrorAbort.name = "AbortError"

export const mockErrorNetwork = new Error("Network connection failed")
