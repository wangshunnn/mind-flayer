import { tool } from "ai"
import { z } from "zod"

/**
 * Web search tool definition
 * This tool searches the web for current information
 */
export const webSearchTool = tool({
  description:
    "Search the web for current information. Use this tool when you need to find up-to-date information about topics, news, events, or any other information that may not be in your training data.",

  inputSchema: z.object({
    query: z.string().describe("The search query to look up on the web"),
    maxResults: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of search results to return")
  }),

  inputExamples: [
    { input: { query: "Latest technology news", maxResults: 10 } },
    { input: { query: "Weather forecast for New York", maxResults: 5 } }
  ],

  //   needsApproval: true, // Automatic approval for web search tool

  execute: async ({ query, maxResults }) => {
    console.log(`[sidecar] Executing web search for: "${query}" (max: ${maxResults} results)`)

    // TODO: Implement actual web search API integration (e.g., Tavily, Serper, Bing, etc.)
    // This is a mock implementation for demonstration
    const mockResults = [
      {
        title: `Search result 1 for "${query}"`,
        url: `https://example.com/result1?q=${encodeURIComponent(query)}`,
        snippet: `Another mock result demonstrating the web search functionality.`
      },
      {
        title: `Search result 2 for "${query}"`,
        url: `https://example.com/result2?q=${encodeURIComponent(query)}`,
        snippet: `Third mock search result with relevant information.`
      }
    ].slice(0, maxResults)

    return {
      query,
      results: mockResults,
      totalResults: mockResults.length,
      searchedAt: new Date().toISOString()
    }
  }
})
