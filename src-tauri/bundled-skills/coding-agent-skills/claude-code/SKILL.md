---
name: claude-code
description: Delegate coding tasks to Claude Code from Mind Flayer. Use for feature work, refactoring, code review, and iterative coding when the claude CLI is installed.
metadata:
  icon: assets/icon.svg
  requires:
    bins: ["claude"]
---

# Claude Code Delegation

Use this skill when the user wants Mind Flayer to delegate coding work to Claude Code, Anthropic's autonomous coding CLI.

## Prerequisites

- Install: `npm install -g @anthropic-ai/claude-code`
- Authenticate once with `claude`, `claude auth login --console`, or `ANTHROPIC_API_KEY`
- Check installation with `claude --version`
- Check auth with `claude auth status`

## Tools

Use Mind Flayer's controlled agent session tools:

- `agentSessionStart` starts a Claude Code process.
- `agentSessionRead` reads output from a background non-interactive job.
- `agentSessionStop` stops a running background job.

These tools only build supported Claude Code commands. Do not try to run arbitrary shell commands through them.
Mind Flayer chat does not support Claude Code interactive TUI sessions; use `print`.

## Preferred Mode: Print

For one-shot work, use `agentSessionStart` with:

```json
{
  "agent": "claude-code",
  "mode": "print",
  "cwd": "/absolute/path/to/project",
  "prompt": "Fix the failing auth tests and explain the changes.",
  "runMode": "foreground",
  "permissionPreset": "workspace-write",
  "timeoutSeconds": 300
}
```

Use print mode for:

- Focused bug fixes
- Small features
- Refactors with clear scope
- Code review summaries
- Running a bounded investigation

Prefer `permissionPreset: "read-only"` for reviews and analysis. Use `workspace-write` only when edits are intended.

## Background Jobs

For long-running non-interactive tasks, set `runMode` to `background`, then poll with
`agentSessionRead`. Stop abandoned jobs with `agentSessionStop`.

## Safety

- Always set `cwd` to the exact project directory.
- Do not use the Mind Flayer shared workspace root as a coding-agent project directory.
- Do not use permission bypass modes unless the user explicitly asks and accepts the risk.
- Do not delegate secrets handling unless the user explicitly requested it.
- Summarize what Claude Code did, including changed files and tests run.

## Useful Claude Code Patterns

- Review only: use `permissionPreset: "read-only"`.
- Plan only: use `permissionPreset: "plan"`.
- Write code: use `permissionPreset: "workspace-write"`.
- Add extra repo directories with `extraAllowedDirs` only when the task needs them.

## After Delegation

When a session completes:

1. Read the final output with `agentSessionRead`.
2. Inspect local changes yourself before reporting success.
3. Run the relevant project checks.
4. Report the outcome and any residual risk to the user.
