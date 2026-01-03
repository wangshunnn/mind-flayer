use tauri::{App, Manager};
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "windows")]
use window_vibrancy::apply_blur;

/// setup window vibrancy effects and start sidecar
pub fn init(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window("main").unwrap();

    #[cfg(target_os = "macos")]
    apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
        .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

    #[cfg(target_os = "windows")]
    apply_blur(&window, Some((18, 18, 18, 125)))
        .expect("Unsupported platform! 'apply_blur' is only supported on Windows");

    // Start sidecar service
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        match start_sidecar_internal(app_handle).await {
            Ok(port) => println!("✅ Sidecar started successfully on port {}", port),
            Err(e) => eprintln!("❌ Failed to start sidecar: {}", e),
        }
    });

    Ok(())
}

/// Internal function: start sidecar
async fn start_sidecar_internal(app: tauri::AppHandle) -> Result<u16, String> {
    let port = 3737u16;

    println!("🔄 Starting sidecar on port {}...", port);

    // Use shell plugin to start sidecar
    let sidecar_command = app.shell().sidecar("mind-flayer-sidecar").map_err(|e| {
        let err_msg = format!("Failed to create sidecar command: {}", e);
        eprintln!("❌ {}", err_msg);
        err_msg
    })?;

    println!("✓ Sidecar command created");

    // Start process
    let (mut rx, _child) = sidecar_command.spawn().map_err(|e| {
        let err_msg = format!("Failed to spawn sidecar: {}", e);
        eprintln!("❌ {}", err_msg);
        err_msg
    })?;

    println!("✓ Sidecar process spawned");

    // Listen to output
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    println!("[Sidecar] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    eprintln!("[Sidecar Error] {}", String::from_utf8_lossy(&line));
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
            println!("✓ Sidecar health check passed");
            Ok(port)
        }
        Ok(resp) => Err(format!(
            "Sidecar health check failed with status: {}",
            resp.status()
        )),
        Err(e) => Err(format!("Failed to connect to sidecar: {}", e)),
    }
}
