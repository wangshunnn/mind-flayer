import type { ToolUIPart } from "ai"
import { describe, expect, it } from "vitest"
import { getToolCallMeta, getToolResultText } from "@/lib/tool-helpers"

const toolConstants = {
  names: {},
  states: {
    running: "Running...",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
    awaitingApproval: "Awaiting approval..."
  },
  webSearch: {
    searching: "Searching...",
    searchedResults: (count: number) => `Searched ${count} results`,
    approvalText: (objective: string) => objective
  },
  read: {
    input: (filePath: string) => filePath,
    inputWithOffset: (filePath: string, offset: number) => `${filePath} (offset ${offset})`,
    complete: "Read complete",
    chunk: (nextOffset: number) => `Read chunk, next offset ${nextOffset}`,
    fileDescription: (filePath: string) => filePath,
    fileDescriptionWithOffset: (filePath: string, offset: number) =>
      `${filePath} (offset ${offset})`,
    emptyFile: "[empty file]",
    nextOffset: (nextOffset: number) => `Next offset: ${nextOffset}`
  },
  bashExecution: {
    exitCode: (code: number) => `Exit ${code}`
  },
  agentSession: {
    status: (status: string) => status,
    nextOffset: (nextOffset: number) => `Next offset: ${nextOffset}`
  },
  skillRead: {
    badge: "Skill",
    loaded: (skillName: string) => `Loaded skill ${skillName}`,
    chunk: (skillName: string, nextOffset: number) =>
      `Loaded part of skill ${skillName}, next offset ${nextOffset}`,
    fileKind: () => ""
  }
} as never

describe("getToolCallMeta", () => {
  it("shows the path and section for appendWorkspaceSection", () => {
    const part = {
      type: "tool-appendWorkspaceSection",
      toolCallId: "tool-1",
      state: "output-available",
      input: {
        path: "/Users/USERNAME/Library/Application Support/Mind Flayer/workspace/IDENTITY.md",
        sectionTitle: "Vibe",
        content: "- Calm and practical"
      },
      output: {
        path: "IDENTITY.md",
        sectionTitle: "Vibe",
        bytesWritten: 20,
        createdFile: false,
        createdSection: false
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("IDENTITY.md: Vibe")
  })

  it("shows the path and section for replaceWorkspaceSection", () => {
    const part = {
      type: "tool-replaceWorkspaceSection",
      toolCallId: "tool-4",
      state: "output-available",
      input: {
        path: "USER.md",
        sectionTitle: "Preferences",
        content: "- Preferred language: Chinese"
      },
      output: {
        path: "USER.md",
        sectionTitle: "Preferences",
        bytesWritten: 30
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("USER.md: Preferences")
  })

  it("shows the path for appendDailyMemory", () => {
    const part = {
      type: "tool-appendDailyMemory",
      toolCallId: "tool-5",
      state: "output-available",
      input: {
        path: "memory/2026-03-26.md",
        content: "- 10:30 Fact: preferred language is Chinese"
      },
      output: {
        path: "memory/2026-03-26.md",
        bytesWritten: 43,
        createdFile: false
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("memory/2026-03-26.md")
  })

  it("shows the path for deleteWorkspaceFile", () => {
    const part = {
      type: "tool-deleteWorkspaceFile",
      toolCallId: "tool-6",
      state: "output-available",
      input: {
        path: "BOOTSTRAP.md"
      },
      output: {
        path: "BOOTSTRAP.md",
        deleted: true
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("BOOTSTRAP.md")
  })

  it("shows the query for memorySearch", () => {
    const part = {
      type: "tool-memorySearch",
      toolCallId: "tool-2",
      state: "output-available",
      input: {
        query: "preferred language"
      },
      output: {
        query: "preferred language",
        totalResults: 1,
        results: [
          {
            path: "memory/2026-03-26.md",
            startLine: 1,
            endLine: 1,
            snippet: "preferred language",
            score: 42
          }
        ]
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("preferred language")
  })

  it("shows a workspace-relative path for memoryGet", () => {
    const part = {
      type: "tool-memoryGet",
      toolCallId: "tool-3",
      state: "output-available",
      input: {
        path: "file:///Users/USERNAME/Library/Application%20Support/Mind%20Flayer/workspace/memory/2026-03-26.md"
      },
      output: {
        path: "memory/2026-03-26.md",
        absolutePath:
          "/Users/USERNAME/Library/Application Support/Mind Flayer/workspace/memory/2026-03-26.md",
        exists: true,
        content: "User prefers concise replies.",
        startLine: 1,
        endLine: 1
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe("memory/2026-03-26.md")
  })

  it("shows agent session start context", () => {
    const part = {
      type: "tool-agentSessionStart",
      toolCallId: "tool-7",
      state: "output-available",
      input: {
        agent: "codex",
        mode: "exec",
        cwd: "/Users/USERNAME/project"
      }
    } as unknown as ToolUIPart

    expect(getToolCallMeta(part, toolConstants)?.content).toBe(
      "codex exec: /Users/USERNAME/project"
    )
  })
})

describe("getToolResultText", () => {
  it("maps bash exit code 0 to done", () => {
    const part = {
      type: "tool-bashExecution",
      toolCallId: "tool-bash-success",
      state: "output-available",
      output: {
        command: "pwd",
        args: [],
        stdout: "/tmp",
        stderr: "",
        exitCode: 0,
        workingDir: "/tmp",
        executedAt: "2026-03-17T12:00:00.000Z"
      }
    } as unknown as ToolUIPart

    expect(getToolResultText(part, toolConstants)).toBe("Done")
  })

  it("maps non-zero bash exit codes to failed", () => {
    const part = {
      type: "tool-bashExecution",
      toolCallId: "tool-bash-failed",
      state: "output-available",
      output: {
        command: "cat",
        args: ["missing.txt"],
        stdout: "",
        stderr: "missing",
        exitCode: 1,
        workingDir: "/tmp",
        executedAt: "2026-03-17T12:00:00.000Z"
      }
    } as unknown as ToolUIPart

    expect(getToolResultText(part, toolConstants)).toBe("Failed")
  })
})
