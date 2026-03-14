# Rust Multi-Window AI Design

**Date**: 2026-03-15
**Status**: Draft

## Scope

This spec covers replacing the Node.js sidecar with native Rust in Tauri. It includes:
- Multi-window project sessions (VS Code + Claude Code style)
- All AI provider support (OpenAI, Anthropic, MiniMax)
- Full tool set (bash, read, write, edit, glob, grep, ls, web_search, web_fetch)
- Skills system (discovery, injection into system prompt)
- Telegram bot migration to Rust

Out of scope (separate spec): Feishu bot.

---

## Architecture

```
Window A (~/project-a)          Window B (~/project-b)
┌─────────────────┐             ┌─────────────────┐
│  React Frontend │             │  React Frontend │
│  useSession()   │             │  useSession()   │
└────────┬────────┘             └────────┬────────┘
         │ invoke / listen               │ invoke / listen
         └──────────────┬────────────────┘
                        ▼
             ┌────────────────────────┐
             │   Rust Core            │
             │                        │
             │  SessionManager        │  ← DashMap<window_label, WindowState>
             │  AiProvider trait      │  ← OpenAI / Anthropic / MiniMax
             │  ToolExecutor          │  ← 9 tools + approval flow
             │  SkillRegistry         │  ← discovery + system prompt injection
             │  ProjectStorage        │  ← JSONL per project folder
             │  TelegramBot           │  ← migrated from Node.js
             └────────────────────────┘
```

No HTTP layer. No sidecar process. All AI calls in Rust.

---

## Window & Project Rules

- One window = one project folder.
- Opening a folder already bound to an existing window → focus that window.
- Window label = UUID assigned at creation time (stable, no collision risk).
- `SessionManager` maps `window_label → WindowState` via `DashMap`.
- Closing a window → remove entry from `SessionManager`, cancel in-flight stream, cancel any pending tool approvals.
- Unlimited windows (memory-bound only).

---

## Storage Structure

Mirrors Claude Code's `~/.claude/projects/` layout:

```
AppData/                                  (Tauri BaseDirectory::AppData)
  projects/
    -Users-ny-Projects-myapp/             ← folder path, / replaced by -
      index.json                          ← Chat[] sorted by updated_at DESC
      {chatId}.jsonl                      ← one UIMessage JSON per line
    -Users-ny-Desktop-other/
      index.json
      {chatId}.jsonl
```

**Path encoding**: `/Users/ny/Projects/myapp` → `-Users-ny-Projects-myapp`

**Long path handling** (TBD — investigate Claude Code's exact scheme before implementing):
- Likely SHA-256 of full path, truncated to 16 hex chars with readable prefix
- A `projects/path-map.json` file maintains `{ encodedName → originalPath }` for debuggability
- Collision with normal-length paths is also handled via this map

**On window open**: load the chat with highest `updated_at` from `index.json`. If none exist, auto-create one.

**Migration**: existing `AppData/chats/` moves to a default project (user home folder).

**Message persistence**: save to JSONL on `stream:done`. If stream is cancelled mid-way, save messages received so far.

---

## Tauri Commands (Frontend → Rust)

### Project Management
```typescript
invoke("open_project", { folder: string })
// Focuses existing window if folder already open, else creates new window
// New window label = UUID generated at creation time
```

### Chat Management
```typescript
invoke("list_chats",        { folder })               // → Chat[]
invoke("create_chat",       { folder, title })        // → ChatId
invoke("delete_chat",       { folder, chatId })       // also cleans up bash workspace
invoke("update_chat_title", { folder, chatId, title })
invoke("load_messages",     { folder, chatId })       // → Message[]
invoke("generate_title",    { firstUserMessage })     // → string (pure, no side effects; caller persists via update_chat_title)
```

### AI Streaming
```typescript
invoke("start_chat_stream", {
  windowLabel,
  folder,
  chatId,
  messages,         // UIMessage[] from frontend
  model,            // e.g. "gpt-4o"
  provider,         // "openai" | "anthropic" | "minimax"
  enabledTools: string[],   // subset of available tools
  webSearchMode: "auto" | "always" | "never",
})

invoke("stop_chat_stream", { windowLabel })
```

### Tool Approval
```typescript
invoke("approve_tool_call", { windowLabel, toolCallId, approved: boolean })
// If window closes or stream is stopped while waiting: approval is auto-rejected
```

### Skills
```typescript
invoke("list_skills", {})                  // → Skill[] (name, description, enabled)
invoke("set_skill_enabled", { name, enabled })   // persistent, written to skill metadata
```

### Channel Runtime Config (Telegram)
```typescript
// Called by frontend settings page when Telegram config changes
invoke("update_channel_runtime_config", {
  selectedModel?: string,
  telegram?: { enabled: boolean, allowedUserIds: string[] },
  disabledSkills?: string[],   // runtime-only, NOT persisted; separate from set_skill_enabled
})
// disabledSkills here is a per-session override for Telegram bot context;
// set_skill_enabled is for persistent desktop skill enable/disable.
```

### Settings / Provider Config
Unchanged — `save_provider_config`, `get_provider_config`, etc. remain as-is.

---

## Tauri Events (Rust → Frontend)

Emitted via `window.emit()` — scoped to the specific window, no cross-window leakage.

```typescript
listen("stream:chunk",          e => appendText(e.payload.delta))
// stream:tool_call is emitted AFTER approval is granted (or if no approval needed).
// It is NOT emitted for rejected tool calls.
listen("stream:tool_call",      e => showToolCall(e.payload))       // { toolCallId, toolName, args }
listen("stream:tool_result",    e => showToolResult(e.payload))     // { toolCallId, result, isError }
// isError=true means tool execution failed; result contains the error message.
// The loop continues regardless — tool error is appended as a tool result message.
listen("stream:done",           e => onFinished(e.payload.usage))   // { usage: { promptTokens, completionTokens } }
listen("stream:error",          e => onError(e.payload.message))    // provider-level failure only
listen("tool:approval_request", e => showApprovalDialog(e.payload)) // { toolCallId, toolName, args }
// Approval dialog fires BEFORE stream:tool_call. Frontend waits for user response.
```

---

## Rust Internal Structure

```
src-tauri/src/
  lib.rs                      ← command registration + app setup
  ai/
    mod.rs
    provider.rs               ← AiProvider trait + impls
    stream.rs                 ← agentic loop, emits events
    tool_executor.rs          ← tool dispatch + approval flow
  tools/
    mod.rs
    bash/
      mod.rs                  ← port from sidecar bash-exec
      executor.rs
      validator.rs
      workspace.rs            ← per-chat isolated dirs (preserve existing logic)
    read.rs
    write.rs
    edit.rs                   ← str_replace
    glob.rs
    grep.rs
    ls.rs
    web_search.rs
    web_fetch.rs
  skills/
    mod.rs
    discovery.rs              ← scan bundled/user/~/.claude/plugins dirs
    catalog.rs                ← build SkillCatalog with metadata
    injector.rs               ← build skills XML block for system prompt
  project/
    mod.rs
    storage.rs                ← JSONL read/write (port from chat-fs.ts)
    path.rs                   ← path encoding + long-path hash (TBD)
  session/
    mod.rs                    ← WindowState, DashMap lifecycle
  telegram/
    mod.rs                    ← port TelegramBotService from Node.js
  setup/
    mod.rs                    ← app init, no sidecar spawn
```

---

## AiProvider Trait

```rust
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream_chat(
        &self,
        messages: Vec<ProviderMessage>,
        tools: Vec<ToolDef>,
        config: StreamConfig,
        tx: mpsc::Sender<StreamEvent>,
    ) -> Result<()>;
}

pub struct StreamConfig {
    pub model: String,
    pub system_prompt: String,   // built from role + skills XML + runtime context
    pub max_steps: u32,          // default 20, matches current sidecar
    pub abort: CancellationToken,
}
```

**Crates**:
- OpenAI: `async-openai`
- Anthropic: `reqwest` + manual SSE parsing (no official Rust crate)
- MiniMax: confirm if OpenAI-compatible before implementing; if yes, reuse `async-openai` with custom base URL

**`ProviderMessage`** is the internal Rust type sent to providers. Conversion from frontend `UIMessage[]` happens in `stream.rs` before calling the provider.

---

## Agentic Loop

The loop runs entirely in Rust inside `stream.rs`:

```
start_chat_stream invoked
  → build system prompt (skills injector + runtime context)
  → loop (up to max_steps=20):
      → call provider.stream_chat()
      → emit stream:chunk for each text delta
      → if tool_call received:
          → check approval requirement
          → if approval needed:
              emit tool:approval_request, await oneshot
              if rejected: append rejection result, continue loop (no stream:tool_call emitted)
          → execute tool (on error: result has isError=true, loop continues)
          → emit stream:tool_call   ← only after approval granted
          → emit stream:tool_result
          → append tool result to messages, continue loop
      → if stop_reason = "end_turn": break
  → emit stream:done with usage
  → save messages to JSONL
```

If `stop_chat_stream` is called: `CancellationToken` is triggered, loop exits, messages saved so far are persisted.

---

## System Prompt Construction

Built in `skills/injector.rs` before each stream call. Preserves the existing lazy-loading strategy from `system-prompt-builder.ts`: only skill metadata (id, name, description, location) is injected — not the full skill body. The AI uses the `read` tool to fetch `SKILL.md` on demand. This preserves context window for users with many or large skills.

```
[Role context]
You are an AI assistant working in the project folder: {folder}

[Response format rules]
...

[Skills]
<available_skills>
  <skill id="skill-name" name="Skill Name" source="builtin" description="..." location="/path/to/SKILL.md" />
  ...
</available_skills>

[Runtime context]
OS: macOS
Date: {date}
Model: {model}
```

---

## Skills System

Port of existing Node.js skills catalog to Rust.

**Discovery roots** (ported accurately from `catalog.ts`):
1. `AppData/skills/builtin/` — bundled skills (installed by Rust setup, not sidecar)
2. `AppData/skills/user/` — user-created skills
3. `~/.claude/skills/` — global user skills (direct root, not plugins)
4. `~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/skills/` — installed Claude plugins, discovered via `~/.claude/installed_plugins.json`

**Each skill**: directory with `SKILL.md` frontmatter (name, description, os, requires, enabled).

**Runtime**: `SkillCatalog` is built once at startup and refreshed when skills change. Injected into system prompt as XML block on every stream call.

**Bundled skill installation**: currently done in `setup/sidecar.rs` during sidecar startup. Moves to `setup/mod.rs` in Rust app init.

---

## Tools

| Tool | Description | Approval Required |
|---|---|---|
| `bash` | Execute shell commands in per-chat workspace | Dangerous commands only (policy in validator.rs) |
| `read` | Read file contents | No |
| `write` | Write file contents | No |
| `edit` | str_replace edit | No |
| `glob` | File pattern matching | No |
| `grep` | Content search (ripgrep) | No |
| `ls` | List directory | No |
| `web_search` | Web search | No |
| `web_fetch` | Fetch URL content | No |

**Bash workspace**: preserve existing per-chat isolated directory logic from `workspace.ts`. Port to Rust in `tools/bash/workspace.rs`.

---

## Local Image Serving

The sidecar currently serves local images via `/api/local-image?path=...` for the Webview.

Replacement: Tauri `asset://` protocol or a custom `localfile://` URI scheme registered in `tauri.conf.json`. Frontend `streamdown-local-image.tsx` updated to use the new URI scheme instead of the sidecar HTTP endpoint.

---

## Frontend Changes

- Remove `useChat` from `@ai-sdk/react`.
- New `useSession(folder)` hook API:
  ```typescript
  const {
    messages,        // UIMessage[]
    isLoading,       // boolean
    append,          // (content: string) => void
    stop,            // () => void
    setMessages,     // (messages: UIMessage[]) => void
    error,           // Error | null
  } = useSession({ folder, chatId, windowLabel })
  ```
- `chat-fs.ts` removed; storage ops use Tauri commands.
- `sidecar-client.ts` removed entirely.
- Sidebar chat list filters by current window's folder.
- Tool approval dialog driven by `tool:approval_request` event.
- Local image rendering updated to use `asset://` protocol.

---

## Telegram Bot

Port `TelegramBotService` from Node.js to Rust (`src-tauri/src/telegram/`).

- Uses `teloxide` crate (de-facto standard Rust Telegram bot library).
- Shares `AiProvider` trait and `ToolExecutor` with the desktop chat.
- `ChannelRuntimeConfigService` equivalent: Tauri state holding runtime config.
- Frontend settings pages for Telegram remain unchanged; they invoke existing provider config commands.

---

## Open Questions

1. **Long path hashing**: Investigate Claude Code's exact algorithm before implementing `path.rs`.
2. **MiniMax API format**: Confirm OpenAI-compatible or custom before implementing provider.
3. **Feishu bot**: Out of scope for this spec — separate design document.
