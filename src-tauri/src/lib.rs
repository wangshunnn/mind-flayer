mod setup;

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, State};
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "baseURL")]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChunk {
    pub r#type: String,
    pub content: Option<String>,
    pub error: Option<String>,
}

// Store sidecar port
pub struct SidecarState {
    port: Arc<Mutex<Option<u16>>>,
}

// Start sidecar service
#[command]
async fn start_sidecar(app: AppHandle, state: State<'_, SidecarState>) -> Result<u16, String> {
    let port = 3737u16;

    // Check if already started
    {
        let current_port = state.port.lock().unwrap();
        if current_port.is_some() {
            return Ok(port);
        }
    }

    // Use shell plugin to start sidecar
    let sidecar_command = app
        .shell()
        .sidecar("mind-flayer-sidecar")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

    // Start process
    let (_rx, _child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Wait for service to start
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Save port
    {
        let mut current_port = state.port.lock().unwrap();
        *current_port = Some(port);
    }

    Ok(port)
}

// Send chat message (streaming)
#[command]
async fn chat_stream(
    app: AppHandle,
    request: ChatRequest,
    state: State<'_, SidecarState>,
) -> Result<(), String> {
    let port = {
        let current_port = state.port.lock().unwrap();
        current_port.ok_or("Sidecar not started")?
    };

    let client = reqwest::Client::new();
    let url = format!("http://localhost:{}/api/chat", port);

    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Server error: {}", response.status()));
    }

    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        // Parse SSE data
        for line in text.lines() {
            if line.starts_with("data: ") {
                let data = &line[6..];
                if let Ok(chunk_data) = serde_json::from_str::<ChatChunk>(data) {
                    app.emit("chat-chunk", chunk_data)
                        .map_err(|e| format!("Failed to emit event: {}", e))?;
                }
            }
        }
    }

    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(setup::init)
        .manage(SidecarState {
            port: Arc::new(Mutex::new(None)),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet, start_sidecar, chat_stream])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
