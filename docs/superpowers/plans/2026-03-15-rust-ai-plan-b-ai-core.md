# Rust AI Core — Plan B: AI Providers + Agentic Loop

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement native Rust AI streaming — OpenAI, MiniMax, and Anthropic providers, a full agentic loop with tool execution and approval flow, and the `start_chat_stream` / `stop_chat_stream` / `approve_tool_call` / `generate_title` Tauri commands — so the frontend can drive AI sessions without the Node.js sidecar.

**Architecture:** A new `src-tauri/src/ai/` module owns the provider abstraction (`AiProvider` trait), the agentic loop (`stream.rs`), and tool dispatch with approval flow (`tool_executor.rs`). `SessionManager` gains per-window stream abort tokens and approval sender maps. Four new Tauri commands wire these into the frontend.

**Tech Stack:** `async-openai 0.28` (OpenAI + MiniMax), `reqwest 0.12` (Anthropic SSE), `tokio::sync::mpsc` + `CancellationToken`, `async-trait 0.1`, existing `tools/` module from Plan A.

---

## Chunk 1: AI module types, provider trait, session state extension, Cargo.toml deps

### Task 1: Add deps, define AI module types, extend SessionManager

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/ai/mod.rs`
- Modify: `src-tauri/src/session/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `async-trait` to Cargo.toml**

Open `src-tauri/Cargo.toml`. Add after the existing deps:

```toml
async-trait = "0.1"
teloxide = { version = "0.13", features = ["macros", "ctrlc"] }
```

(`teloxide` is needed in Plan C; adding now avoids a separate Cargo.lock churn.)

- [ ] **Step 2: Add `mod ai` to lib.rs**

In `src-tauri/src/lib.rs`, add `mod ai;` alongside the other `mod` declarations at the top.

- [ ] **Step 3: Create `src-tauri/src/ai/mod.rs` with all shared types**

```rust
pub mod provider;
pub mod stream;
pub mod tool_executor;

use serde::{Deserialize, Serialize};

// ── Provider events (provider → agentic loop) ────────────────────────────────

#[derive(Debug)]
pub enum ProviderEvent {
    /// Incremental text delta from the model.
    TextDelta { delta: String },
    /// A complete tool call (emitted after stream end, not mid-stream).
    ToolCall {
        id: String,
        name: String,
        args: serde_json::Value,
    },
    /// Stream finished. reason: "end_turn" | "tool_use" | "max_tokens" | "stop"
    StopReason(String),
    /// Token usage (sent once at stream end).
    Usage {
        prompt_tokens: u32,
        completion_tokens: u32,
    },
    /// Provider-level error (network failure, auth error, etc.)
    Error(String),
}

// ── Internal message representation ──────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ProviderMessage {
    pub role: MsgRole,
    pub parts: Vec<Part>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MsgRole {
    User,
    Assistant,
}

#[derive(Debug, Clone)]
pub enum Part {
    Text(String),
    ToolCall {
        id: String,
        name: String,
        args: serde_json::Value,
    },
    ToolResult {
        call_id: String,
        content: String,
        is_error: bool,
    },
}

// ── Tool definition (sent to AI providers) ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    /// JSON Schema object for the tool's parameters.
    pub parameters: serde_json::Value,
    /// Whether this tool requires user approval before execution.
    /// This field is NOT sent to the provider.
    #[serde(skip)]
    pub requires_approval: bool,
}

// ── IPC contract: frontend → start_chat_stream ───────────────────────────────

/// A message in the simple format sent by the frontend via `start_chat_stream`.
/// Plan C frontend will produce this format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    /// "user" | "assistant"
    pub role: String,
    /// Plain text content (may be empty if only tool_calls or tool_results present).
    #[serde(default)]
    pub content: String,
    /// Tool calls produced by an assistant turn.
    #[serde(default)]
    pub tool_calls: Vec<ToolCallPart>,
    /// Tool results returned by the user turn after an assistant tool call.
    #[serde(default)]
    pub tool_results: Vec<ToolResultPart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallPart {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResultPart {
    pub tool_call_id: String,
    pub content: String,
    #[serde(default)]
    pub is_error: bool,
}

/// Convert frontend ChatMessages to internal ProviderMessages.
/// System message is injected separately by the agentic loop.
pub fn convert_messages(messages: Vec<ChatMessage>) -> Vec<ProviderMessage> {
    messages
        .into_iter()
        .map(|m| {
            let role = if m.role == "assistant" {
                MsgRole::Assistant
            } else {
                MsgRole::User
            };

            let mut parts = Vec::new();

            if !m.content.is_empty() {
                parts.push(Part::Text(m.content));
            }

            for tc in m.tool_calls {
                parts.push(Part::ToolCall {
                    id: tc.id,
                    name: tc.name,
                    args: tc.args,
                });
            }

            for tr in m.tool_results {
                parts.push(Part::ToolResult {
                    call_id: tr.tool_call_id,
                    content: tr.content,
                    is_error: tr.is_error,
                });
            }

            ProviderMessage { role, parts }
        })
        .collect()
}

// ── Tauri event payloads (Rust → frontend) ────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct StreamChunkPayload {
    pub delta: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamToolCallPayload {
    pub tool_call_id: String,
    pub tool_name: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamToolResultPayload {
    pub tool_call_id: String,
    pub result: serde_json::Value,
    pub is_error: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamDonePayload {
    pub usage: UsagePayload,
}

#[derive(Debug, Serialize, Clone)]
pub struct UsagePayload {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamErrorPayload {
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ToolApprovalRequestPayload {
    pub tool_call_id: String,
    pub tool_name: String,
    pub args: serde_json::Value,
}
```

- [ ] **Step 4: Extend `SessionManager` with stream abort + approval map**

Replace `src-tauri/src/session/mod.rs` entirely:

```rust
use dashmap::DashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct WindowState {
    pub folder: PathBuf,
    pub active_chat_id: Option<String>,
    /// Cancellation token for the in-flight stream. None if no stream running.
    pub stream_abort: Option<CancellationToken>,
    /// Pending tool approval senders: tool_call_id → Sender<bool>
    pub pending_approvals: Arc<DashMap<String, oneshot::Sender<bool>>>,
}

#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<DashMap<String, WindowState>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
        }
    }

    /// Register a window with a folder. Returns false if folder is already open.
    pub fn register(&self, window_label: String, folder: PathBuf) -> bool {
        if self.find_by_folder(&folder).is_some() {
            return false;
        }
        self.sessions.insert(
            window_label,
            WindowState {
                folder,
                active_chat_id: None,
                stream_abort: None,
                pending_approvals: Arc::new(DashMap::new()),
            },
        );
        true
    }

    pub fn unregister(&self, window_label: &str) {
        if let Some((_, state)) = self.sessions.remove(window_label) {
            // Cancel any in-flight stream
            if let Some(token) = state.stream_abort {
                token.cancel();
            }
            // Reject all pending approvals
            for entry in state.pending_approvals.iter() {
                // Ignore send errors (receiver may already be gone)
            }
            state.pending_approvals.clear();
        }
    }

    pub fn get_folder(&self, window_label: &str) -> Option<PathBuf> {
        self.sessions
            .get(window_label)
            .map(|s| s.folder.clone())
    }

    pub fn set_active_chat(&self, window_label: &str, chat_id: Option<String>) {
        if let Some(mut s) = self.sessions.get_mut(window_label) {
            s.active_chat_id = chat_id;
        }
    }

    pub fn get_active_chat(&self, window_label: &str) -> Option<String> {
        self.sessions
            .get(window_label)
            .and_then(|s| s.active_chat_id.clone())
    }

    /// Find which window (if any) has the given folder open.
    pub fn find_by_folder(&self, folder: &PathBuf) -> Option<String> {
        self.sessions
            .iter()
            .find(|entry| &entry.value().folder == folder)
            .map(|entry| entry.key().clone())
    }

    /// Store a new stream abort token; cancels the previous one if any.
    /// Returns a clone of the new token for the spawned task.
    pub fn set_stream_abort(&self, window_label: &str) -> CancellationToken {
        let token = CancellationToken::new();
        if let Some(mut s) = self.sessions.get_mut(window_label) {
            if let Some(old) = s.stream_abort.take() {
                old.cancel();
            }
            s.stream_abort = Some(token.clone());
        }
        token
    }

    /// Cancel the in-flight stream for this window, if any.
    pub fn cancel_stream(&self, window_label: &str) {
        if let Some(mut s) = self.sessions.get_mut(window_label) {
            if let Some(token) = s.stream_abort.take() {
                token.cancel();
            }
        }
    }

    /// Get the pending_approvals map for a window (None if window not found).
    pub fn pending_approvals(
        &self,
        window_label: &str,
    ) -> Option<Arc<DashMap<String, oneshot::Sender<bool>>>> {
        self.sessions
            .get(window_label)
            .map(|s| Arc::clone(&s.pending_approvals))
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_new_window() {
        let mgr = SessionManager::new();
        let result = mgr.register("win-1".into(), PathBuf::from("/proj/a"));
        assert!(result);
        assert_eq!(mgr.get_folder("win-1"), Some(PathBuf::from("/proj/a")));
    }

    #[test]
    fn register_same_folder_returns_false() {
        let mgr = SessionManager::new();
        mgr.register("win-1".into(), PathBuf::from("/proj/a"));
        let result = mgr.register("win-2".into(), PathBuf::from("/proj/a"));
        assert!(!result);
    }

    #[test]
    fn unregister_removes_window() {
        let mgr = SessionManager::new();
        mgr.register("win-1".into(), PathBuf::from("/proj/a"));
        mgr.unregister("win-1");
        assert_eq!(mgr.get_folder("win-1"), None);
    }

    #[test]
    fn find_by_folder_returns_label() {
        let mgr = SessionManager::new();
        mgr.register("win-1".into(), PathBuf::from("/proj/a"));
        assert_eq!(
            mgr.find_by_folder(&PathBuf::from("/proj/a")),
            Some("win-1".to_string())
        );
    }

    #[test]
    fn set_and_get_active_chat() {
        let mgr = SessionManager::new();
        mgr.register("win-1".into(), PathBuf::from("/proj/a"));
        mgr.set_active_chat("win-1", Some("chat-abc".into()));
        assert_eq!(mgr.get_active_chat("win-1"), Some("chat-abc".to_string()));
    }

    #[test]
    fn set_stream_abort_returns_token() {
        let mgr = SessionManager::new();
        mgr.register("win-1".into(), PathBuf::from("/proj/a"));
        let token = mgr.set_stream_abort("win-1");
        assert!(!token.is_cancelled());
        mgr.cancel_stream("win-1");
        assert!(token.is_cancelled());
    }

    #[test]
    fn unregister_cancels_stream() {
        let mgr = SessionManager::new();
        mgr.register("win-1".into(), PathBuf::from("/proj/a"));
        let token = mgr.set_stream_abort("win-1");
        mgr.unregister("win-1");
        assert!(token.is_cancelled());
    }

    #[test]
    fn after_unregister_folder_can_be_reused() {
        let mgr = SessionManager::new();
        mgr.register("win-1".into(), PathBuf::from("/proj/a"));
        mgr.unregister("win-1");
        let result = mgr.register("win-2".into(), PathBuf::from("/proj/a"));
        assert!(result);
    }
}
```

- [ ] **Step 5: Write test for `convert_messages`**

In `src-tauri/src/ai/mod.rs`, add at the bottom:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convert_user_text_message() {
        let msgs = vec![ChatMessage {
            id: "1".into(),
            role: "user".into(),
            content: "Hello".into(),
            tool_calls: vec![],
            tool_results: vec![],
        }];
        let result = convert_messages(msgs);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].role, MsgRole::User);
        assert!(matches!(&result[0].parts[0], Part::Text(t) if t == "Hello"));
    }

    #[test]
    fn convert_assistant_with_tool_call() {
        let msgs = vec![ChatMessage {
            id: "2".into(),
            role: "assistant".into(),
            content: String::new(),
            tool_calls: vec![ToolCallPart {
                id: "tc-1".into(),
                name: "bash".into(),
                args: serde_json::json!({ "command": "ls" }),
            }],
            tool_results: vec![],
        }];
        let result = convert_messages(msgs);
        assert_eq!(result[0].role, MsgRole::Assistant);
        assert!(matches!(&result[0].parts[0], Part::ToolCall { name, .. } if name == "bash"));
    }

    #[test]
    fn convert_tool_result_message() {
        let msgs = vec![ChatMessage {
            id: "3".into(),
            role: "user".into(),
            content: String::new(),
            tool_calls: vec![],
            tool_results: vec![ToolResultPart {
                tool_call_id: "tc-1".into(),
                content: "file.txt\n".into(),
                is_error: false,
            }],
        }];
        let result = convert_messages(msgs);
        assert!(
            matches!(&result[0].parts[0], Part::ToolResult { call_id, is_error, .. } if call_id == "tc-1" && !is_error)
        );
    }
}
```

- [ ] **Step 6: Run tests**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test ai::tests 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
cd .worktrees/feat-rust-ai
git add src-tauri/Cargo.toml src-tauri/src/ai/mod.rs src-tauri/src/session/mod.rs src-tauri/src/lib.rs
git commit -m "feat(ai): add AI module types, extend SessionManager with stream abort + approvals"
```

---

## Chunk 2: OpenAI + MiniMax provider

### Task 2: OpenAI + MiniMax provider implementation

**Files:**
- Create: `src-tauri/src/ai/provider.rs`

**Context:** `async-openai` 0.28 is already in Cargo.toml. MiniMax uses the same OpenAI-compatible API with a different base URL (`https://api.minimax.chat/v1`). Both are handled by `OpenAiProvider`. The Anthropic provider is Task 3.

- [ ] **Step 1: Write failing test for provider creation**

Create `src-tauri/src/ai/provider.rs` with just the test module first:

```rust
// provider.rs — TDD skeleton

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_openai_provider_with_key() {
        let p = OpenAiProvider::new("sk-test", None);
        assert_eq!(p.base_url(), "https://api.openai.com/v1/");
    }

    #[test]
    fn create_minimax_provider_uses_minimax_base() {
        let p = OpenAiProvider::new("key", Some("https://api.minimax.chat/v1"));
        assert_eq!(p.base_url(), "https://api.minimax.chat/v1");
    }

    #[test]
    fn create_provider_factory_anthropic() {
        // Just verifies it doesn't panic
        let _p = create_provider("anthropic", "key", None);
    }

    #[test]
    fn build_openai_messages_system_first() {
        let msgs = vec![crate::ai::ProviderMessage {
            role: crate::ai::MsgRole::User,
            parts: vec![crate::ai::Part::Text("Hi".into())],
        }];
        let out = build_openai_messages("Be helpful", &msgs);
        assert_eq!(out.len(), 2); // system + user
        // First must be system
        assert!(matches!(
            &out[0],
            async_openai::types::ChatCompletionRequestMessage::System(_)
        ));
    }
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test ai::provider::tests 2>&1 | tail -10
```

Expected: compile error (items not defined yet).

- [ ] **Step 3: Implement the full provider.rs**

```rust
use anyhow::Result;
use async_openai::{
    config::OpenAIConfig,
    types::{
        ChatCompletionRequestAssistantMessage, ChatCompletionRequestAssistantMessageContent,
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage,
        ChatCompletionRequestSystemMessageContent, ChatCompletionRequestToolMessage,
        ChatCompletionRequestToolMessageContent, ChatCompletionRequestUserMessage,
        ChatCompletionRequestUserMessageContent, ChatCompletionTool, ChatCompletionToolType,
        CreateChatCompletionRequest, FinishReason, FunctionObject,
        ChatCompletionMessageToolCall, ChatCompletionMessageToolCallFunction,
    },
    Client,
};
use async_trait::async_trait;
use futures_util::StreamExt;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::{MsgRole, Part, ProviderEvent, ProviderMessage, ToolDef};

// ── StreamConfig ──────────────────────────────────────────────────────────────

pub struct StreamConfig {
    pub model: String,
    pub system_prompt: String,
    pub abort: CancellationToken,
}

// ── AiProvider trait ──────────────────────────────────────────────────────────

#[async_trait]
pub trait AiProvider: Send + Sync {
    /// Stream one AI turn. Sends events on `tx`. Tool calls are accumulated
    /// and emitted as `ProviderEvent::ToolCall` after the stream ends.
    async fn stream_chat(
        &self,
        messages: Vec<ProviderMessage>,
        tools: Vec<ToolDef>,
        config: StreamConfig,
        tx: mpsc::Sender<ProviderEvent>,
    ) -> Result<()>;
}

// ── OpenAI / MiniMax provider ─────────────────────────────────────────────────

pub struct OpenAiProvider {
    client: Client<OpenAIConfig>,
    _base_url: String,
}

impl OpenAiProvider {
    pub fn new(api_key: &str, base_url: Option<&str>) -> Self {
        let url = base_url
            .unwrap_or("https://api.openai.com/v1/")
            .to_string();
        let config = OpenAIConfig::new()
            .with_api_key(api_key)
            .with_api_base(&url);
        Self {
            client: Client::with_config(config),
            _base_url: url,
        }
    }

    /// Exposed for tests only.
    #[cfg(test)]
    pub fn base_url(&self) -> &str {
        &self._base_url
    }
}

#[async_trait]
impl AiProvider for OpenAiProvider {
    async fn stream_chat(
        &self,
        messages: Vec<ProviderMessage>,
        tools: Vec<ToolDef>,
        config: StreamConfig,
        tx: mpsc::Sender<ProviderEvent>,
    ) -> Result<()> {
        let oai_messages = build_openai_messages(&config.system_prompt, &messages);
        let oai_tools = if tools.is_empty() {
            None
        } else {
            Some(build_openai_tools(&tools))
        };

        let request = CreateChatCompletionRequest {
            model: config.model.clone(),
            messages: oai_messages,
            tools: oai_tools,
            stream: Some(true),
            ..Default::default()
        };

        let mut stream = self.client.chat().create_stream(request).await?;

        // Accumulate partial tool calls indexed by `index`
        let mut partial_calls: std::collections::HashMap<
            u32,
            (String, String, String), // (id, name, args_json)
        > = std::collections::HashMap::new();

        let mut stop_reason = String::from("stop");
        let mut prompt_tokens: u32 = 0;
        let mut completion_tokens: u32 = 0;

        loop {
            tokio::select! {
                _ = config.abort.cancelled() => {
                    break;
                }
                item = stream.next() => {
                    let Some(item) = item else { break };
                    match item {
                        Err(e) => {
                            tx.send(ProviderEvent::Error(e.to_string())).await.ok();
                            return Ok(());
                        }
                        Ok(resp) => {
                            // Usage (present in some responses)
                            if let Some(usage) = resp.usage {
                                prompt_tokens = usage.prompt_tokens.unwrap_or(0);
                                completion_tokens = usage.completion_tokens.unwrap_or(0);
                            }
                            for choice in resp.choices {
                                let delta = choice.delta;

                                // Text delta
                                if let Some(text) = delta.content {
                                    if !text.is_empty() {
                                        tx.send(ProviderEvent::TextDelta { delta: text }).await.ok();
                                    }
                                }

                                // Partial tool calls
                                if let Some(tcs) = delta.tool_calls {
                                    for tc in tcs {
                                        let idx = tc.index;
                                        let entry = partial_calls.entry(idx).or_default();
                                        if let Some(id) = tc.id {
                                            entry.0 = id;
                                        }
                                        if let Some(func) = tc.function {
                                            if let Some(name) = func.name {
                                                entry.1 = name;
                                            }
                                            if let Some(args) = func.arguments {
                                                entry.2.push_str(&args);
                                            }
                                        }
                                    }
                                }

                                // Finish reason
                                if let Some(fr) = choice.finish_reason {
                                    stop_reason = match fr {
                                        FinishReason::Stop => "end_turn".into(),
                                        FinishReason::ToolCalls => "tool_use".into(),
                                        FinishReason::Length => "max_tokens".into(),
                                        _ => "stop".into(),
                                    };
                                }
                            }
                        }
                    }
                }
            }
        }

        // Emit accumulated tool calls
        let mut keys: Vec<u32> = partial_calls.keys().copied().collect();
        keys.sort();
        for key in keys {
            if let Some((id, name, args_json)) = partial_calls.remove(&key) {
                let args = serde_json::from_str(&args_json)
                    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                tx.send(ProviderEvent::ToolCall { id, name, args }).await.ok();
            }
        }

        tx.send(ProviderEvent::StopReason(stop_reason)).await.ok();
        tx.send(ProviderEvent::Usage {
            prompt_tokens,
            completion_tokens,
        })
        .await
        .ok();

        Ok(())
    }
}

// ── Conversion helpers ────────────────────────────────────────────────────────

pub fn build_openai_messages(
    system: &str,
    messages: &[ProviderMessage],
) -> Vec<ChatCompletionRequestMessage> {
    let mut result = vec![ChatCompletionRequestMessage::System(
        ChatCompletionRequestSystemMessage {
            content: ChatCompletionRequestSystemMessageContent::Text(system.to_string()),
            name: None,
        },
    )];

    for msg in messages {
        match msg.role {
            MsgRole::User => {
                // Collect text parts and tool results
                let text_parts: Vec<String> = msg
                    .parts
                    .iter()
                    .filter_map(|p| if let Part::Text(t) = p { Some(t.clone()) } else { None })
                    .collect();

                let tool_results: Vec<&Part> = msg
                    .parts
                    .iter()
                    .filter(|p| matches!(p, Part::ToolResult { .. }))
                    .collect();

                // If there are tool results, emit them as separate tool messages
                for tr in tool_results {
                    if let Part::ToolResult { call_id, content, is_error } = tr {
                        // OpenAI tool messages can't carry is_error directly;
                        // we prepend "ERROR: " to signal an error to the model.
                        let content_text = if *is_error {
                            format!("ERROR: {content}")
                        } else {
                            content.clone()
                        };
                        result.push(ChatCompletionRequestMessage::Tool(
                            ChatCompletionRequestToolMessage {
                                tool_call_id: call_id.clone(),
                                content: ChatCompletionRequestToolMessageContent::Text(
                                    content_text,
                                ),
                            },
                        ));
                    }
                }

                // Emit text content as a user message
                if !text_parts.is_empty() {
                    let text = text_parts.join("\n");
                    result.push(ChatCompletionRequestMessage::User(
                        ChatCompletionRequestUserMessage {
                            content: ChatCompletionRequestUserMessageContent::Text(text),
                            name: None,
                        },
                    ));
                }
            }
            MsgRole::Assistant => {
                let text: String = msg
                    .parts
                    .iter()
                    .filter_map(|p| if let Part::Text(t) = p { Some(t.as_str()) } else { None })
                    .collect::<Vec<_>>()
                    .join("");

                let tool_calls: Vec<ChatCompletionMessageToolCall> = msg
                    .parts
                    .iter()
                    .filter_map(|p| {
                        if let Part::ToolCall { id, name, args } = p {
                            Some(ChatCompletionMessageToolCall {
                                id: id.clone(),
                                r#type: ChatCompletionToolType::Function,
                                function: ChatCompletionMessageToolCallFunction {
                                    name: name.clone(),
                                    arguments: args.to_string(),
                                },
                            })
                        } else {
                            None
                        }
                    })
                    .collect();

                let content = if text.is_empty() {
                    None
                } else {
                    Some(ChatCompletionRequestAssistantMessageContent::Text(text))
                };

                result.push(ChatCompletionRequestMessage::Assistant(
                    ChatCompletionRequestAssistantMessage {
                        content,
                        name: None,
                        tool_calls: if tool_calls.is_empty() {
                            None
                        } else {
                            Some(tool_calls)
                        },
                        refusal: None,
                        audio: None,
                    },
                ));
            }
        }
    }

    result
}

pub fn build_openai_tools(tools: &[ToolDef]) -> Vec<ChatCompletionTool> {
    tools
        .iter()
        .map(|t| ChatCompletionTool {
            r#type: ChatCompletionToolType::Function,
            function: FunctionObject {
                name: t.name.clone(),
                description: Some(t.description.clone()),
                parameters: Some(t.parameters.clone()),
                strict: None,
            },
        })
        .collect()
}

// ── Anthropic placeholder (implemented in Task 3) ─────────────────────────────

pub struct AnthropicProvider {
    pub api_key: String,
    pub base_url: String,
    pub client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(api_key: &str, base_url: Option<&str>) -> Self {
        Self {
            api_key: api_key.to_string(),
            base_url: base_url
                .unwrap_or("https://api.anthropic.com")
                .to_string(),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for AnthropicProvider {
    async fn stream_chat(
        &self,
        _messages: Vec<ProviderMessage>,
        _tools: Vec<ToolDef>,
        _config: StreamConfig,
        tx: mpsc::Sender<ProviderEvent>,
    ) -> Result<()> {
        // Full implementation in Task 3
        tx.send(ProviderEvent::Error(
            "Anthropic provider not yet implemented".into(),
        ))
        .await
        .ok();
        Ok(())
    }
}

// ── Factory ───────────────────────────────────────────────────────────────────

pub fn create_provider(
    provider_name: &str,
    api_key: &str,
    base_url: Option<&str>,
) -> Box<dyn AiProvider> {
    match provider_name {
        "anthropic" => Box::new(AnthropicProvider::new(api_key, base_url)),
        "minimax" => Box::new(OpenAiProvider::new(
            api_key,
            Some(base_url.unwrap_or("https://api.minimax.chat/v1")),
        )),
        _ => Box::new(OpenAiProvider::new(api_key, base_url)), // default: openai
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_openai_provider_with_key() {
        let p = OpenAiProvider::new("sk-test", None);
        assert_eq!(p.base_url(), "https://api.openai.com/v1/");
    }

    #[test]
    fn create_minimax_provider_uses_minimax_base() {
        let p = OpenAiProvider::new("key", Some("https://api.minimax.chat/v1"));
        assert_eq!(p.base_url(), "https://api.minimax.chat/v1");
    }

    #[test]
    fn create_provider_factory_anthropic() {
        let _p = create_provider("anthropic", "key", None);
    }

    #[test]
    fn build_openai_messages_system_first() {
        let msgs = vec![crate::ai::ProviderMessage {
            role: crate::ai::MsgRole::User,
            parts: vec![crate::ai::Part::Text("Hi".into())],
        }];
        let out = build_openai_messages("Be helpful", &msgs);
        assert_eq!(out.len(), 2);
        assert!(matches!(
            &out[0],
            ChatCompletionRequestMessage::System(_)
        ));
    }

    #[test]
    fn build_openai_messages_assistant_with_tool_call() {
        let msgs = vec![crate::ai::ProviderMessage {
            role: crate::ai::MsgRole::Assistant,
            parts: vec![crate::ai::Part::ToolCall {
                id: "tc-1".into(),
                name: "bash".into(),
                args: serde_json::json!({ "command": "ls" }),
            }],
        }];
        let out = build_openai_messages("system", &msgs);
        // system + assistant
        assert_eq!(out.len(), 2);
        let ChatCompletionRequestMessage::Assistant(a) = &out[1] else { panic!() };
        assert!(a.tool_calls.is_some());
    }

    #[test]
    fn build_openai_tools_produces_function_type() {
        let tools = vec![ToolDef {
            name: "bash".into(),
            description: "Run commands".into(),
            parameters: serde_json::json!({ "type": "object" }),
            requires_approval: true,
        }];
        let out = build_openai_tools(&tools);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].function.name, "bash");
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test ai::provider::tests 2>&1 | tail -20
```

Expected: 6 tests pass. There may be compile warnings about unused `async_openai` type imports depending on exact 0.28 API — adjust import list if needed.

**Note for implementer:** `async-openai` 0.28 type names can differ slightly from older versions. If `ChatCompletionRequestAssistantMessage.audio` or `.refusal` fields don't exist, remove them. Use `cargo check` to verify types compile. The `..Default::default()` pattern works for most fields.

- [ ] **Step 5: Commit**

```bash
cd .worktrees/feat-rust-ai
git add src-tauri/src/ai/provider.rs
git commit -m "feat(ai): add AiProvider trait + OpenAI/MiniMax provider implementation"
```

---

## Chunk 3: Anthropic provider (reqwest + SSE)

### Task 3: Implement Anthropic streaming via manual SSE parsing

**Files:**
- Modify: `src-tauri/src/ai/provider.rs` (replace the `AnthropicProvider::stream_chat` stub)

**Context:** No official Rust crate for Anthropic. We POST to `https://api.anthropic.com/v1/messages` with `stream: true`, then parse SSE lines manually. Anthropic sends `event:` + `data:` pairs. Tool input arrives in `input_json_delta` events and must be accumulated.

**Anthropic SSE event types:**
- `content_block_start` — starts a text or tool_use block
- `content_block_delta` — `text_delta` (text) or `input_json_delta` (tool args)
- `content_block_stop` — finishes a block
- `message_delta` — contains `stop_reason` and `usage.output_tokens`
- `message_stop` — end of stream

- [ ] **Step 1: Write failing tests for Anthropic message builder**

Add to the `tests` module in `provider.rs`:

```rust
    #[test]
    fn build_anthropic_messages_user_text() {
        let msgs = vec![crate::ai::ProviderMessage {
            role: crate::ai::MsgRole::User,
            parts: vec![crate::ai::Part::Text("Hello".into())],
        }];
        let out = build_anthropic_messages(&msgs);
        assert_eq!(out.len(), 1);
        let obj = out[0].as_object().unwrap();
        assert_eq!(obj["role"].as_str().unwrap(), "user");
        let content = obj["content"].as_array().unwrap();
        assert_eq!(content[0]["type"].as_str().unwrap(), "text");
    }

    #[test]
    fn build_anthropic_messages_tool_result() {
        let msgs = vec![crate::ai::ProviderMessage {
            role: crate::ai::MsgRole::User,
            parts: vec![crate::ai::Part::ToolResult {
                call_id: "tc-1".into(),
                content: "result".into(),
                is_error: false,
            }],
        }];
        let out = build_anthropic_messages(&msgs);
        let obj = out[0].as_object().unwrap();
        let content = obj["content"].as_array().unwrap();
        assert_eq!(content[0]["type"].as_str().unwrap(), "tool_result");
        assert_eq!(content[0]["tool_use_id"].as_str().unwrap(), "tc-1");
    }
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test ai::provider::tests::build_anthropic 2>&1 | tail -10
```

Expected: compile error (function not defined yet).

- [ ] **Step 3: Implement `build_anthropic_messages` and full SSE streaming**

Replace the `AnthropicProvider` impl in `provider.rs`:

```rust
/// Build Anthropic API messages array from internal ProviderMessages.
/// Returns a Vec<serde_json::Value> (the "messages" field in the request body).
pub fn build_anthropic_messages(messages: &[ProviderMessage]) -> Vec<serde_json::Value> {
    let mut result = Vec::new();

    for msg in messages {
        let role = match msg.role {
            MsgRole::User => "user",
            MsgRole::Assistant => "assistant",
        };

        let mut content_blocks: Vec<serde_json::Value> = Vec::new();

        for part in &msg.parts {
            match part {
                Part::Text(text) => {
                    content_blocks.push(serde_json::json!({
                        "type": "text",
                        "text": text,
                    }));
                }
                Part::ToolCall { id, name, args } => {
                    content_blocks.push(serde_json::json!({
                        "type": "tool_use",
                        "id": id,
                        "name": name,
                        "input": args,
                    }));
                }
                Part::ToolResult { call_id, content, is_error } => {
                    content_blocks.push(serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": call_id,
                        "content": content,
                        "is_error": is_error,
                    }));
                }
            }
        }

        if !content_blocks.is_empty() {
            result.push(serde_json::json!({
                "role": role,
                "content": content_blocks,
            }));
        }
    }

    result
}

/// Build the Anthropic tools array.
pub fn build_anthropic_tools(tools: &[ToolDef]) -> Vec<serde_json::Value> {
    tools
        .iter()
        .map(|t| {
            serde_json::json!({
                "name": t.name,
                "description": t.description,
                "input_schema": t.parameters,
            })
        })
        .collect()
}
```

Then replace `AnthropicProvider::stream_chat`:

```rust
#[async_trait]
impl AiProvider for AnthropicProvider {
    async fn stream_chat(
        &self,
        messages: Vec<ProviderMessage>,
        tools: Vec<ToolDef>,
        config: StreamConfig,
        tx: mpsc::Sender<ProviderEvent>,
    ) -> Result<()> {
        let url = format!("{}/v1/messages", self.base_url.trim_end_matches('/'));

        let anthropic_messages = build_anthropic_messages(&messages);
        let anthropic_tools = build_anthropic_tools(&tools);

        let mut body = serde_json::json!({
            "model": config.model,
            "max_tokens": 4096,
            "system": config.system_prompt,
            "messages": anthropic_messages,
            "stream": true,
        });

        if !anthropic_tools.is_empty() {
            body["tools"] = serde_json::Value::Array(anthropic_tools);
        }

        let response = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            tx.send(ProviderEvent::Error(format!(
                "Anthropic API error {status}: {text}"
            )))
            .await
            .ok();
            return Ok(());
        }

        // Parse SSE stream
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut event_type = String::new();

        // Per-block accumulation
        // index → (id, name, args_json)
        let mut tool_blocks: std::collections::HashMap<u32, (String, String, String)> =
            std::collections::HashMap::new();
        let mut current_block_index: u32 = 0;
        let mut current_block_type = String::new();

        let mut stop_reason = String::from("end_turn");
        let mut prompt_tokens: u32 = 0;
        let mut completion_tokens: u32 = 0;

        loop {
            tokio::select! {
                _ = config.abort.cancelled() => { break; }
                chunk = futures_util::StreamExt::next(&mut stream) => {
                    let Some(chunk) = chunk else { break };
                    let chunk = match chunk {
                        Ok(b) => b,
                        Err(e) => {
                            tx.send(ProviderEvent::Error(e.to_string())).await.ok();
                            return Ok(());
                        }
                    };

                    buffer.push_str(&String::from_utf8_lossy(&chunk));

                    // Process complete lines
                    while let Some(nl) = buffer.find('\n') {
                        let line = buffer[..nl].trim_end_matches('\r').to_string();
                        buffer = buffer[nl + 1..].to_string();

                        if line.starts_with("event: ") {
                            event_type = line["event: ".len()..].to_string();
                        } else if line.starts_with("data: ") {
                            let data = &line["data: ".len()..];
                            if data == "[DONE]" {
                                break;
                            }
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                                handle_anthropic_event(
                                    &event_type,
                                    &json,
                                    &tx,
                                    &mut tool_blocks,
                                    &mut current_block_index,
                                    &mut current_block_type,
                                    &mut stop_reason,
                                    &mut prompt_tokens,
                                    &mut completion_tokens,
                                )
                                .await;
                            }
                        }
                        // blank line = end of event
                    }
                }
            }
        }

        // Emit accumulated tool calls
        let mut keys: Vec<u32> = tool_blocks.keys().copied().collect();
        keys.sort();
        for key in keys {
            if let Some((id, name, args_json)) = tool_blocks.remove(&key) {
                let args = serde_json::from_str(&args_json)
                    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                tx.send(ProviderEvent::ToolCall { id, name, args }).await.ok();
            }
        }

        tx.send(ProviderEvent::StopReason(stop_reason)).await.ok();
        tx.send(ProviderEvent::Usage {
            prompt_tokens,
            completion_tokens,
        })
        .await
        .ok();

        Ok(())
    }
}

async fn handle_anthropic_event(
    event_type: &str,
    json: &serde_json::Value,
    tx: &mpsc::Sender<ProviderEvent>,
    tool_blocks: &mut std::collections::HashMap<u32, (String, String, String)>,
    current_block_index: &mut u32,
    current_block_type: &mut String,
    stop_reason: &mut String,
    prompt_tokens: &mut u32,
    completion_tokens: &mut u32,
) {
    match event_type {
        "content_block_start" => {
            let index = json["index"].as_u64().unwrap_or(0) as u32;
            *current_block_index = index;
            let block_type = json["content_block"]["type"]
                .as_str()
                .unwrap_or("")
                .to_string();
            *current_block_type = block_type.clone();

            if block_type == "tool_use" {
                let id = json["content_block"]["id"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let name = json["content_block"]["name"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                tool_blocks.insert(index, (id, name, String::new()));
            }
        }
        "content_block_delta" => {
            let delta = &json["delta"];
            let delta_type = delta["type"].as_str().unwrap_or("");
            match delta_type {
                "text_delta" => {
                    if let Some(text) = delta["text"].as_str() {
                        if !text.is_empty() {
                            tx.send(ProviderEvent::TextDelta {
                                delta: text.to_string(),
                            })
                            .await
                            .ok();
                        }
                    }
                }
                "input_json_delta" => {
                    if let Some(partial) = delta["partial_json"].as_str() {
                        let index = *current_block_index;
                        if let Some(entry) = tool_blocks.get_mut(&index) {
                            entry.2.push_str(partial);
                        }
                    }
                }
                _ => {}
            }
        }
        "message_delta" => {
            if let Some(reason) = json["delta"]["stop_reason"].as_str() {
                *stop_reason = match reason {
                    "end_turn" => "end_turn",
                    "tool_use" => "tool_use",
                    "max_tokens" => "max_tokens",
                    _ => "stop",
                }
                .to_string();
            }
            if let Some(out_tokens) = json["usage"]["output_tokens"].as_u64() {
                *completion_tokens = out_tokens as u32;
            }
        }
        "message_start" => {
            if let Some(in_tokens) = json["message"]["usage"]["input_tokens"].as_u64() {
                *prompt_tokens = in_tokens as u32;
            }
        }
        _ => {}
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test ai::provider::tests 2>&1 | tail -20
```

Expected: all 8 provider tests pass.

- [ ] **Step 5: Commit**

```bash
cd .worktrees/feat-rust-ai
git add src-tauri/src/ai/provider.rs
git commit -m "feat(ai): implement Anthropic SSE provider with manual stream parsing"
```

---

## Chunk 4: ToolExecutor + agentic loop

### Task 4: Tool executor with approval flow and agentic loop (stream.rs)

**Files:**
- Create: `src-tauri/src/ai/tool_executor.rs`
- Create: `src-tauri/src/ai/stream.rs`

**Context:** The tool executor wraps all 9 tools from Plan A. It checks each tool's `requires_approval` flag, emits `tool:approval_request` to the frontend, awaits a oneshot response, then either executes or skips. The agentic loop in `stream.rs` drives the full multi-turn conversation.

- [ ] **Step 1: Write failing tests for ToolExecutor**

Create `src-tauri/src/ai/tool_executor.rs` with just the test skeleton:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::ToolContext;
    use std::path::PathBuf;

    fn make_executor_no_approval(folder: &str) -> ToolExecutor {
        let app_data = PathBuf::from("/tmp/test-appdata");
        let pending = std::sync::Arc::new(dashmap::DashMap::new());
        // No window + no app_handle in unit tests — use the sync exec path
        ToolExecutor {
            context: ToolContext {
                folder: PathBuf::from(folder),
                chat_id: "test-chat".into(),
            },
            app_data_dir: app_data,
            window_label: "test-window".into(),
            pending_approvals: pending,
            app_handle: None,
        }
    }

    #[tokio::test]
    async fn read_tool_executes_on_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("hello.txt");
        tokio::fs::write(&path, "world").await.unwrap();

        let exec = make_executor_no_approval(dir.path().to_str().unwrap());
        let result = exec
            .execute_without_approval("read", serde_json::json!({ "path": path.to_str().unwrap() }))
            .await;
        assert!(!result.is_error());
    }

    #[tokio::test]
    async fn unknown_tool_returns_error() {
        let exec = make_executor_no_approval("/tmp");
        let result = exec
            .execute_without_approval("nonexistent_tool", serde_json::json!({}))
            .await;
        assert!(result.is_error());
    }

    #[test]
    fn bash_needs_approval_for_curl() {
        assert!(tool_requires_approval("bash", &serde_json::json!({ "command": "curl" })));
    }

    #[test]
    fn read_does_not_need_approval() {
        assert!(!tool_requires_approval("read", &serde_json::json!({ "path": "/tmp/x" })));
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test ai::tool_executor::tests 2>&1 | tail -10
```

Expected: compile error (items not defined).

- [ ] **Step 3: Implement `tool_executor.rs`**

```rust
use anyhow::Result;
use dashmap::DashMap;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use crate::ai::{ToolApprovalRequestPayload, ToolDef};
use crate::tools::{
    bash::{self, BashInput},
    edit, glob_tool, grep_tool, ls, read, web_fetch, web_search, write, ToolContext, ToolResult,
};

/// Returns true if this tool call requires user approval before execution.
pub fn tool_requires_approval(tool_name: &str, args: &Value) -> bool {
    match tool_name {
        "bash" => {
            let command = args["command"].as_str().unwrap_or("");
            bash::needs_approval(command)
        }
        _ => false,
    }
}

/// All tool definitions available for injection into the AI system prompt.
pub fn all_tool_defs() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "bash".into(),
            description: "Execute a shell command in an isolated per-chat workspace directory. The command runs in bash with a 30-second timeout.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "Shell command to execute" },
                    "args": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Optional list of arguments (appended to command)"
                    }
                },
                "required": ["command"]
            }),
            requires_approval: true,
        },
        ToolDef {
            name: "read".into(),
            description: "Read the contents of a file. Path can be absolute or relative to the project folder.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File path to read" }
                },
                "required": ["path"]
            }),
            requires_approval: false,
        },
        ToolDef {
            name: "write".into(),
            description: "Write content to a file, creating it if needed. Path can be absolute or relative to the project folder.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File path to write" },
                    "content": { "type": "string", "description": "Content to write" }
                },
                "required": ["path", "content"]
            }),
            requires_approval: false,
        },
        ToolDef {
            name: "edit".into(),
            description: "Replace a specific string in a file with a new string (str_replace). Fails if old_string is not found or is not unique.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "old_string": { "type": "string", "description": "Exact string to find and replace" },
                    "new_string": { "type": "string", "description": "Replacement string" }
                },
                "required": ["path", "old_string", "new_string"]
            }),
            requires_approval: false,
        },
        ToolDef {
            name: "glob".into(),
            description: "Find files matching a glob pattern relative to the project folder.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Glob pattern, e.g. src/**/*.ts" }
                },
                "required": ["pattern"]
            }),
            requires_approval: false,
        },
        ToolDef {
            name: "grep".into(),
            description: "Search file contents using ripgrep. Returns matching lines with file paths and line numbers.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Regex pattern to search for" },
                    "path": { "type": "string", "description": "Directory or file path to search in (defaults to project folder)" },
                    "glob": { "type": "string", "description": "Optional file glob filter, e.g. *.ts" }
                },
                "required": ["pattern"]
            }),
            requires_approval: false,
        },
        ToolDef {
            name: "ls".into(),
            description: "List files and directories at a path.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Directory path to list (defaults to project folder)" }
                },
                "required": []
            }),
            requires_approval: false,
        },
        ToolDef {
            name: "web_search".into(),
            description: "Search the web using the Brave Search API.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Search query" }
                },
                "required": ["query"]
            }),
            requires_approval: false,
        },
        ToolDef {
            name: "web_fetch".into(),
            description: "Fetch the content of a URL. Returns the response body as text.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "URL to fetch" }
                },
                "required": ["url"]
            }),
            requires_approval: false,
        },
    ]
}

/// Filter tool defs by the enabled_tools list.
/// An empty enabled_tools list means all tools are enabled.
pub fn filter_tool_defs(enabled_tools: &[String]) -> Vec<ToolDef> {
    let all = all_tool_defs();
    if enabled_tools.is_empty() {
        return all;
    }
    all.into_iter()
        .filter(|t| enabled_tools.contains(&t.name))
        .collect()
}

// ── ToolExecutor ──────────────────────────────────────────────────────────────

pub struct ToolExecutor {
    pub context: ToolContext,
    pub app_data_dir: PathBuf,
    pub window_label: String,
    pub pending_approvals: Arc<DashMap<String, oneshot::Sender<bool>>>,
    /// None in unit tests (no Tauri runtime)
    pub app_handle: Option<tauri::AppHandle>,
    /// API key for Tavily web search. None means web_search will return an error.
    pub web_search_api_key: Option<String>,
}

impl ToolExecutor {
    /// Execute a tool after checking for approval.
    /// Returns (approved, result). approved=false means rejected without execution.
    pub async fn execute(
        &self,
        tool_name: &str,
        tool_call_id: &str,
        args: &Value,
        cancel: &CancellationToken,
    ) -> (bool, ToolResult) {
        // Check if this tool call requires approval
        if tool_requires_approval(tool_name, args) {
            let approved = self
                .request_approval(tool_call_id, tool_name, args)
                .await;
            if !approved {
                return (false, ToolResult::err("Tool call rejected by user"));
            }
        }

        let result = self
            .execute_without_approval(tool_name, args.clone())
            .await;
        (true, result)
    }

    /// Execute a tool unconditionally (no approval check). Used in tests.
    pub async fn execute_without_approval(&self, tool_name: &str, args: Value) -> ToolResult {
        let ctx = &self.context;
        match tool_name {
            "bash" => {
                let command = args["command"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let arg_list: Vec<String> = args["args"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();

                // Blocked commands return an error without executing
                if let Some(reason) = bash::block_reason(&command) {
                    return ToolResult::err(reason);
                }

                let cancel = CancellationToken::new(); // no per-tool cancel in this path
                bash::execute(
                    BashInput { command, args: arg_list },
                    ctx,
                    self.app_data_dir.clone(),
                    cancel,
                )
                .await
            }
            "read" => {
                let path = args["path"].as_str().unwrap_or("").to_string();
                read::execute(path, ctx).await
            }
            "write" => {
                let path = args["path"].as_str().unwrap_or("").to_string();
                let content = args["content"].as_str().unwrap_or("").to_string();
                write::execute(path, content, ctx).await
            }
            "edit" => {
                let path = args["path"].as_str().unwrap_or("").to_string();
                let old = args["old_string"].as_str().unwrap_or("").to_string();
                let new = args["new_string"].as_str().unwrap_or("").to_string();
                edit::execute(path, old, new, ctx).await
            }
            "glob" => {
                let pattern = args["pattern"].as_str().unwrap_or("").to_string();
                glob_tool::execute(pattern, ctx).await
            }
            "grep" => {
                let pattern = args["pattern"].as_str().unwrap_or("").to_string();
                let path = args["path"].as_str().map(|s| s.to_string());
                let glob = args["glob"].as_str().map(|s| s.to_string());
                grep_tool::execute(pattern, path, glob, ctx).await
            }
            "ls" => {
                let path = args["path"].as_str().map(|s| s.to_string());
                ls::execute(path, ctx).await
            }
            "web_search" => {
                let query = args["query"].as_str().unwrap_or("").to_string();
                web_search::execute(query, self.web_search_api_key.clone(), ctx).await
            }
            "web_fetch" => {
                let url = args["url"].as_str().unwrap_or("").to_string();
                web_fetch::execute(url, ctx).await
            }
            _ => ToolResult::err(format!("Unknown tool: {tool_name}")),
        }
    }

    /// Emit `tool:approval_request` to the frontend and await the user's response.
    /// Returns true if approved, false if rejected or timed out.
    async fn request_approval(&self, tool_call_id: &str, tool_name: &str, args: &Value) -> bool {
        let Some(ref handle) = self.app_handle else {
            // In tests without a Tauri handle, auto-approve
            return true;
        };

        let (tx, rx) = oneshot::channel::<bool>();
        self.pending_approvals
            .insert(tool_call_id.to_string(), tx);

        use tauri::Emitter;
        let _ = handle.emit_to(
            tauri::EventTarget::webview_window(&self.window_label),
            "tool:approval_request",
            ToolApprovalRequestPayload {
                tool_call_id: tool_call_id.to_string(),
                tool_name: tool_name.to_string(),
                args: args.clone(),
            },
        );

        // Wait for the frontend to call approve_tool_call, or a 5-minute timeout
        match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
            Ok(Ok(approved)) => approved,
            _ => {
                self.pending_approvals.remove(tool_call_id);
                false
            }
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn make_executor(folder: &str) -> ToolExecutor {
        ToolExecutor {
            context: ToolContext {
                folder: PathBuf::from(folder),
                chat_id: "test-chat".into(),
            },
            app_data_dir: PathBuf::from("/tmp/test-appdata"),
            window_label: "test-window".into(),
            pending_approvals: Arc::new(DashMap::new()),
            app_handle: None,
            web_search_api_key: None,
        }
    }

    #[tokio::test]
    async fn read_tool_executes_on_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("hello.txt");
        tokio::fs::write(&path, "world").await.unwrap();

        let exec = make_executor(dir.path().to_str().unwrap());
        let result = exec
            .execute_without_approval(
                "read",
                serde_json::json!({ "path": path.to_str().unwrap() }),
            )
            .await;
        assert!(!result.is_error());
    }

    #[tokio::test]
    async fn unknown_tool_returns_error() {
        let exec = make_executor("/tmp");
        let result = exec
            .execute_without_approval("nonexistent_tool", serde_json::json!({}))
            .await;
        assert!(result.is_error());
    }

    #[test]
    fn bash_needs_approval_for_curl() {
        assert!(tool_requires_approval(
            "bash",
            &serde_json::json!({ "command": "curl" })
        ));
    }

    #[test]
    fn read_does_not_need_approval() {
        assert!(!tool_requires_approval(
            "read",
            &serde_json::json!({ "path": "/tmp/x" })
        ));
    }

    #[test]
    fn bash_safe_commands_dont_need_approval() {
        assert!(!tool_requires_approval(
            "bash",
            &serde_json::json!({ "command": "ls" })
        ));
    }

    #[test]
    fn all_tool_defs_returns_nine_tools() {
        assert_eq!(all_tool_defs().len(), 9);
    }

    #[test]
    fn filter_tool_defs_by_name() {
        let defs = filter_tool_defs(&["bash".to_string(), "read".to_string()]);
        assert_eq!(defs.len(), 2);
        assert!(defs.iter().any(|t| t.name == "bash"));
        assert!(defs.iter().any(|t| t.name == "read"));
    }
}
```

- [ ] **Step 4: Run ToolExecutor tests**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test ai::tool_executor::tests 2>&1 | tail -20
```

Expected: 7 tests pass. The bash tests may need a real temp dir; `tempfile` crate is in dev-dependencies.

- [ ] **Step 5: Write failing test for stream message saving**

Create `src-tauri/src/ai/stream.rs` with just the test skeleton:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{ChatMessage, MsgRole, Part, ProviderMessage};

    #[test]
    fn build_tool_defs_respects_enabled_list() {
        let defs = build_tool_defs(&["bash".to_string(), "read".to_string()]);
        assert_eq!(defs.len(), 2);
    }

    #[test]
    fn build_tool_defs_empty_means_all() {
        let defs = build_tool_defs(&[]);
        assert_eq!(defs.len(), 9);
    }
}
```

- [ ] **Step 6: Implement the agentic loop in `stream.rs`**

```rust
use anyhow::Result;
use dashmap::DashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::ai::{
    provider::{create_provider, AiProvider, StreamConfig},
    tool_executor::{filter_tool_defs, ToolExecutor},
    ToolDef, {convert_messages, ChatMessage},
    {MsgRole, Part, ProviderEvent, ProviderMessage},
    {
        StreamChunkPayload, StreamDonePayload, StreamErrorPayload, StreamToolCallPayload,
        StreamToolResultPayload, UsagePayload,
    },
};
use crate::project::storage::ProjectStorage;
use crate::skills::injector::build_system_prompt;
use crate::tools::ToolContext;

const MAX_STEPS: usize = 20;

pub struct AgentLoopParams {
    pub window_label: String,
    pub folder: PathBuf,
    pub chat_id: String,
    pub messages: Vec<ChatMessage>,
    pub model: String,
    pub provider_name: String,
    pub enabled_tools: Vec<String>,
    pub abort: CancellationToken,
    pub pending_approvals: Arc<DashMap<String, oneshot::Sender<bool>>>,
    pub app_handle: tauri::AppHandle,
    pub app_data_dir: PathBuf,
}

/// Build tool definitions from the enabled_tools list.
pub fn build_tool_defs(enabled_tools: &[String]) -> Vec<ToolDef> {
    filter_tool_defs(enabled_tools)
}

pub async fn run_agentic_loop(params: AgentLoopParams) -> Result<()> {
    use crate::keychain;
    use tauri::Manager;

    // ── Resolve provider credentials ──────────────────────────────────────────
    let configs = keychain::get_all_configs_providers();
    let provider_config = configs.get(&params.provider_name).cloned();
    let (api_key, base_url) = match provider_config {
        Some(cfg) => (cfg.api_key, cfg.base_url),
        None => {
            emit_error(&params.app_handle, &params.window_label, "Provider not configured").await;
            return Ok(());
        }
    };

    // Web search API key (Tavily) — optional, used only when web_search tool is called
    let web_search_api_key = configs
        .get("tavily")
        .map(|cfg| cfg.api_key.clone());

    let provider: Arc<dyn AiProvider> = Arc::from(create_provider(
        &params.provider_name,
        &api_key,
        base_url.as_deref(),
    ));

    // ── Build system prompt ────────────────────────────────────────────────────
    let skill_catalog = params
        .app_handle
        .try_state::<crate::skills::catalog::SkillCatalog>()
        .map(|c| c.enabled())
        .unwrap_or_default();

    let system_prompt = build_system_prompt(
        &params.folder.to_string_lossy(),
        &skill_catalog,
        &params.model,
    );

    // ── Initialize message history ─────────────────────────────────────────────
    let mut history: Vec<ProviderMessage> = convert_messages(params.messages.clone());

    let tools = build_tool_defs(&params.enabled_tools);

    let tool_executor = ToolExecutor {
        context: ToolContext {
            folder: params.folder.clone(),
            chat_id: params.chat_id.clone(),
        },
        app_data_dir: params.app_data_dir.clone(),
        window_label: params.window_label.clone(),
        pending_approvals: Arc::clone(&params.pending_approvals),
        app_handle: Some(params.app_handle.clone()),
        web_search_api_key,
    };

    let mut total_usage = UsagePayload {
        prompt_tokens: 0,
        completion_tokens: 0,
    };

    // ── Agentic loop ──────────────────────────────────────────────────────────
    for _step in 0..MAX_STEPS {
        if params.abort.is_cancelled() {
            break;
        }

        // Spawn provider call
        let (event_tx, mut event_rx) = mpsc::channel::<ProviderEvent>(256);
        let provider_clone = Arc::clone(&provider);
        let history_clone = history.clone();
        let tools_clone = tools.clone();
        let abort_clone = params.abort.clone();
        let model_clone = params.model.clone();
        let system_clone = system_prompt.clone();

        let provider_task = tokio::spawn(async move {
            provider_clone
                .stream_chat(
                    history_clone,
                    tools_clone,
                    StreamConfig {
                        model: model_clone,
                        system_prompt: system_clone,
                        abort: abort_clone,
                    },
                    event_tx,
                )
                .await
        });

        // Collect events
        let mut current_text = String::new();
        let mut tool_calls: Vec<(String, String, serde_json::Value)> = Vec::new(); // (id, name, args)
        let mut stop_reason = String::from("end_turn");

        while let Some(event) = event_rx.recv().await {
            match event {
                ProviderEvent::TextDelta { delta } => {
                    current_text.push_str(&delta);
                    let _ = params.app_handle.emit_to(
                        tauri::EventTarget::webview_window(&params.window_label),
                        "stream:chunk",
                        StreamChunkPayload { delta },
                    );
                }
                ProviderEvent::ToolCall { id, name, args } => {
                    tool_calls.push((id, name, args));
                }
                ProviderEvent::StopReason(reason) => {
                    stop_reason = reason;
                }
                ProviderEvent::Usage {
                    prompt_tokens,
                    completion_tokens,
                } => {
                    total_usage.prompt_tokens += prompt_tokens;
                    total_usage.completion_tokens += completion_tokens;
                }
                ProviderEvent::Error(msg) => {
                    emit_error(&params.app_handle, &params.window_label, &msg).await;
                    // Still save what we have
                    save_and_finish(
                        &params,
                        history.clone(),
                        &total_usage,
                        &params.app_handle,
                        &params.app_data_dir,
                    )
                    .await;
                    return Ok(());
                }
            }
        }

        let _ = provider_task.await;

        // Add assistant turn to history
        let mut assistant_parts = Vec::new();
        if !current_text.is_empty() {
            assistant_parts.push(Part::Text(current_text.clone()));
        }
        for (id, name, args) in &tool_calls {
            assistant_parts.push(Part::ToolCall {
                id: id.clone(),
                name: name.clone(),
                args: args.clone(),
            });
        }
        if !assistant_parts.is_empty() {
            history.push(ProviderMessage {
                role: MsgRole::Assistant,
                parts: assistant_parts,
            });
        }

        // If no tool calls, we're done
        if tool_calls.is_empty() || stop_reason == "end_turn" {
            break;
        }

        // Execute each tool call
        for (tool_call_id, tool_name, args) in tool_calls {
            if params.abort.is_cancelled() {
                break;
            }

            let abort_for_tool = params.abort.clone();
            let (approved, result) = tool_executor
                .execute(&tool_name, &tool_call_id, &args, &abort_for_tool)
                .await;

            if approved {
                // Emit stream:tool_call (only after approval)
                let _ = params.app_handle.emit_to(
                    tauri::EventTarget::webview_window(&params.window_label),
                    "stream:tool_call",
                    StreamToolCallPayload {
                        tool_call_id: tool_call_id.clone(),
                        tool_name: tool_name.clone(),
                        args: args.clone(),
                    },
                );
            }

            let is_error = result.is_error();
            let result_value = match &result {
                crate::tools::ToolResult::Success { output } => output.clone(),
                crate::tools::ToolResult::Error { message } => {
                    serde_json::Value::String(message.clone())
                }
            };

            // Emit stream:tool_result
            let _ = params.app_handle.emit_to(
                tauri::EventTarget::webview_window(&params.window_label),
                "stream:tool_result",
                StreamToolResultPayload {
                    tool_call_id: tool_call_id.clone(),
                    result: result_value.clone(),
                    is_error,
                },
            );

            // Add tool result to history
            history.push(ProviderMessage {
                role: MsgRole::User,
                parts: vec![Part::ToolResult {
                    call_id: tool_call_id,
                    content: result_value.to_string(),
                    is_error,
                }],
            });
        }
    }

    // ── Finish ─────────────────────────────────────────────────────────────────
    save_and_finish(
        &params,
        history,
        &total_usage,
        &params.app_handle,
        &params.app_data_dir,
    )
    .await;

    Ok(())
}

async fn emit_error(app_handle: &tauri::AppHandle, window_label: &str, message: &str) {
    let _ = app_handle.emit_to(
        tauri::EventTarget::webview_window(window_label),
        "stream:error",
        StreamErrorPayload {
            message: message.to_string(),
        },
    );
}

async fn save_and_finish(
    params: &AgentLoopParams,
    history: Vec<ProviderMessage>,
    usage: &UsagePayload,
    app_handle: &tauri::AppHandle,
    app_data_dir: &PathBuf,
) {
    // Emit done
    let _ = app_handle.emit_to(
        tauri::EventTarget::webview_window(&params.window_label),
        "stream:done",
        StreamDonePayload {
            usage: usage.clone(),
        },
    );

    // Save messages to JSONL storage
    // Convert ProviderMessages back to ChatMessages for persistence
    let chat_messages: Vec<crate::project::storage::Message> =
        history_to_storage_messages(&history, &params.messages);

    let storage = ProjectStorage::new(app_data_dir.clone());
    if let Err(e) = storage
        .write_messages(&params.folder, &params.chat_id, &chat_messages)
        .await
    {
        log::error!("Failed to save messages after stream: {e}");
    }
}

/// Convert the updated ProviderMessage history back to storage format.
/// Appends newly generated assistant turns to the original frontend messages.
fn history_to_storage_messages(
    history: &[ProviderMessage],
    original: &[ChatMessage],
) -> Vec<crate::project::storage::Message> {
    use crate::project::storage::Message;

    let mut result: Vec<Message> = original
        .iter()
        .map(|m| Message {
            id: m.id.clone(),
            role: m.role.clone(),
            // Message.content is serde_json::Value; wrap the String
            content: serde_json::Value::String(m.content.clone()),
            created_at: None,
        })
        .collect();

    // Append any new assistant messages generated during this run
    // (those beyond the original message count)
    let original_count = original.len();
    for (i, msg) in history.iter().enumerate() {
        if i < original_count {
            continue; // already in original
        }
        if msg.role == MsgRole::Assistant {
            let text = msg
                .parts
                .iter()
                .filter_map(|p| if let Part::Text(t) = p { Some(t.as_str()) } else { None })
                .collect::<Vec<_>>()
                .join("");
            result.push(Message {
                id: uuid::Uuid::new_v4().to_string(),
                role: "assistant".into(),
                content: serde_json::Value::String(text),
                created_at: None,
            });
        }
    }

    result
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_tool_defs_respects_enabled_list() {
        let defs = build_tool_defs(&["bash".to_string(), "read".to_string()]);
        assert_eq!(defs.len(), 2);
    }

    #[test]
    fn build_tool_defs_empty_means_all() {
        let defs = build_tool_defs(&[]);
        assert_eq!(defs.len(), 9);
    }
}
```

**Note for implementer:** The `ProjectStorage::write_messages` method is from Plan A. Check its exact signature in `src-tauri/src/project/storage.rs` — it may be `write_messages(&self, folder, chat_id, messages)`. Adjust the call accordingly. The `Message` struct from Plan A may differ from `ChatMessage` — look at the fields and align them.

- [ ] **Step 7: Run all AI tests**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test ai:: 2>&1 | tail -30
```

Expected: all AI module tests pass. The stream tests are unit tests only (2 tests). The tool executor tests require `tempfile` (already in dev-deps).

- [ ] **Step 8: Commit**

```bash
cd .worktrees/feat-rust-ai
git add src-tauri/src/ai/tool_executor.rs src-tauri/src/ai/stream.rs
git commit -m "feat(ai): implement ToolExecutor with approval flow and agentic loop"
```

---

## Chunk 5: Commands, wiring, and generate_title

### Task 5: Add Tauri commands for AI streaming + generate_title

**Files:**
- Create: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing test for command argument parsing**

Create `src-tauri/src/commands/ai.rs` with just tests:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn empty_enabled_tools_means_all() {
        // Ensures filter_tool_defs([]) returns non-empty
        let defs = crate::ai::tool_executor::filter_tool_defs(&[]);
        assert!(!defs.is_empty());
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test commands::ai::tests 2>&1 | tail -10
```

Expected: compile error (module not declared).

- [ ] **Step 3: Add `pub mod ai` to commands/mod.rs**

```rust
pub mod ai;
pub mod project;
pub mod skills;
pub mod storage;
```

- [ ] **Step 4: Implement `commands/ai.rs`**

```rust
use tauri::Manager;

use crate::ai::{stream::AgentLoopParams, ChatMessage};
use crate::session::SessionManager;

// ── start_chat_stream ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_chat_stream(
    app: tauri::AppHandle,
    window_label: String,
    folder: String,
    chat_id: String,
    messages: Vec<ChatMessage>,
    model: String,
    provider: String,
    #[allow(non_snake_case)]
    enabledTools: Option<Vec<String>>,
) -> Result<(), String> {
    log::info!(
        "[AI] start_chat_stream: window={window_label} chat={chat_id} model={model} provider={provider}"
    );

    let session_mgr = app
        .state::<SessionManager>()
        .inner()
        .clone();

    // Ensure window is registered (may have been opened by open_project)
    // If not registered, register it now with the given folder
    if session_mgr.get_folder(&window_label).is_none() {
        session_mgr.register(window_label.clone(), std::path::PathBuf::from(&folder));
    }

    let abort = session_mgr.set_stream_abort(&window_label);
    let pending_approvals = session_mgr
        .pending_approvals(&window_label)
        .ok_or("Window not found in session manager")?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let enabled_tools = enabledTools.unwrap_or_default();
    let params = AgentLoopParams {
        window_label: window_label.clone(),
        folder: std::path::PathBuf::from(folder),
        chat_id,
        messages,
        model,
        provider_name: provider,
        enabled_tools,
        abort,
        pending_approvals,
        app_handle: app.clone(),
        app_data_dir: app_data,
    };

    // Spawn the agentic loop as a background task
    tokio::spawn(async move {
        if let Err(e) = crate::ai::stream::run_agentic_loop(params).await {
            log::error!("[AI] Agentic loop error: {e}");
        }
        // Clear the abort token when done
        session_mgr.cancel_stream(&window_label);
    });

    Ok(())
}

// ── stop_chat_stream ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn stop_chat_stream(
    app: tauri::AppHandle,
    window_label: String,
) -> Result<(), String> {
    log::info!("[AI] stop_chat_stream: window={window_label}");
    let session_mgr = app.state::<SessionManager>().inner().clone();
    session_mgr.cancel_stream(&window_label);
    Ok(())
}

// ── approve_tool_call ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn approve_tool_call(
    app: tauri::AppHandle,
    window_label: String,
    tool_call_id: String,
    approved: bool,
) -> Result<(), String> {
    log::info!(
        "[AI] approve_tool_call: window={window_label} tool_call_id={tool_call_id} approved={approved}"
    );

    let session_mgr = app.state::<SessionManager>().inner().clone();
    let pending = session_mgr
        .pending_approvals(&window_label)
        .ok_or("Window not found")?;

    if let Some((_, sender)) = pending.remove(&tool_call_id) {
        sender.send(approved).ok();
        Ok(())
    } else {
        Err(format!("No pending approval for tool_call_id: {tool_call_id}"))
    }
}

// ── generate_title ─────────────────────────────────────────────────────────────

/// Generate a short chat title from the first user message.
/// Uses the first configured AI provider. Returns None if no provider is set up.
#[tauri::command]
pub async fn generate_title(
    _app: tauri::AppHandle,
    first_user_message: String,
) -> Result<Option<String>, String> {
    use crate::ai::provider::{create_provider, StreamConfig};
    use crate::ai::ProviderEvent;
    use crate::keychain;
    use tokio::sync::mpsc;
    use tokio_util::sync::CancellationToken;

    let configs = keychain::get_all_configs_providers();

    // Try providers in preference order
    let provider_order = ["openai", "anthropic", "minimax"];
    let (provider_name, api_key, base_url) = provider_order
        .iter()
        .find_map(|&name| {
            configs.get(name).map(|cfg| {
                (
                    name.to_string(),
                    cfg.api_key.clone(),
                    cfg.base_url.clone(),
                )
            })
        })
        .ok_or("No AI provider configured. Please add an API key in Settings.")?;

    // Pick a cheap model for title generation
    let model = match provider_name.as_str() {
        "anthropic" => "claude-haiku-4-5-20251001",
        "minimax" => "MiniMax-Text-01",
        _ => "gpt-4o-mini",
    };

    let provider = create_provider(&provider_name, &api_key, base_url.as_deref());

    let system = "You are a concise title generator. Respond with only the title — no quotes, no punctuation at the end, max 6 words.";
    let messages = vec![crate::ai::ProviderMessage {
        role: crate::ai::MsgRole::User,
        parts: vec![crate::ai::Part::Text(format!(
            "Generate a short title for a conversation that starts with: {first_user_message}"
        ))],
    }];

    let (tx, mut rx) = mpsc::channel::<ProviderEvent>(64);
    let abort = CancellationToken::new();

    let config = StreamConfig {
        model: model.to_string(),
        system_prompt: system.to_string(),
        abort: abort.clone(),
    };

    tokio::spawn(async move {
        let _ = provider
            .stream_chat(messages, vec![], config, tx)
            .await;
    });

    let mut title = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            ProviderEvent::TextDelta { delta } => title.push_str(&delta),
            ProviderEvent::Error(_) | ProviderEvent::StopReason(_) => break,
            _ => {}
        }
    }

    let trimmed = title.trim().to_string();
    Ok(if trimmed.is_empty() { None } else { Some(trimmed) })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #[test]
    fn empty_enabled_tools_means_all() {
        let defs = crate::ai::tool_executor::filter_tool_defs(&[]);
        assert!(!defs.is_empty());
    }
}
```

- [ ] **Step 5: Register new commands in lib.rs**

In `src-tauri/src/lib.rs`, add to the `invoke_handler`:

```rust
commands::ai::start_chat_stream,
commands::ai::stop_chat_stream,
commands::ai::approve_tool_call,
commands::ai::generate_title,
```

Also add `pub mod ai;` near the top with the other `mod` declarations. The full updated lib.rs `invoke_handler` section:

```rust
.invoke_handler(tauri::generate_handler![
    greet,
    save_provider_config,
    get_provider_config,
    delete_provider_config,
    list_all_providers,
    wait_for_sidecar_port,
    commands::storage::list_chats,
    commands::storage::create_chat,
    commands::storage::delete_chat,
    commands::storage::update_chat_title,
    commands::storage::load_messages,
    commands::skills::list_skills,
    commands::skills::set_skill_enabled,
    commands::project::open_project,
    commands::ai::start_chat_stream,
    commands::ai::stop_chat_stream,
    commands::ai::approve_tool_call,
    commands::ai::generate_title,
])
```

- [ ] **Step 6: Run all tests**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test 2>&1 | tail -30
```

Expected: 70+ tests pass (67 from Plan A + the new AI tests). Zero failures.

- [ ] **Step 7: Run cargo clippy**

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo clippy -- -D warnings 2>&1 | head -40
```

Fix any warnings. Common fixes needed:
- `allow(non_snake_case)` on `enabledTools` parameter or rename to `enabled_tools` (update frontend call to match)
- Unused imports in ai/ modules
- Dead code on `_base_url` field (use `#[allow(dead_code)]` or expose via method)

- [ ] **Step 8: Commit**

```bash
cd .worktrees/feat-rust-ai
git add src-tauri/src/commands/ai.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(ai): add start_chat_stream, stop_chat_stream, approve_tool_call, generate_title commands"
```

---

## Plan B Complete

After all 5 tasks are done and tests pass, run the full test suite one final time:

```bash
cd .worktrees/feat-rust-ai/src-tauri
cargo test 2>&1 | tail -10
```

Tag the completion:

```bash
cd .worktrees/feat-rust-ai
git tag plan-b-complete
```

The sidecar is still running in parallel at this point — Plan C will remove it entirely and migrate the frontend to use these new commands.
