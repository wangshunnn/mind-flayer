mod setup;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger
    // In development: RUST_LOG=debug pnpm dev
    // In production: logs are suppressed unless RUST_LOG is set
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .setup(setup::init)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:chats.db",
                    vec![
                        // Initial schema
                        tauri_plugin_sql::Migration {
                            version: 1,
                            description: "create initial tables",
                            sql: "
                                CREATE TABLE IF NOT EXISTS chats (
                                    id TEXT PRIMARY KEY NOT NULL,
                                    title TEXT NOT NULL,
                                    created_at INTEGER NOT NULL,
                                    updated_at INTEGER NOT NULL
                                );
                                CREATE TABLE IF NOT EXISTS messages (
                                    id TEXT PRIMARY KEY NOT NULL,
                                    chat_id TEXT NOT NULL,
                                    role TEXT NOT NULL,
                                    content_json TEXT NOT NULL,
                                    created_at INTEGER NOT NULL,
                                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
                                );
                                CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
                                CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
                                CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at);
                            ",
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
