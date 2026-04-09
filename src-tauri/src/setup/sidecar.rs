use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    net::TcpListener,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
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
const MINDFLAYER_APP_SUPPORT_DIR_ENV_KEY: &str = "MINDFLAYER_APP_SUPPORT_DIR";
const MINDFLAYER_PROXY_URL_ENV_KEY: &str = "MINDFLAYER_PROXY_URL";
const SETTINGS_STORE_FILE_NAME: &str = "settings.json";
const GLOBAL_SKILLS_DIR_NAME: &str = "skills";
const BUNDLED_SKILLS_DIR_NAME: &str = "builtin";
const USER_SKILLS_DIR_NAME: &str = "user";
const AGENT_WORKSPACE_DIR_NAME: &str = "workspace";
const WORKSPACE_MEMORY_DIR_NAME: &str = "memory";
const WORKSPACE_STATE_FILE_NAME: &str = "state.json";
const WORKSPACE_BOOTSTRAP_FILE_NAME: &str = "BOOTSTRAP.md";
const LOGS_DIR_NAME: &str = "logs";
const HOST_LOG_FILE_NAME: &str = "host.log";
const WORKSPACE_STATE_VERSION: u32 = 1;
const SIDECAR_SHUTDOWN_MESSAGE: &str =
    "Sidecar startup skipped because application is shutting down";

struct BundledSkillFile {
    relative_path: &'static str,
    contents: &'static [u8],
}

struct BundledSkill {
    name: &'static str,
    files: &'static [BundledSkillFile],
}

struct BundledWorkspaceFile {
    relative_path: &'static str,
    contents: &'static [u8],
}

include!(concat!(env!("OUT_DIR"), "/bundled_skills_generated.rs"));
include!(concat!(env!("OUT_DIR"), "/bundled_workspace_generated.rs"));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceState {
    version: u32,
    bootstrap_seeded_at: Option<u64>,
    setup_completed_at: Option<u64>,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self {
            version: WORKSPACE_STATE_VERSION,
            bootstrap_seeded_at: None,
            setup_completed_at: None,
        }
    }
}

/// State to hold the sidecar process handle
pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
    pub port: Arc<Mutex<Option<u16>>>,
    pub startup_lock: Arc<tauri::async_runtime::Mutex<()>>,
    pub shutting_down: Arc<AtomicBool>,
}

pub fn create_sidecar_state() -> SidecarState {
    SidecarState {
        child: Arc::new(Mutex::new(None)),
        port: Arc::new(Mutex::new(None)),
        startup_lock: Arc::new(tauri::async_runtime::Mutex::new(())),
        shutting_down: Arc::new(AtomicBool::new(false)),
    }
}

fn sidecar_shutdown_error() -> String {
    SIDECAR_SHUTDOWN_MESSAGE.to_string()
}

fn is_shutting_down(shutting_down: &AtomicBool) -> bool {
    shutting_down.load(Ordering::SeqCst)
}

pub fn is_sidecar_shutdown_error(error: &str) -> bool {
    error == SIDECAR_SHUTDOWN_MESSAGE
}

#[derive(Debug, Deserialize)]
struct PersistedSidecarSettings {
    #[serde(rename = "proxyUrl", default)]
    proxy_url: String,
}

fn resolve_settings_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(
            SETTINGS_STORE_FILE_NAME,
            tauri::path::BaseDirectory::AppData,
        )
        .map_err(|e| format!("Failed to resolve settings store path: {}", e))
}

fn parse_sidecar_proxy_url_from_settings_json(
    settings_json: &str,
) -> Result<Option<String>, String> {
    let settings: PersistedSidecarSettings = serde_json::from_str(settings_json)
        .map_err(|e| format!("Failed to parse settings store: {}", e))?;
    let trimmed_proxy_url = settings.proxy_url.trim();

    if trimmed_proxy_url.is_empty() {
        return Ok(None);
    }

    Ok(Some(trimmed_proxy_url.to_string()))
}

fn load_sidecar_proxy_url(app: &tauri::AppHandle) -> Option<String> {
    let settings_path = match resolve_settings_store_path(app) {
        Ok(path) => path,
        Err(error) => {
            warn!("{}", error);
            return None;
        }
    };

    let settings_json = match fs::read_to_string(&settings_path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            warn!(
                "Failed to read settings store '{}': {}",
                settings_path.display(),
                error
            );
            return None;
        }
    };

    match parse_sidecar_proxy_url_from_settings_json(&settings_json) {
        Ok(proxy_url) => proxy_url,
        Err(error) => {
            warn!("{} at '{}'", error, settings_path.display());
            None
        }
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
    let (child_ref, port_ref, startup_lock, shutting_down) = {
        let state = app.state::<SidecarState>();
        (
            Arc::clone(&state.child),
            Arc::clone(&state.port),
            Arc::clone(&state.startup_lock),
            Arc::clone(&state.shutting_down),
        )
    };

    if is_shutting_down(shutting_down.as_ref()) {
        return Err(sidecar_shutdown_error());
    }

    let _startup_guard = startup_lock.lock().await;

    if is_shutting_down(shutting_down.as_ref()) {
        return Err(sidecar_shutdown_error());
    }

    start_sidecar_internal(app, child_ref, port_ref, shutting_down).await
}

fn resolve_sidecar_app_support_dir() -> Result<String, String> {
    let app_support_dir = crate::app_support::resolve_custom_app_support_dir()?;
    Ok(app_support_dir.to_string_lossy().to_string())
}

fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn get_host_log_path(app_support_dir: &str) -> PathBuf {
    Path::new(app_support_dir)
        .join(LOGS_DIR_NAME)
        .join(HOST_LOG_FILE_NAME)
}

fn append_host_log_line(host_log_path: &Path, level: &str, message: &str) {
    if let Some(parent_dir) = host_log_path.parent() {
        if let Err(error) = fs::create_dir_all(parent_dir) {
            eprintln!(
                "Failed to create host log directory '{}': {}",
                parent_dir.display(),
                error
            );
            return;
        }
    }

    let timestamp = current_timestamp_millis();
    let normalized_message = message.trim_end();
    match fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(host_log_path)
    {
        Ok(mut file) => {
            if let Err(error) = writeln!(file, "[{}] [{}] {}", timestamp, level, normalized_message)
            {
                eprintln!(
                    "Failed to write host log file '{}': {}",
                    host_log_path.display(),
                    error
                );
            }
        }
        Err(error) => {
            eprintln!(
                "Failed to open host log file '{}': {}",
                host_log_path.display(),
                error
            );
        }
    }
}

fn should_persist_host_stdout(message: &str) -> bool {
    let trimmed = message.trim_start();
    trimmed.starts_with("Sidecar running on http://localhost:")
        || trimmed.starts_with("API endpoint: http://localhost:")
        || trimmed.starts_with("Shutting down gracefully...")
        || trimmed.starts_with("Server closed, port released")
        || trimmed.starts_with("Sidecar process exiting...")
}

fn load_workspace_state(state_path: &Path) -> Result<WorkspaceState, String> {
    if !state_path.exists() {
        return Ok(WorkspaceState::default());
    }

    let raw = fs::read_to_string(state_path).map_err(|e| {
        format!(
            "Failed to read workspace state '{}': {}",
            state_path.display(),
            e
        )
    })?;

    serde_json::from_str::<WorkspaceState>(&raw).map_err(|e| {
        format!(
            "Failed to parse workspace state '{}': {}",
            state_path.display(),
            e
        )
    })
}

fn write_workspace_state(state_path: &Path, state: &WorkspaceState) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize workspace state: {}", e))?;

    fs::write(state_path, serialized).map_err(|e| {
        format!(
            "Failed to write workspace state '{}': {}",
            state_path.display(),
            e
        )
    })
}

fn write_workspace_file_if_missing(destination: &Path, contents: &[u8]) -> Result<(), String> {
    if destination.exists() {
        return Ok(());
    }

    if let Some(parent_dir) = destination.parent() {
        fs::create_dir_all(parent_dir).map_err(|e| {
            format!(
                "Failed to create workspace directory '{}': {}",
                parent_dir.display(),
                e
            )
        })?;
    }

    fs::write(destination, contents).map_err(|e| {
        format!(
            "Failed to write workspace file '{}': {}",
            destination.display(),
            e
        )
    })?;

    info!("Seeded workspace file '{}'", destination.display());
    Ok(())
}

fn install_bundled_workspace(app_support_dir: &str) -> Result<(), String> {
    let workspace_root = Path::new(app_support_dir).join(AGENT_WORKSPACE_DIR_NAME);
    let memory_root = workspace_root.join(WORKSPACE_MEMORY_DIR_NAME);
    let state_path = workspace_root.join(WORKSPACE_STATE_FILE_NAME);
    let bootstrap_path = workspace_root.join(WORKSPACE_BOOTSTRAP_FILE_NAME);

    fs::create_dir_all(&workspace_root).map_err(|e| {
        format!(
            "Failed to create workspace root '{}': {}",
            workspace_root.display(),
            e
        )
    })?;
    fs::create_dir_all(&memory_root).map_err(|e| {
        format!(
            "Failed to create workspace memory root '{}': {}",
            memory_root.display(),
            e
        )
    })?;
    let mut state = load_workspace_state(&state_path)?;
    state.version = WORKSPACE_STATE_VERSION;

    for file in BUNDLED_WORKSPACE_FILES {
        if file.relative_path == WORKSPACE_BOOTSTRAP_FILE_NAME {
            continue;
        }

        let destination = workspace_root.join(file.relative_path);
        write_workspace_file_if_missing(&destination, file.contents)?;
    }

    if state.bootstrap_seeded_at.is_none() {
        let seeded_at = current_timestamp_millis();

        if bootstrap_path.exists() {
            state.bootstrap_seeded_at = Some(seeded_at);
        } else if state.setup_completed_at.is_some() {
            state.bootstrap_seeded_at = Some(seeded_at);
        } else if let Some(bootstrap_file) = BUNDLED_WORKSPACE_FILES
            .iter()
            .find(|file| file.relative_path == WORKSPACE_BOOTSTRAP_FILE_NAME)
        {
            write_workspace_file_if_missing(&bootstrap_path, bootstrap_file.contents)?;
            state.bootstrap_seeded_at = Some(seeded_at);
        }
    }

    write_workspace_state(&state_path, &state)
}

fn install_bundled_skills(app_support_dir: &str) -> Result<(), String> {
    let skills_root = Path::new(app_support_dir).join(GLOBAL_SKILLS_DIR_NAME);
    let bundled_skills_root = skills_root.join(BUNDLED_SKILLS_DIR_NAME);
    let user_skills_root = skills_root.join(USER_SKILLS_DIR_NAME);
    let bundled_skill_names: HashSet<&str> =
        BUNDLED_SKILLS.iter().map(|skill| skill.name).collect();

    fs::create_dir_all(&bundled_skills_root).map_err(|e| {
        format!(
            "Failed to create bundled skills root '{}': {}",
            bundled_skills_root.display(),
            e
        )
    })?;

    fs::create_dir_all(&user_skills_root).map_err(|e| {
        format!(
            "Failed to create user skills root '{}': {}",
            user_skills_root.display(),
            e
        )
    })?;

    for skill in BUNDLED_SKILLS {
        let legacy_skill_dir = skills_root.join(skill.name);
        let bundled_skill_dir = bundled_skills_root.join(skill.name);

        if !legacy_skill_dir.exists() || bundled_skill_dir.exists() {
            continue;
        }

        fs::rename(&legacy_skill_dir, &bundled_skill_dir).map_err(|e| {
            format!(
                "Failed to migrate legacy bundled skill '{}' to '{}': {}",
                legacy_skill_dir.display(),
                bundled_skill_dir.display(),
                e
            )
        })?;
        info!(
            "Migrated legacy bundled skill '{}' to '{}'",
            legacy_skill_dir.display(),
            bundled_skill_dir.display()
        );
    }

    let bundled_root_entries = fs::read_dir(&bundled_skills_root).map_err(|e| {
        format!(
            "Failed to read bundled skills root '{}': {}",
            bundled_skills_root.display(),
            e
        )
    })?;

    for entry_result in bundled_root_entries {
        let entry = entry_result.map_err(|e| {
            format!(
                "Failed to read an entry in bundled skills root '{}': {}",
                bundled_skills_root.display(),
                e
            )
        })?;
        let entry_path = entry.path();
        let file_type = entry.file_type().map_err(|e| {
            format!(
                "Failed to inspect bundled skills entry '{}': {}",
                entry_path.display(),
                e
            )
        })?;

        if !file_type.is_dir() {
            continue;
        }

        let entry_name = entry.file_name();
        let entry_name = entry_name.to_string_lossy();
        if bundled_skill_names.contains(entry_name.as_ref()) {
            continue;
        }

        fs::remove_dir_all(&entry_path).map_err(|e| {
            format!(
                "Failed to remove stale bundled skill directory '{}': {}",
                entry_path.display(),
                e
            )
        })?;
        info!(
            "Removed stale bundled skill directory '{}'",
            entry_path.display()
        );
    }

    for skill in BUNDLED_SKILLS {
        let bundled_skill_dir = bundled_skills_root.join(skill.name);
        if bundled_skill_dir.exists() {
            fs::remove_dir_all(&bundled_skill_dir).map_err(|e| {
                format!(
                    "Failed to replace bundled skill directory '{}': {}",
                    bundled_skill_dir.display(),
                    e
                )
            })?;
        }

        for file in skill.files {
            let destination = bundled_skill_dir.join(file.relative_path);

            if let Some(parent_dir) = destination.parent() {
                fs::create_dir_all(parent_dir).map_err(|e| {
                    format!(
                        "Failed to create bundled skill directory '{}': {}",
                        parent_dir.display(),
                        e
                    )
                })?;
            }

            fs::write(&destination, file.contents).map_err(|e| {
                format!(
                    "Failed to write bundled skill file '{}': {}",
                    destination.display(),
                    e
                )
            })?;
            info!("Synced bundled skill file '{}'", destination.display());
        }
    }

    Ok(())
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
    host_log_path: PathBuf,
) -> SidecarAttemptMonitor {
    let stderr_output = Arc::new(Mutex::new(String::new()));
    let stderr_output_for_task = Arc::clone(&stderr_output);
    let (terminated_tx, terminated_rx) = tokio::sync::oneshot::channel::<SidecarTermination>();

    tauri::async_runtime::spawn(async move {
        let mut terminated_tx = Some(terminated_tx);

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line).into_owned();
                    debug!("[Sidecar] {}", text);
                    if should_persist_host_stdout(&text) {
                        append_host_log_line(&host_log_path, "STDOUT", &text);
                    }
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line).into_owned();
                    error!("[Sidecar Error] {}", text);
                    append_stderr_output(&stderr_output_for_task, &text);
                    append_host_log_line(&host_log_path, "STDERR", &text);
                }
                CommandEvent::Error(text) => {
                    error!("[Sidecar Process Error] {}", text);
                    append_stderr_output(&stderr_output_for_task, &text);
                    append_host_log_line(&host_log_path, "PROCESS_ERROR", &text);
                }
                CommandEvent::Terminated(payload) => {
                    let termination = SidecarTermination::from_payload(payload);
                    warn!(
                        "Sidecar process terminated (code: {:?}, signal: {:?})",
                        termination.code, termination.signal
                    );
                    append_host_log_line(
                        &host_log_path,
                        "TERMINATED",
                        &format!(
                            "Sidecar process terminated (code: {:?}, signal: {:?}, reason: {})",
                            termination.code, termination.signal, termination.reason
                        ),
                    );
                    if let Some(tx) = terminated_tx.take() {
                        let _ = tx.send(termination);
                    }
                }
                _ => {}
            }
        }

        if let Some(tx) = terminated_tx.take() {
            append_host_log_line(
                &host_log_path,
                "TERMINATED",
                "Sidecar process event stream closed",
            );
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
    shutting_down: Arc<AtomicBool>,
) -> Result<(), SidecarAttemptError> {
    let health_check = wait_for_sidecar_health(
        port,
        timeout,
        interval,
        &expected_startup_token,
        shutting_down,
    );
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
    shutting_down: Arc<AtomicBool>,
) -> Result<(), String> {
    let started_at = tokio::time::Instant::now();
    let health_url = sidecar_health_url(port);
    let health_client = build_sidecar_health_client()?;
    let mut last_error = String::from("Sidecar did not respond yet");

    loop {
        if is_shutting_down(shutting_down.as_ref()) {
            return Err(sidecar_shutdown_error());
        }

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
    shutting_down: Arc<AtomicBool>,
) -> Result<u16, String> {
    clear_sidecar_port(&port_ref);
    let configured_proxy_url = load_sidecar_proxy_url(&app);

    if is_shutting_down(shutting_down.as_ref()) {
        return Err(sidecar_shutdown_error());
    }

    let mut last_error = String::from("Unknown sidecar startup failure");
    let app_support_dir = resolve_sidecar_app_support_dir()?;
    match tokio::task::spawn_blocking({
        let app_support_dir = app_support_dir.clone();
        move || -> Result<(), String> {
            install_bundled_skills(&app_support_dir)?;
            install_bundled_workspace(&app_support_dir)?;
            Ok(())
        }
    })
    .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            warn!(
                "Failed to install bundled workspace assets into '{}': {}. Continuing sidecar startup without bundled workspace assets.",
                app_support_dir, error
            );
        }
        Err(error) => {
            warn!(
                "Bundled workspace asset installation task failed for '{}': {}. Continuing sidecar startup without bundled workspace assets.",
                app_support_dir, error
            );
        }
    }

    if is_shutting_down(shutting_down.as_ref()) {
        clear_sidecar_port(&port_ref);
        return Err(sidecar_shutdown_error());
    }

    for attempt in 1..=SIDECAR_START_MAX_ATTEMPTS {
        if is_shutting_down(shutting_down.as_ref()) {
            clear_sidecar_port(&port_ref);
            return Err(sidecar_shutdown_error());
        }

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
            .env(SIDECAR_STARTUP_TOKEN_ENV_KEY, startup_token.clone())
            .env(MINDFLAYER_APP_SUPPORT_DIR_ENV_KEY, app_support_dir.clone());
        let sidecar_command = if let Some(proxy_url) = configured_proxy_url.as_deref() {
            info!("Using proxy from app settings for sidecar startup");
            sidecar_command.env(MINDFLAYER_PROXY_URL_ENV_KEY, proxy_url)
        } else {
            sidecar_command
        };

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

        if is_shutting_down(shutting_down.as_ref()) {
            if let Err(e) = child.kill() {
                error!("Failed to kill sidecar during shutdown: {}", e);
            }
            clear_sidecar_port(&port_ref);
            return Err(sidecar_shutdown_error());
        }

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

        let monitor = spawn_sidecar_event_monitor(rx, get_host_log_path(&app_support_dir));

        match wait_for_sidecar_ready(
            port,
            tokio::time::Duration::from_millis(SIDECAR_HEALTH_CHECK_TIMEOUT_MS),
            tokio::time::Duration::from_millis(SIDECAR_HEALTH_CHECK_INTERVAL_MS),
            monitor.terminated_rx,
            startup_token,
            Arc::clone(&shutting_down),
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

                if is_shutting_down(shutting_down.as_ref()) {
                    clear_sidecar_port(&port_ref);
                    return Err(sidecar_shutdown_error());
                }

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
    let state = app.state::<SidecarState>();
    state.shutting_down.store(true, Ordering::SeqCst);

    let _startup_guard = state.startup_lock.lock().await;

    info!("Cleaning up sidecar...");

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
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    fn create_temp_dir(prefix: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_else(|_| Duration::from_secs(0))
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{}-{}", prefix, nanos));
        fs::create_dir_all(&path).expect("failed to create temp test directory");
        path
    }

    fn collect_relative_file_paths(root: &Path) -> Vec<PathBuf> {
        let mut files = Vec::new();
        let mut pending_directories = vec![root.to_path_buf()];

        while let Some(current_directory) = pending_directories.pop() {
            let mut entries = fs::read_dir(&current_directory)
                .expect("failed to read test directory")
                .collect::<Result<Vec<_>, _>>()
                .expect("failed to collect directory entries");
            entries.sort_by(|left, right| left.path().cmp(&right.path()));

            for entry in entries {
                let entry_path = entry.path();
                let file_type = entry.file_type().expect("failed to inspect test file type");

                if file_type.is_dir() {
                    pending_directories.push(entry_path);
                    continue;
                }

                if file_type.is_file() {
                    files.push(
                        entry_path
                            .strip_prefix(root)
                            .expect("test file should be inside root")
                            .to_path_buf(),
                    );
                }
            }
        }

        files.sort();
        files
    }

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

    #[test]
    fn parses_proxy_url_from_settings_store() {
        let settings_json = r#"{"theme":"system","proxyUrl":"localhost:7897"}"#;

        assert_eq!(
            parse_sidecar_proxy_url_from_settings_json(settings_json)
                .expect("settings should parse"),
            Some("localhost:7897".to_string())
        );
    }

    #[test]
    fn treats_blank_proxy_url_as_disabled() {
        let settings_json = r#"{"proxyUrl":"   "}"#;

        assert_eq!(
            parse_sidecar_proxy_url_from_settings_json(settings_json)
                .expect("settings should parse"),
            None
        );
    }

    #[test]
    fn treats_missing_proxy_url_as_disabled() {
        let settings_json = r#"{"theme":"system"}"#;

        assert_eq!(
            parse_sidecar_proxy_url_from_settings_json(settings_json)
                .expect("settings should parse"),
            None
        );
    }

    #[test]
    fn installs_bundled_smoke_test_skill_when_missing() {
        let app_support_dir = create_temp_dir("mind-flayer-bundled-skill-install");

        install_bundled_skills(
            app_support_dir
                .to_str()
                .expect("temp dir should be valid utf-8"),
        )
        .expect("bundled skill installation should succeed");

        let source_skill_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("bundled-skills")
            .join("skill-smoke-test");
        let installed_skill_dir = app_support_dir
            .join(GLOBAL_SKILLS_DIR_NAME)
            .join(BUNDLED_SKILLS_DIR_NAME)
            .join("skill-smoke-test");
        let bundled_files = collect_relative_file_paths(&source_skill_dir);

        assert!(!bundled_files.is_empty());

        for relative_file_path in bundled_files {
            let source_path = source_skill_dir.join(&relative_file_path);
            let installed_path = installed_skill_dir.join(&relative_file_path);

            assert!(installed_path.exists());
            assert_eq!(
                fs::read(&installed_path).expect("installed bundled file should be readable"),
                fs::read(&source_path).expect("source bundled file should be readable"),
            );
        }

        let _ = fs::remove_dir_all(app_support_dir);
    }

    #[test]
    fn overwrites_existing_bundled_skill_file() {
        let app_support_dir = create_temp_dir("mind-flayer-bundled-skill-existing");
        let existing_skill = app_support_dir
            .join(GLOBAL_SKILLS_DIR_NAME)
            .join(BUNDLED_SKILLS_DIR_NAME)
            .join("skill-smoke-test")
            .join("SKILL.md");
        let stale_file = app_support_dir
            .join(GLOBAL_SKILLS_DIR_NAME)
            .join(BUNDLED_SKILLS_DIR_NAME)
            .join("skill-smoke-test")
            .join("stale.txt");

        fs::create_dir_all(
            existing_skill
                .parent()
                .expect("skill file should have a parent"),
        )
        .expect("failed to create existing skill directory");
        fs::write(&existing_skill, "custom skill content")
            .expect("failed to seed existing skill file");
        fs::write(&stale_file, "stale skill content").expect("failed to seed stale skill file");

        install_bundled_skills(
            app_support_dir
                .to_str()
                .expect("temp dir should be valid utf-8"),
        )
        .expect("bundled skill installation should succeed");

        let contents = fs::read_to_string(&existing_skill)
            .expect("existing skill file should still be readable");
        assert!(contents.contains("name: skill-smoke-test"));
        assert!(contents.contains("skill smoke test ok"));
        assert!(!stale_file.exists());

        let installed_icon = app_support_dir
            .join(GLOBAL_SKILLS_DIR_NAME)
            .join(BUNDLED_SKILLS_DIR_NAME)
            .join("skill-smoke-test")
            .join("assets")
            .join("icon.svg");
        assert!(installed_icon.exists());

        let _ = fs::remove_dir_all(app_support_dir);
    }

    #[test]
    fn migrates_legacy_bundled_skill_directory() {
        let app_support_dir = create_temp_dir("mind-flayer-bundled-skill-migration");
        let legacy_skill = app_support_dir
            .join(GLOBAL_SKILLS_DIR_NAME)
            .join("skill-smoke-test")
            .join("SKILL.md");

        fs::create_dir_all(
            legacy_skill
                .parent()
                .expect("legacy skill file should have a parent"),
        )
        .expect("failed to create legacy skill directory");
        fs::write(&legacy_skill, "legacy bundled skill").expect("failed to seed legacy skill file");

        install_bundled_skills(
            app_support_dir
                .to_str()
                .expect("temp dir should be valid utf-8"),
        )
        .expect("bundled skill installation should succeed");

        let migrated_skill = app_support_dir
            .join(GLOBAL_SKILLS_DIR_NAME)
            .join(BUNDLED_SKILLS_DIR_NAME)
            .join("skill-smoke-test")
            .join("SKILL.md");

        let contents =
            fs::read_to_string(&migrated_skill).expect("migrated skill should still be readable");
        assert!(contents.contains("name: skill-smoke-test"));
        assert!(contents.contains("skill smoke test ok"));
        assert!(!legacy_skill.exists());

        let migrated_icon = app_support_dir
            .join(GLOBAL_SKILLS_DIR_NAME)
            .join(BUNDLED_SKILLS_DIR_NAME)
            .join("skill-smoke-test")
            .join("assets")
            .join("icon.svg");
        assert!(migrated_icon.exists());

        let _ = fs::remove_dir_all(app_support_dir);
    }

    #[test]
    fn removes_stale_bundled_skill_directories() {
        let app_support_dir = create_temp_dir("mind-flayer-bundled-skill-cleanup");
        let stale_skill_dir = app_support_dir
            .join(GLOBAL_SKILLS_DIR_NAME)
            .join(BUNDLED_SKILLS_DIR_NAME)
            .join("obsolete-skill");
        let stale_skill_file = stale_skill_dir.join("SKILL.md");

        fs::create_dir_all(&stale_skill_dir).expect("failed to create stale skill directory");
        fs::write(&stale_skill_file, "obsolete bundled skill")
            .expect("failed to seed stale bundled skill");

        install_bundled_skills(
            app_support_dir
                .to_str()
                .expect("temp dir should be valid utf-8"),
        )
        .expect("bundled skill installation should succeed");

        assert!(!stale_skill_dir.exists());

        let _ = fs::remove_dir_all(app_support_dir);
    }

    #[test]
    fn installs_bundled_workspace_files_when_missing() {
        let app_support_dir = create_temp_dir("mind-flayer-workspace-install");

        install_bundled_workspace(
            app_support_dir
                .to_str()
                .expect("temp dir should be valid utf-8"),
        )
        .expect("bundled workspace installation should succeed");

        let workspace_root = app_support_dir.join(AGENT_WORKSPACE_DIR_NAME);
        assert!(workspace_root.join("AGENTS.md").exists());
        assert!(workspace_root.join("SOUL.md").exists());
        assert!(workspace_root.join("IDENTITY.md").exists());
        assert!(workspace_root.join("USER.md").exists());
        assert!(workspace_root.join("BOOTSTRAP.md").exists());
        assert!(workspace_root.join("MEMORY.md").exists());
        assert!(workspace_root.join(WORKSPACE_MEMORY_DIR_NAME).exists());

        let state: WorkspaceState = serde_json::from_slice(
            &fs::read(workspace_root.join(WORKSPACE_STATE_FILE_NAME))
                .expect("workspace state should be readable"),
        )
        .expect("workspace state should be valid JSON");

        assert_eq!(state.version, WORKSPACE_STATE_VERSION);
        assert!(state.bootstrap_seeded_at.is_some());
        assert!(state.setup_completed_at.is_none());

        let _ = fs::remove_dir_all(app_support_dir);
    }

    #[test]
    fn preserves_existing_workspace_file_contents() {
        let app_support_dir = create_temp_dir("mind-flayer-workspace-preserve");
        let workspace_root = app_support_dir.join(AGENT_WORKSPACE_DIR_NAME);
        let user_file = workspace_root.join("USER.md");

        fs::create_dir_all(&workspace_root).expect("failed to create workspace root");
        fs::write(&user_file, "custom user content").expect("failed to seed USER.md");

        install_bundled_workspace(
            app_support_dir
                .to_str()
                .expect("temp dir should be valid utf-8"),
        )
        .expect("bundled workspace installation should succeed");

        let contents = fs::read_to_string(&user_file).expect("USER.md should still be readable");
        assert_eq!(contents, "custom user content");

        let _ = fs::remove_dir_all(app_support_dir);
    }

    #[test]
    fn does_not_recreate_bootstrap_after_setup_completed() {
        let app_support_dir = create_temp_dir("mind-flayer-workspace-complete");
        let workspace_root = app_support_dir.join(AGENT_WORKSPACE_DIR_NAME);
        let state_path = workspace_root.join(WORKSPACE_STATE_FILE_NAME);

        fs::create_dir_all(&workspace_root).expect("failed to create workspace root");
        fs::write(
            &state_path,
            serde_json::to_string_pretty(&WorkspaceState {
                version: WORKSPACE_STATE_VERSION,
                bootstrap_seeded_at: Some(100),
                setup_completed_at: Some(200),
            })
            .expect("workspace state should serialize"),
        )
        .expect("failed to seed workspace state");

        install_bundled_workspace(
            app_support_dir
                .to_str()
                .expect("temp dir should be valid utf-8"),
        )
        .expect("bundled workspace installation should succeed");

        assert!(!workspace_root.join("BOOTSTRAP.md").exists());
        assert!(workspace_root.join("AGENTS.md").exists());

        let _ = fs::remove_dir_all(app_support_dir);
    }

    #[test]
    fn does_not_mark_partial_workspace_install_as_completed() {
        let app_support_dir = create_temp_dir("mind-flayer-workspace-partial");
        let workspace_root = app_support_dir.join(AGENT_WORKSPACE_DIR_NAME);

        fs::create_dir_all(&workspace_root).expect("failed to create workspace root");
        fs::write(workspace_root.join("USER.md"), "custom user content")
            .expect("failed to seed USER.md");

        install_bundled_workspace(
            app_support_dir
                .to_str()
                .expect("temp dir should be valid utf-8"),
        )
        .expect("bundled workspace installation should succeed");

        let state: WorkspaceState = serde_json::from_slice(
            &fs::read(workspace_root.join(WORKSPACE_STATE_FILE_NAME))
                .expect("workspace state should be readable"),
        )
        .expect("workspace state should be valid JSON");

        assert!(workspace_root.join("BOOTSTRAP.md").exists());
        assert!(state.bootstrap_seeded_at.is_some());
        assert!(state.setup_completed_at.is_none());

        let _ = fs::remove_dir_all(app_support_dir);
    }
}
