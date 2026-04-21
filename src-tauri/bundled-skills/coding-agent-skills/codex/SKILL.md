---
name: codex
description: Delegate coding tasks to OpenAI Codex CLI from Mind Flayer. Use for feature work, refactoring, code review, and batch issue fixing when the codex CLI is installed.
metadata:
  icon: assets/icon.svg
  requires:
    bins: ["codex"]
---

# Codex CLI Delegation

Use this skill when the user wants Mind Flayer to delegate coding work to OpenAI Codex CLI.

## Prerequisites

- Install: `npm install -g @openai/codex`
- Authenticate with `codex login` or the supported OpenAI API key flow
- Check installation with `codex --version`
- Codex normally expects a git repository. Use `skipGitRepoCheck` only for scratch work.

## Tools

Use Mind Flayer's controlled agent session tools:

- `agentSessionStart` starts a Codex process.
- `agentSessionRead` reads output from a background non-interactive job.
- `agentSessionStop` stops a running background job.

These tools only build supported Codex commands. Do not try to run arbitrary shell commands through them.
Mind Flayer chat does not support Codex interactive TUI sessions; use `exec` or `review`.

## Preferred Mode: Exec

For one-shot work, use `agentSessionStart` with:

```json
{
  "agent": "codex",
  "mode": "exec",
  "cwd": "/absolute/path/to/project",
  "prompt": "Implement the requested feature and run relevant tests.",
  "runMode": "foreground",
  "permissionPreset": "workspace-write",
  "timeoutSeconds": 300
}
```

Use exec mode for:

- Focused bug fixes
- Feature implementation
- Refactors
- Test generation
- Bounded repo investigations

Prefer `permissionPreset: "read-only"` for analysis. Use `workspace-write` only when edits are intended.

## Review Mode

For code review, use:

```json
{
  "agent": "codex",
  "mode": "review",
  "cwd": "/absolute/path/to/project",
  "prompt": "Review the current changes for correctness, regressions, and missing tests.",
  "runMode": "foreground",
  "permissionPreset": "read-only",
  "timeoutSeconds": 300
}
```

## Background Jobs

For long-running non-interactive tasks, set `runMode` to `background`, then poll with
`agentSessionRead`. Stop abandoned jobs with `agentSessionStop`.

## Safety

- Always set `cwd` to the exact project directory.
- Do not use the Mind Flayer shared workspace root as a coding-agent project directory.
- Do not use dangerous bypass modes unless the user explicitly asks and accepts the risk.
- Keep Codex in read-only mode for reviews.
- Summarize what Codex did, including changed files and tests run.

## After Delegation

When a session completes:

1. Read the final output with `agentSessionRead`.
2. Inspect local changes yourself before reporting success.
3. Run the relevant project checks.
4. Report the outcome and any residual risk to the user.
