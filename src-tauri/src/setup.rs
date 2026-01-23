use log::{debug, error, info};
use std::sync::{Arc, Mutex};
use tauri::{App, Manager};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "windows")]
use window_vibrancy::apply_blur;

/// Sidecar server port
const SIDECAR_PORT: u16 = 3737;

/// State to hold the sidecar process handle
pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
}

/// Push API keys configuration to sidecar via stdin
pub fn push_config_to_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let configs = crate::keychain::get_all_configs_providers();

    info!("Retrieved {} configs from keychain", configs.len());
    for (provider, _) in &configs {
        info!("  - {}", provider);
    }

    // Convert to JSON format for sidecar
    let mut json_configs = serde_json::Map::new();
    for (provider, config) in configs {
        json_configs.insert(
            provider,
            serde_json::json!({
                "apiKey": config.api_key,
                "baseUrl": config.base_url,
            }),
        );
    }

    let message = serde_json::json!({
        "type": "config_update",
        "configs": json_configs
    });

    let message_str = format!("{}\n", message.to_string());
    debug!(
        "Pushing config message: {}",
        &message_str[0..message_str.len().min(200)]
    );
    let message_bytes = message_str.as_bytes();

    let state = app.state::<SidecarState>();
    let mut guard = state
        .child
        .lock()
        .map_err(|e| format!("Failed to acquire sidecar lock: {}", e))?;

    if let Some(child) = guard.as_mut() {
        child.write(message_bytes).map_err(|e| {
            let err = format!("Failed to write to sidecar stdin: {}", e);
            error!("{}", err);
            err
        })?;
        info!(
            "Pushed config update to sidecar: {} providers",
            json_configs.len()
        );
        Ok(())
    } else {
        Err("Sidecar process not running".to_string())
    }
}

/// setup window vibrancy effects and start sidecar
pub fn init(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window("main").unwrap();

    #[cfg(target_os = "macos")]
    apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
        .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

    #[cfg(target_os = "windows")]
    apply_blur(&window, Some((18, 18, 18, 125)))
        .expect("Unsupported platform! 'apply_blur' is only supported on Windows");

    // Initialize sidecar state
    let sidecar_state = SidecarState {
        child: Arc::new(Mutex::new(None)),
    };

    let child_ref = Arc::clone(&sidecar_state.child);
    app.manage(sidecar_state);

    // Handle application exit
    let app_handle_for_cleanup = app.handle().clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            info!("Main window destroyed, cleaning up sidecar...");
            tauri::async_runtime::block_on(cleanup_sidecar(app_handle_for_cleanup.clone()));
        }
    });

    // Start sidecar service
    let app_handle = app.handle().clone();
    let app_handle_for_push = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        match start_sidecar_internal(app_handle, child_ref).await {
            Ok(port) => {
                info!("Sidecar started successfully on port {}", port);

                // Push initial API keys configuration to sidecar via stdin
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                if let Err(e) = push_config_to_sidecar(&app_handle_for_push) {
                    error!("Failed to push initial config to sidecar: {}", e);
                }
            }
            Err(e) => error!("Failed to start sidecar: {}", e),
        }
    });

    Ok(())
}

/// Internal function: start sidecar
async fn start_sidecar_internal(
    app: tauri::AppHandle,
    child_ref: Arc<Mutex<Option<CommandChild>>>,
) -> Result<u16, String> {
    let port = SIDECAR_PORT;

    info!("Starting sidecar on port {}...", port);

    // Use shell plugin to start sidecar
    let sidecar_command = app.shell().sidecar("mind-flayer-sidecar").map_err(|e| {
        let err_msg = format!("Failed to create sidecar command: {}", e);
        error!("{}", err_msg);
        err_msg
    })?;

    debug!("Sidecar command created");

    // Start process
    let (mut rx, child) = sidecar_command.spawn().map_err(|e| {
        let err_msg = format!("Failed to spawn sidecar: {}", e);
        error!("{}", err_msg);
        err_msg
    })?;

    // Store the child process handle
    if let Ok(mut guard) = child_ref.lock() {
        *guard = Some(child);
        debug!("Sidecar process spawned and stored");
    } else {
        error!("Failed to store sidecar child process");
    }

    // Listen to output
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    debug!("[Sidecar] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    error!("[Sidecar Error] {}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    // Wait for service to start and verify
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

    // Verify if service started successfully
    match reqwest::get(format!("http://localhost:{}/health", port)).await {
        Ok(resp) if resp.status().is_success() => {
            info!("Sidecar health check passed");
            Ok(port)
        }
        Ok(resp) => Err(format!(
            "Sidecar health check failed with status: {}",
            resp.status()
        )),
        Err(e) => Err(format!("Failed to connect to sidecar: {}", e)),
    }
}

/// Cleanup function: gracefully shutdown sidecar
pub async fn cleanup_sidecar(app: tauri::AppHandle) {
    info!("Cleaning up sidecar...");

    let state = app.state::<SidecarState>();

    // Kill the sidecar process (sends SIGTERM, which triggers graceful shutdown)
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.take() {
            match child.kill() {
                Ok(_) => {
                    info!("Sidecar process termination signal sent");
                    // Give it a moment to shutdown gracefully
                    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                }
                Err(e) => error!("Failed to kill sidecar process: {}", e),
            }
        }
    }

    // Additional cleanup for port (macOS/Linux) - fallback to ensure port is freed
    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;

        let port_cleanup = Command::new("sh")
            .arg("-c")
            .arg(format!(
                "lsof -ti:{} | xargs kill -9 2>/dev/null || true",
                SIDECAR_PORT
            ))
            .output();

        match port_cleanup {
            Ok(_) => debug!("Port cleanup completed"),
            Err(e) => debug!("Port cleanup failed: {}", e),
        }
    }

    info!("Sidecar cleanup completed");
}
