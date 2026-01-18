import type { webSearchTool } from "./web-search"

export { webSearchTool } from "./web-search"

export type AllTools = { webSearch?: ReturnType<typeof webSearchTool> }
