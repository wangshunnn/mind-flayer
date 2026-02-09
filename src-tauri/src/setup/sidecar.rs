use log::{debug, error, info, warn};
use std::{
    net::TcpListener,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent, TerminatedPayload};
use tauri_plugin_shell::ShellExt;

/// Sidecar server port
const PREFERRED_SIDECAR_PORT: u16 = 3737;
const SIDECAR_START_MAX_ATTEMPTS: u8 = 3;
const SIDECAR_HEALTH_CHECK_TIMEOUT_MS: u64 = 10_000;
const SIDECAR_HEALTH_CHECK_INTERVAL_MS: u64 = 200;
const SIDECAR_PORT_WAIT_TIMEOUT_MS: u64 = 15_000;
const SIDECAR_PORT_WAIT_INTERVAL_MS: u64 = 100;
const SIDECAR_STDERR_BUFFER_MAX_BYTES: usize = 4 * 1024;
const SIDECAR_RETRY_DELAY_MS: u64 = 200;
const SIDECAR_SERVICE_NAME: &str = "mind-flayer-sidecar";
const SIDECAR_STARTUP_TOKEN_ENV_KEY: &str = "SIDECAR_STARTUP_TOKEN";

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

#[derive(Debug, Clone)]
struct SidecarTermination {
    code: Option<i32>,
    signal: Option<i32>,
    reason: String,
}

impl SidecarTermination {
    fn from_payload(payload: TerminatedPayload) -> Self {
        SidecarTermination {
            code: payload.code,
            signal: payload.signal,
            reason: "Received process termination event".to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SidecarStartupFailureKind {
    AddrInUse,
    Other,
}

#[derive(Debug)]
enum SidecarAttemptError {
    HealthCheck(String),
    Terminated(SidecarTermination),
}

struct SidecarAttemptMonitor {
    stderr_output: Arc<Mutex<String>>,
    terminated_rx: tokio::sync::oneshot::Receiver<SidecarTermination>,
}

fn append_stderr_output(stderr_output: &Arc<Mutex<String>>, chunk: &str) {
    if let Ok(mut guard) = stderr_output.lock() {
        guard.push_str(chunk.trim_end());
        guard.push('\n');
        trim_stderr_output_buffer(&mut guard);
    } else {
        error!("Failed to append to sidecar stderr buffer");
    }
}

fn trim_stderr_output_buffer(buffer: &mut String) {
    if buffer.len() <= SIDECAR_STDERR_BUFFER_MAX_BYTES {
        return;
    }

    let keep_from = buffer
        .char_indices()
        .find_map(|(idx, _)| {
            if idx >= buffer.len().saturating_sub(SIDECAR_STDERR_BUFFER_MAX_BYTES) {
                Some(idx)
            } else {
                None
            }
        })
        .unwrap_or(0);
    buffer.drain(..keep_from);
}

fn snapshot_stderr_output(stderr_output: &Arc<Mutex<String>>) -> String {
    match stderr_output.lock() {
        Ok(guard) => guard.trim().to_string(),
        Err(e) => {
            error!("Failed to read sidecar stderr buffer: {}", e);
            String::new()
        }
    }
}

fn extract_structured_bind_error_code(stderr_output: &str) -> Option<String> {
    for line in stderr_output.lines().rev() {
        if !line.to_ascii_lowercase().contains("bind_error") {
            continue;
        }

        for token in line.split_whitespace() {
            let (key, value) = match token.split_once('=') {
                Some(parts) => parts,
                None => continue,
            };

            if key.eq_ignore_ascii_case("code") {
                return Some(
                    value
                        .trim_matches(|c: char| c == ',' || c == ';')
                        .to_string(),
                );
            }
        }
    }

    None
}

fn is_addr_in_use_error(stderr_output: &str) -> bool {
    if let Some(code) = extract_structured_bind_error_code(stderr_output) {
        return code.eq_ignore_ascii_case("EADDRINUSE") || code.eq_ignore_ascii_case("AddrInUse");
    }

    let lower = stderr_output.to_ascii_lowercase();
    lower.contains("eaddrinuse")
        || lower.contains("addrinuse")
        || lower.contains("address already in use")
}

fn classify_startup_failure(stderr_output: &str) -> SidecarStartupFailureKind {
    if is_addr_in_use_error(stderr_output) {
        SidecarStartupFailureKind::AddrInUse
    } else {
        SidecarStartupFailureKind::Other
    }
}

fn should_fallback_to_random_port(attempt: u8, failure_kind: SidecarStartupFailureKind) -> bool {
    attempt == 1 && matches!(failure_kind, SidecarStartupFailureKind::AddrInUse)
}

fn format_attempt_failure(
    port: u16,
    attempt_error: &SidecarAttemptError,
    stderr_output: &str,
) -> String {
    let mut message = match attempt_error {
        SidecarAttemptError::HealthCheck(err) => err.clone(),
        SidecarAttemptError::Terminated(termination) => format!(
            "Sidecar terminated before becoming healthy on port {} (code: {:?}, signal: {:?}, reason: {})",
            port, termination.code, termination.signal, termination.reason
        ),
    };

    if !stderr_output.is_empty() {
        message.push_str(&format!(" | stderr: {}", stderr_output));
    }

    message
}

fn generate_sidecar_startup_token(attempt: u8, port: u16) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{}-{}-{}-{}", std::process::id(), attempt, port, nanos)
}

fn build_sidecar_health_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| format!("Failed to create sidecar health client: {}", e))
}

fn is_expected_health_payload(payload: &serde_json::Value, expected_startup_token: &str) -> bool {
    let status = payload.get("status").and_then(serde_json::Value::as_str);
    let service = payload.get("service").and_then(serde_json::Value::as_str);
    let startup_token = payload
        .get("startupToken")
        .and_then(serde_json::Value::as_str);

    status == Some("ok")
        && service == Some(SIDECAR_SERVICE_NAME)
        && startup_token == Some(expected_startup_token)
}

fn spawn_sidecar_event_monitor(
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
) -> SidecarAttemptMonitor {
    let stderr_output = Arc::new(Mutex::new(String::new()));
    let stderr_output_for_task = Arc::clone(&stderr_output);
    let (terminated_tx, terminated_rx) = tokio::sync::oneshot::channel::<SidecarTermination>();

    tauri::async_runtime::spawn(async move {
        let mut terminated_tx = Some(terminated_tx);

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    debug!("[Sidecar] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line).into_owned();
                    error!("[Sidecar Error] {}", text);
                    append_stderr_output(&stderr_output_for_task, &text);
                }
                CommandEvent::Error(text) => {
                    error!("[Sidecar Process Error] {}", text);
                    append_stderr_output(&stderr_output_for_task, &text);
                }
                CommandEvent::Terminated(payload) => {
                    let termination = SidecarTermination::from_payload(payload);
                    warn!(
                        "Sidecar process terminated (code: {:?}, signal: {:?})",
                        termination.code, termination.signal
                    );
                    if let Some(tx) = terminated_tx.take() {
                        let _ = tx.send(termination);
                    }
                }
                _ => {}
            }
        }

        if let Some(tx) = terminated_tx.take() {
            let _ = tx.send(SidecarTermination {
                code: None,
                signal: None,
                reason: "Sidecar process event stream closed".to_string(),
            });
        }
    });

    SidecarAttemptMonitor {
        stderr_output,
        terminated_rx,
    }
}

async fn wait_for_sidecar_ready(
    port: u16,
    timeout: tokio::time::Duration,
    interval: tokio::time::Duration,
    terminated_rx: tokio::sync::oneshot::Receiver<SidecarTermination>,
    expected_startup_token: String,
) -> Result<(), SidecarAttemptError> {
    let health_check = wait_for_sidecar_health(port, timeout, interval, &expected_startup_token);
    tokio::pin!(health_check);
    let mut terminated_rx = terminated_rx;

    tokio::select! {
        health_result = &mut health_check => health_result.map_err(SidecarAttemptError::HealthCheck),
        termination_result = &mut terminated_rx => {
            match termination_result {
                Ok(termination) => Err(SidecarAttemptError::Terminated(termination)),
                Err(_) => Err(SidecarAttemptError::Terminated(SidecarTermination {
                    code: None,
                    signal: None,
                    reason: "Sidecar termination signal channel dropped".to_string(),
                })),
            }
        }
    }
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
    expected_startup_token: &str,
) -> Result<(), String> {
    let started_at = tokio::time::Instant::now();
    let health_url = sidecar_health_url(port);
    let health_client = build_sidecar_health_client()?;
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

        match health_client.get(&health_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<serde_json::Value>().await {
                    Ok(payload) if is_expected_health_payload(&payload, expected_startup_token) => {
                        info!("Sidecar health check passed on port {}", port);
                        return Ok(());
                    }
                    Ok(payload) => {
                        let service = payload
                            .get("service")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("<missing>");
                        let startup_token = payload
                            .get("startupToken")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("<missing>");
                        last_error = format!(
                        "Health endpoint returned unexpected payload (service={}, startupToken={})",
                        service, startup_token
                    );
                    }
                    Err(e) => {
                        last_error = format!("Failed to parse health endpoint response: {}", e);
                    }
                }
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
        let use_preferred_port = attempt == 1;
        let port = if use_preferred_port {
            PREFERRED_SIDECAR_PORT
        } else {
            pick_random_available_port()?
        };
        let startup_token = generate_sidecar_startup_token(attempt, port);

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
            .env("SIDECAR_PORT", port.to_string())
            .env(SIDECAR_STARTUP_TOKEN_ENV_KEY, startup_token.clone());

        debug!("Sidecar command created for port {}", port);

        // Start process
        let (rx, child) = match sidecar_command.spawn() {
            Ok(result) => result,
            Err(e) => {
                last_error = format!("Failed to spawn sidecar on port {}: {}", port, e);
                error!("{}", last_error);
                if use_preferred_port {
                    clear_sidecar_port(&port_ref);
                    return Err(last_error);
                }
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
                if use_preferred_port {
                    clear_sidecar_port(&port_ref);
                    return Err(last_error);
                }
                continue;
            }
        }

        let monitor = spawn_sidecar_event_monitor(rx);

        match wait_for_sidecar_ready(
            port,
            tokio::time::Duration::from_millis(SIDECAR_HEALTH_CHECK_TIMEOUT_MS),
            tokio::time::Duration::from_millis(SIDECAR_HEALTH_CHECK_INTERVAL_MS),
            monitor.terminated_rx,
            startup_token,
        )
        .await
        {
            Ok(()) => {
                set_sidecar_port(&port_ref, port);
                return Ok(port);
            }
            Err(attempt_error) => {
                kill_sidecar_process(&child_ref);
                tokio::time::sleep(tokio::time::Duration::from_millis(SIDECAR_RETRY_DELAY_MS))
                    .await;

                let stderr_output = snapshot_stderr_output(&monitor.stderr_output);
                let failure_kind = classify_startup_failure(&stderr_output);
                last_error = format_attempt_failure(port, &attempt_error, &stderr_output);
                warn!(
                    "Sidecar failed to become healthy on attempt {}/{}: {}",
                    attempt, SIDECAR_START_MAX_ATTEMPTS, last_error
                );

                if should_fallback_to_random_port(attempt, failure_kind) {
                    info!(
                        "Preferred sidecar port {} is already in use, falling back to random port",
                        PREFERRED_SIDECAR_PORT
                    );
                    continue;
                }

                if use_preferred_port {
                    clear_sidecar_port(&port_ref);
                    return Err(last_error);
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_addr_in_use_from_structured_bind_error() {
        let stderr = "[sidecar] BIND_ERROR code=EADDRINUSE message=listen EADDRINUSE: address already in use 127.0.0.1:3737";
        assert!(is_addr_in_use_error(stderr));
    }

    #[test]
    fn detects_addr_in_use_from_node_error_text() {
        let stderr = "Error: listen EADDRINUSE: address already in use 127.0.0.1:3737";
        assert!(is_addr_in_use_error(stderr));
    }

    #[test]
    fn structured_bind_error_takes_priority_over_text_fallback() {
        let stderr = "[sidecar] BIND_ERROR code=EPERM message=address already in use";
        assert!(!is_addr_in_use_error(stderr));
    }

    #[test]
    fn does_not_detect_addr_in_use_for_non_conflict_error() {
        let stderr = "Error: listen EPERM: operation not permitted 127.0.0.1:3737";
        assert!(!is_addr_in_use_error(stderr));
    }

    #[test]
    fn fallback_policy_only_allows_first_attempt_addr_in_use() {
        assert!(should_fallback_to_random_port(
            1,
            SidecarStartupFailureKind::AddrInUse
        ));
        assert!(!should_fallback_to_random_port(
            1,
            SidecarStartupFailureKind::Other
        ));
        assert!(!should_fallback_to_random_port(
            2,
            SidecarStartupFailureKind::AddrInUse
        ));
    }

    #[test]
    fn health_payload_must_match_service_and_startup_token() {
        let payload = serde_json::json!({
            "status": "ok",
            "service": SIDECAR_SERVICE_NAME,
            "startupToken": "token-1"
        });

        assert!(is_expected_health_payload(&payload, "token-1"));
        assert!(!is_expected_health_payload(&payload, "token-2"));
    }

    #[test]
    fn health_payload_with_wrong_service_is_rejected() {
        let payload = serde_json::json!({
            "status": "ok",
            "service": "other-service",
            "startupToken": "token-1"
        });

        assert!(!is_expected_health_payload(&payload, "token-1"));
    }
}
