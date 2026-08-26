use serde::Deserialize;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCommit {
    chat_id: String,
    messages: Vec<Value>,
    message_ids: Vec<String>,
    context_state: Option<Value>,
}

pub const CONTEXT_MIGRATION: &str = "
    ALTER TABLE messages ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE messages ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
    UPDATE messages SET ordinal = rowid;
    CREATE TABLE chat_context_events (
        id TEXT PRIMARY KEY NOT NULL,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        content_json TEXT NOT NULL
    );
    CREATE INDEX idx_chat_context_events ON chat_context_events(chat_id);
    CREATE TABLE chat_context_usage (
        chat_id TEXT PRIMARY KEY NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        content_json TEXT NOT NULL
    );
";

async fn commit(pool: &SqlitePool, payload: ChatCommit) -> Result<(), String> {
    let mut transaction = pool.begin().await.map_err(|e| e.to_string())?;
    let exists = sqlx::query("SELECT id FROM chats WHERE id = ?")
        .bind(&payload.chat_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err("Chat no longer exists".into());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;
    for message in payload.messages {
        let id = message
            .get("id")
            .and_then(Value::as_str)
            .ok_or("Missing message id")?;
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .ok_or("Missing message role")?;
        let ordinal = payload
            .message_ids
            .iter()
            .position(|candidate| candidate == id)
            .ok_or("Message missing from active history")? as i64;
        let existing = sqlx::query("SELECT chat_id FROM messages WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|e| e.to_string())?;
        if existing.is_some_and(|row| row.get::<String, _>("chat_id") != payload.chat_id) {
            return Err("Message belongs to another chat".into());
        }
        sqlx::query("INSERT INTO messages(id, chat_id, role, content_json, created_at, ordinal, active) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET content_json = excluded.content_json, ordinal = excluded.ordinal, active = 1 WHERE messages.content_json != excluded.content_json OR messages.active != 1 OR messages.ordinal != excluded.ordinal")
            .bind(id).bind(&payload.chat_id).bind(role).bind(message.to_string()).bind(now).bind(ordinal)
            .execute(&mut *transaction).await.map_err(|e| e.to_string())?;
    }
    // Regeneration changes the active view without deleting the original response.
    sqlx::query("UPDATE messages SET ordinal = COALESCE((SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value = messages.id), ordinal), active = CASE WHEN id IN (SELECT value FROM json_each(?)) THEN 1 ELSE 0 END WHERE chat_id = ?")
        .bind(serde_json::to_string(&payload.message_ids).map_err(|e| e.to_string())?)
        .bind(serde_json::to_string(&payload.message_ids).map_err(|e| e.to_string())?).bind(&payload.chat_id)
        .execute(&mut *transaction).await.map_err(|e| e.to_string())?;
    if let Some(state) = payload.context_state {
        let events = state
            .get("events")
            .and_then(Value::as_array)
            .ok_or("Invalid context events")?;
        for event in events {
            let id = event
                .get("id")
                .and_then(Value::as_str)
                .ok_or("Missing context event id")?;
            let existing =
                sqlx::query("SELECT content_json, chat_id FROM chat_context_events WHERE id = ?")
                    .bind(id)
                    .fetch_optional(&mut *transaction)
                    .await
                    .map_err(|e| e.to_string())?;
            if let Some(row) = existing {
                if row.get::<String, _>("chat_id") != payload.chat_id
                    || row.get::<String, _>("content_json") != event.to_string()
                {
                    return Err("Context events are immutable".into());
                }
            } else {
                if event.get("type").and_then(Value::as_str) == Some("compaction") {
                    let boundary = event
                        .get("firstKeptEntryId")
                        .and_then(Value::as_str)
                        .and_then(|id| id.rsplit_once(':').map(|pair| pair.0))
                        .ok_or("Invalid compaction boundary")?;
                    let source =
                        sqlx::query("SELECT id FROM messages WHERE id = ? AND chat_id = ?")
                            .bind(boundary)
                            .bind(&payload.chat_id)
                            .fetch_optional(&mut *transaction)
                            .await
                            .map_err(|e| e.to_string())?;
                    if source.is_none() {
                        return Err("Compaction source is not persisted".into());
                    }
                }
                sqlx::query(
                    "INSERT INTO chat_context_events(id, chat_id, content_json) VALUES (?, ?, ?)",
                )
                .bind(id)
                .bind(&payload.chat_id)
                .bind(event.to_string())
                .execute(&mut *transaction)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
        sqlx::query("INSERT INTO chat_context_usage(chat_id, content_json) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET content_json = excluded.content_json")
            .bind(&payload.chat_id).bind(state.get("usage").unwrap_or(&Value::Null).to_string()).execute(&mut *transaction).await.map_err(|e| e.to_string())?;
    }
    sqlx::query("UPDATE chats SET updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(&payload.chat_id)
        .execute(&mut *transaction)
        .await
        .map_err(|e| e.to_string())?;
    transaction.commit().await.map_err(|e| e.to_string())
}

/// Atomically commit raw messages and their independent context checkpoints.
#[tauri::command]
pub async fn commit_chat_context(
    instances: tauri::State<'_, DbInstances>,
    payload: ChatCommit,
) -> Result<(), String> {
    let pool = {
        let instances = instances.0.read().await;
        let Some(DbPool::Sqlite(pool)) = instances.get("sqlite:chats.db") else {
            return Err("Chat database is not loaded".into());
        };
        pool.clone()
    };
    commit(&pool, payload).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    async fn database() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql("CREATE TABLE chats(id TEXT PRIMARY KEY, updated_at INTEGER); CREATE TABLE messages(id TEXT PRIMARY KEY, chat_id TEXT, role TEXT, content_json TEXT, created_at INTEGER); INSERT INTO chats VALUES ('chat', 0);").execute(&pool).await.unwrap();
        sqlx::raw_sql(CONTEXT_MIGRATION)
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    fn payload(text: &str, event: Value) -> ChatCommit {
        ChatCommit {
            chat_id: "chat".into(),
            messages: vec![json!({"id":"u1","role":"user","parts":[{"type":"text","text":text}]})],
            message_ids: vec!["u1".into()],
            context_state: Some(json!({"version":1,"events":[event]})),
        }
    }

    #[tokio::test]
    async fn checkpoints_are_atomic_and_events_are_immutable() {
        let pool = database().await;
        let event =
            json!({"id":"c1","type":"compaction","firstKeptEntryId":"u1:0","summary":"Summary"});
        commit(&pool, payload("Original", event.clone()))
            .await
            .unwrap();
        commit(&pool, payload("Original", event)).await.unwrap();
        let conflict =
            json!({"id":"c1","type":"compaction","firstKeptEntryId":"u1:0","summary":"Changed"});
        assert!(commit(&pool, payload("Should roll back", conflict))
            .await
            .is_err());
        let text: String = sqlx::query_scalar("SELECT content_json FROM messages WHERE id = 'u1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(text.contains("Original"));
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM chat_context_events")
                .fetch_one(&pool)
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn missing_compaction_sources_roll_back_the_entire_checkpoint() {
        let pool = database().await;
        let event = json!({"id":"c1","type":"compaction","firstKeptEntryId":"missing:0","summary":"Summary"});
        assert!(commit(&pool, payload("Original", event)).await.is_err());
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM messages")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn changing_the_active_view_preserves_original_history() {
        let pool = database().await;
        let event = json!({"id":"t1","type":"temporal"});
        commit(&pool, payload("Original", event)).await.unwrap();
        commit(
            &pool,
            ChatCommit {
                chat_id: "chat".into(),
                messages: vec![],
                message_ids: vec![],
                context_state: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT active FROM messages WHERE id = 'u1'")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn appended_messages_follow_migrated_history_in_active_order() {
        let pool = database().await;
        commit(
            &pool,
            payload("Original", json!({"id":"t1","type":"temporal"})),
        )
        .await
        .unwrap();
        sqlx::query("UPDATE messages SET ordinal = 100 WHERE id = 'u1'")
            .execute(&pool)
            .await
            .unwrap();
        commit(
            &pool,
            ChatCommit {
                chat_id: "chat".into(),
                messages: vec![
                    json!({"id":"a1","role":"assistant","parts":[{"type":"text","text":"Reply"}]}),
                ],
                message_ids: vec!["u1".into(), "a1".into()],
                context_state: None,
            },
        )
        .await
        .unwrap();
        let ids: Vec<String> =
            sqlx::query_scalar("SELECT id FROM messages WHERE active = 1 ORDER BY ordinal")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(ids, vec!["u1", "a1"]);
    }

    #[tokio::test]
    async fn persistence_preserves_nested_tool_json_order_for_cache_prefixes() {
        let pool = database().await;
        let original = r#"{"id":"a1","role":"assistant","parts":[{"type":"tool-example","input":{"z":1,"a":2},"output":{"z":3,"a":4}}]}"#;
        commit(
            &pool,
            ChatCommit {
                chat_id: "chat".into(),
                messages: vec![serde_json::from_str(original).unwrap()],
                message_ids: vec!["a1".into()],
                context_state: None,
            },
        )
        .await
        .unwrap();
        let stored: String =
            sqlx::query_scalar("SELECT content_json FROM messages WHERE id = 'a1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored, original);
    }
}
