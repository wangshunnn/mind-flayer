use log::{debug, error, info, warn};
use std::{
    net::TcpListener,
    sync::{Arc, Mutex},
};
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Sidecar server port
const PREFERRED_SIDECAR_PORT: u16 = 3737;
const SIDECAR_START_MAX_ATTEMPTS: u8 = 3;
const SIDECAR_HEALTH_CHECK_TIMEOUT_MS: u64 = 10_000;
const SIDECAR_HEALTH_CHECK_INTERVAL_MS: u64 = 200;
const SIDECAR_PORT_WAIT_TIMEOUT_MS: u64 = 15_000;
const SIDECAR_PORT_WAIT_INTERVAL_MS: u64 = 100;

/// State to hold the sidecar process handle
pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
    pub port: Arc<Mutex<Option<u16>>>,
}

pub fn create_sidecar_state() -> SidecarState {
    SidecarState {
        child: Arc::new(Mutex::new(None)),
        port: Arc::new(Mutex::new(None)),
    }
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

    let message_str = format!("{}\n", message);
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

pub async fn start_sidecar(app: tauri::AppHandle) -> Result<u16, String> {
    let (child_ref, port_ref) = {
        let state = app.state::<SidecarState>();
        (Arc::clone(&state.child), Arc::clone(&state.port))
    };
    start_sidecar_internal(app, child_ref, port_ref).await
}

fn can_bind_to_port(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn pick_random_available_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("Failed to bind random local port: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to resolve random local port: {}", e))?
        .port();
    Ok(port)
}

fn select_port() -> Result<u16, String> {
    if can_bind_to_port(PREFERRED_SIDECAR_PORT) {
        return Ok(PREFERRED_SIDECAR_PORT);
    }

    pick_random_available_port()
}

fn sidecar_health_url(port: u16) -> String {
    format!("http://127.0.0.1:{}/health", port)
}

fn clear_sidecar_port(port_ref: &Arc<Mutex<Option<u16>>>) {
    if let Ok(mut guard) = port_ref.lock() {
        *guard = None;
    } else {
        error!("Failed to clear sidecar port state");
    }
}

fn set_sidecar_port(port_ref: &Arc<Mutex<Option<u16>>>, port: u16) {
    if let Ok(mut guard) = port_ref.lock() {
        *guard = Some(port);
    } else {
        error!("Failed to set sidecar port state");
    }
}

fn kill_sidecar_process(child_ref: &Arc<Mutex<Option<CommandChild>>>) {
    if let Ok(mut guard) = child_ref.lock() {
        if let Some(child) = guard.take() {
            if let Err(e) = child.kill() {
                error!("Failed to kill sidecar process: {}", e);
            }
        }
    } else {
        error!("Failed to acquire sidecar child lock for cleanup");
    }
}

async fn wait_for_sidecar_health(
    port: u16,
    timeout: tokio::time::Duration,
    interval: tokio::time::Duration,
) -> Result<(), String> {
    let started_at = tokio::time::Instant::now();
    let health_url = sidecar_health_url(port);
    let mut last_error = String::from("Sidecar did not respond yet");

    loop {
        if started_at.elapsed() >= timeout {
            return Err(format!(
                "Sidecar health check timed out on port {} after {}ms: {}",
                port,
                timeout.as_millis(),
                last_error
            ));
        }

        match reqwest::get(&health_url).await {
            Ok(resp) if resp.status().is_success() => {
                info!("Sidecar health check passed on port {}", port);
                return Ok(());
            }
            Ok(resp) => {
                last_error = format!("Health endpoint returned {}", resp.status());
            }
            Err(e) => {
                last_error = format!("Failed to connect to sidecar: {}", e);
            }
        }

        tokio::time::sleep(interval).await;
    }
}

/// Internal function: start sidecar
async fn start_sidecar_internal(
    app: tauri::AppHandle,
    child_ref: Arc<Mutex<Option<CommandChild>>>,
    port_ref: Arc<Mutex<Option<u16>>>,
) -> Result<u16, String> {
    clear_sidecar_port(&port_ref);

    let mut last_error = String::from("Unknown sidecar startup failure");

    for attempt in 1..=SIDECAR_START_MAX_ATTEMPTS {
        let port = if attempt == 1 {
            select_port()?
        } else {
            pick_random_available_port()?
        };

        info!(
            "Starting sidecar attempt {}/{} on port {}...",
            attempt, SIDECAR_START_MAX_ATTEMPTS, port
        );

        // Use shell plugin to start sidecar
        let sidecar_command = app
            .shell()
            .sidecar("mind-flayer-sidecar")
            .map_err(|e| {
                let err_msg = format!("Failed to create sidecar command: {}", e);
                error!("{}", err_msg);
                err_msg
            })?
            .env("SIDECAR_PORT", port.to_string());

        debug!("Sidecar command created for port {}", port);

        // Start process
        let (mut rx, child) = match sidecar_command.spawn() {
            Ok(result) => result,
            Err(e) => {
                last_error = format!("Failed to spawn sidecar on port {}: {}", port, e);
                error!("{}", last_error);
                continue;
            }
        };

        // Store the child process handle
        match child_ref.lock() {
            Ok(mut guard) => {
                *guard = Some(child);
                debug!("Sidecar process spawned and stored");
            }
            Err(e) => {
                last_error = format!("Failed to store sidecar child process: {}", e);
                if let Err(kill_err) = child.kill() {
                    error!("Failed to kill orphaned sidecar process: {}", kill_err);
                }
                error!("{}", last_error);
                continue;
            }
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

        match wait_for_sidecar_health(
            port,
            tokio::time::Duration::from_millis(SIDECAR_HEALTH_CHECK_TIMEOUT_MS),
            tokio::time::Duration::from_millis(SIDECAR_HEALTH_CHECK_INTERVAL_MS),
        )
        .await
        {
            Ok(()) => {
                set_sidecar_port(&port_ref, port);
                return Ok(port);
            }
            Err(e) => {
                last_error = e;
                warn!(
                    "Sidecar failed to become healthy on attempt {}/{}: {}",
                    attempt, SIDECAR_START_MAX_ATTEMPTS, last_error
                );
                kill_sidecar_process(&child_ref);
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }
        }
    }

    clear_sidecar_port(&port_ref);
    Err(last_error)
}

pub async fn wait_for_sidecar_port(
    app: tauri::AppHandle,
    timeout_ms: Option<u64>,
) -> Result<u16, String> {
    let timeout_ms = timeout_ms.unwrap_or(SIDECAR_PORT_WAIT_TIMEOUT_MS);
    let timeout = tokio::time::Duration::from_millis(timeout_ms);
    let poll_interval = tokio::time::Duration::from_millis(SIDECAR_PORT_WAIT_INTERVAL_MS);
    let started_at = tokio::time::Instant::now();

    loop {
        let sidecar_port = {
            let state = app.state::<SidecarState>();
            let guard = state
                .port
                .lock()
                .map_err(|e| format!("Failed to acquire sidecar port lock: {}", e))?;
            *guard
        };

        if let Some(port) = sidecar_port {
            return Ok(port);
        }

        if started_at.elapsed() >= timeout {
            return Err(format!(
                "Timed out waiting for sidecar port after {}ms",
                timeout_ms
            ));
        }

        tokio::time::sleep(poll_interval).await;
    }
}

/// Cleanup function: gracefully shutdown sidecar
pub async fn cleanup_sidecar(app: tauri::AppHandle) {
    info!("Cleaning up sidecar...");

    let state = app.state::<SidecarState>();
    let port_to_cleanup = match state.port.lock() {
        Ok(mut guard) => guard.take(),
        Err(e) => {
            error!("Failed to acquire sidecar port lock: {}", e);
            None
        }
    };

    // Kill the sidecar process (sends SIGTERM, which triggers graceful shutdown)
    let (sidecar_pid, sidecar_terminated) = if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.take() {
            let pid = child.pid();
            match child.kill() {
                Ok(_) => {
                    info!("Sidecar process termination signal sent");
                    (Some(pid), true)
                }
                Err(e) => {
                    error!("Failed to kill sidecar process: {}", e);
                    (Some(pid), false)
                }
            }
        } else {
            (None, false)
        }
    } else {
        (None, false)
    };

    if sidecar_terminated {
        // Give it a moment to shutdown gracefully
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    // Additional cleanup for port (macOS/Linux) - fallback to ensure port is freed
    #[cfg(not(target_os = "windows"))]
    {
        if let (Some(port), Some(pid)) = (port_to_cleanup, sidecar_pid) {
            if is_pid_listening_on_port(pid, port) {
                warn!(
                    "Sidecar pid {} is still listening on port {}, force killing...",
                    pid, port
                );
                force_kill_pid(pid);
            } else {
                debug!("No forced port cleanup needed for pid {} on {}", pid, port);
            }
        }
    }

    info!("Sidecar cleanup completed");
}

#[cfg(not(target_os = "windows"))]
fn is_pid_listening_on_port(pid: u32, port: u16) -> bool {
    use std::process::Command;

    let output = match Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            debug!("Failed to inspect listeners on port {}: {}", port, e);
            return false;
        }
    };

    if !output.status.success() {
        return false;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .any(|listening_pid| listening_pid == pid)
}

#[cfg(not(target_os = "windows"))]
fn force_kill_pid(pid: u32) {
    use std::process::Command;

    match Command::new("kill").args(["-9", &pid.to_string()]).status() {
        Ok(status) if status.success() => debug!("Force killed sidecar pid {}", pid),
        Ok(status) => debug!("Failed to force kill pid {}: exit status {}", pid, status),
        Err(e) => debug!("Failed to run force kill for pid {}: {}", pid, e),
    }
}
