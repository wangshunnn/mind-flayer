import { tool } from "ai"
import Parallel from "parallel-web"
import { z } from "zod"
import type { ITool } from "./base-tool"

/**
 * Web search tool implementation using Parallel API.
 * Implements ITool interface for plugin architecture.
 */
export class WebSearchTool implements ITool {
  readonly name = "webSearch"

  createInstance(apiKey: string) {
    return webSearchTool(apiKey)
  }
}

/**
 * Web search tool definition factory
 * This tool searches the web for current information using Parallel Web Search API
 * @param apiKey - Parallel API key from keychain cache
 */
export const webSearchTool = (apiKey: string) => {
  if (!apiKey) {
    console.warn("[sidecar] Parallel API key not provided, web search will fail")
  }

  const parallelClient = new Parallel({ apiKey })

  return tool({
    description:
      "Search the web for current information. Use this tool when you need to find up-to-date information about topics, news, events, or any other information that may not be in your training data.",

    inputSchema: z.object({
      objective: z
        .string()
        .min(1)
        .max(5000)
        .describe(
          "Natural-language description of the web research goal, including source or freshness guidance and broader context from the task"
        ),
      searchQueries: z
        .array(z.string().max(200))
        .optional()
        .describe(
          "Optional search queries to supplement the objective. Maximum 200 characters per query"
        ),
      maxResults: z
        .number()
        .max(20)
        .optional()
        .default(10)
        .describe("Maximum number of search results to return")
    }),

    inputExamples: [
      {
        input: {
          objective: "I want to know when the UN was founded. Prefer UN's websites.",
          searchQueries: ["Founding year UN", "Year of founding United Nations"],
          maxResults: 10
        }
      },
      {
        input: {
          objective:
            "Find the latest technology news from the past week, focusing on AI and machine learning developments.",
          searchQueries: ["latest AI news", "machine learning 2026"],
          maxResults: 5
        }
      }
    ],

    execute: async ({ objective, searchQueries, maxResults }, { abortSignal }) => {
      console.log(
        `[sidecar] Executing web search for objective: "${objective}" (max: ${maxResults} results)`
      )

      try {
        // Use Parallel Web Search API with agentic mode
        const searchResponse = await parallelClient.beta.search(
          {
            mode: "agentic",
            objective,
            search_queries: searchQueries,
            max_results: maxResults,
            excerpts: {
              max_chars_per_result: 3000
            }
          },
          { signal: abortSignal }
        )

        // Transform Parallel results to our expected format
        const results = searchResponse.results.map(result => ({
          url: result.url || "",
          title: result.title || "",
          snippet: result.excerpts ?? "",
          publish_date: result.publish_date || ""
        }))

        return {
          objective,
          searchQueries,
          results,
          totalResults: results.length,
          searchedAt: new Date().toISOString()
        }
      } catch (error) {
        console.error("[sidecar] Web search failed:", error)
        throw new Error(
          `Web search failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      }
    }
  })
}
