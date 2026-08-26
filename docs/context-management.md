# Conversation context and compaction

Mind Flayer keeps the original conversation separate from the model request. Desktop SQLite and Telegram snapshots retain complete UI messages, including reasoning, tool calls/results, and attachment references. Compaction never replaces those messages in the history view.

## Model context

`sidecar/src/context/engine.ts` splits history into stable `messageId:stepIndex` entries. A tool call and its result belong to the same entry. The latest applicable compaction contributes one fixed summary followed by the unchanged retained entries. A SHA-256 fingerprint of the summarized prefix invalidates a checkpoint if regeneration or editing changes its source. Display-only metadata does not affect this fingerprint.

Between compactions, model messages are appended. Date/time-zone notes are persisted separately and inserted once per new calendar day, not regenerated inside historical messages. Workspace content is refreshed at the next run; changes to workspace files, skills, tools, models, or reasoning settings may invalidate the provider cache. Compaction also changes the cached history prefix. Stable payloads make cache reuse possible, but do not guarantee provider cache hits or extend cache TTLs.

## Budget and summaries

All summarization instructions and message envelopes live in `sidecar/src/context/prompts.ts`. Edit `SUMMARIZATION_SYSTEM_PROMPT` to change the standalone summary instructions. `buildSummarizationPrompt` adds the previous summary, conversation fragment, and optional focus. The replay template is separate because changing it changes an existing conversation's cached prefix.

- Model capacities come from `shared/model-context.ts`, also used by the frontend catalogue.
- Defaults: 16,384 reserved tokens, a target of 20,000 recent tokens, and at most 4,096 summary output tokens. Small windows reduce these budgets.
- Local estimates follow Pi's `ceil(chars / 4)` heuristic, rounded per message. Count text, reasoning, serialized tool arguments/results, and about 1,200 tokens per image; do not count message IDs, provider metadata, or opaque image bytes. Generic non-image attachments retain the existing 4,096-token fallback. This is approximate and may underestimate Chinese or other non-ASCII text.
- Capacity uses the latest successful step's total usage (input including cache, plus output), then estimates only subsequent local tool results and new entries. Assistant output is not estimated again. The optional baselineTokens field preserves the measurement anchor across checkpoints; model/configuration/prefix changes invalidate it. Billing uses accumulated step usage separately and survives approval continuations.
- Unknown models have no assumed capacity. Threshold compaction is disabled; manual compaction and one overflow recovery attempt remain available.
- A standalone, tool-free request to the selected model produces a handoff summary. Later compactions incorporate the previous summary and the newly displaced retained history. Oversized summary inputs are processed chronologically in bounded fragments; opaque media bytes are excluded, not silently removed from the original history.
- An indivisible tool step or latest user message may still exceed capacity. The request then fails explicitly instead of silently deleting content.

## Shared execution and recovery

`sidecar/src/context/runner.ts` runs one AI SDK tool step at a time and emits one continuous UI message stream. This keeps the SDK's tool execution/approval behavior while allowing capacity checks and recovery between steps. The total limit is 20 successful steps with tools, or one without tools.

A recognized context overflow before the failing step emits content permits one compact-and-retry attempt. Successful earlier tools are represented by their saved results and are not executed again. Failures after partial output, other provider errors, and cancellation do not trigger automatic replay. Partial history is checkpointed.

The desktop request includes `contextState`. Transient `data-context-checkpoint` events contain changed raw messages, the active message ID order, and the independent context state. The first checkpoint includes the full source history; subsequent checkpoints include changed messages only. SQLite commits messages and context events in one Rust transaction. Existing context events are immutable. Telegram uses the same runner with an awaited atomic snapshot callback. Its version-2 format reads version-1 text histories without inventing missing tool traces.

Manual compaction is available in the desktop context indicator and through Telegram `/compact [instructions]`. The desktop endpoint is `POST /api/chat/compact`, with the same model headers/history/context state as `/api/chat`. Manual and automatic operations share a conversation lock. Desktop context records include summary usage for separate cost inspection.

User-facing controls call this action “Summarize conversation” (整理对话). Status messages explain what happened and what the user can do next; internal terms and failure diagnostics stay in code and logs.

When an opened desktop conversation has no capacity statistics, the UI inspects its effective context through `POST /api/chat/context-usage`. This local estimate includes system instructions, tool definitions, and the active summary projection; it does not require provider credentials, call a model, compact history, or write conversation state. Stale responses are ignored if the conversation changes. Until statistics are available, the panel explicitly shows an unavailable state instead of implying zero usage. The icon and its toolbar separator share one visibility condition.

## Verification

Core tests use the real AI SDK message conversion and mock provider streams, rather than mocking pruning. They cover stable prefixes, repeated compaction, restored checkpoints, split tool turns, source changes, oversized input, summary cancellation, overflow recovery, and preservation of partial output. Rust tests cover transaction rollback, immutable events, missing source messages, and preservation of inactive historical responses.
