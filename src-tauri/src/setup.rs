use log::{error, info};
use tauri::{App, Manager};

mod sidecar;

pub use sidecar::{cleanup_sidecar, push_config_to_sidecar, wait_for_sidecar_port};

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

    app.manage(sidecar::create_sidecar_state());

    // Register global shortcuts
    if let Err(e) = crate::shortcuts::register_global_shortcuts(&app.handle()) {
        error!("Failed to register global shortcuts: {}", e);
    }

    #[cfg(target_os = "macos")]
    let window_for_close = window.clone();
    window.on_window_event(move |event| {
        #[cfg(target_os = "macos")]
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            info!("Main window close requested, hiding window instead of closing it");
            api.prevent_close();

            if let Err(e) = window_for_close.hide() {
                error!("Failed to hide main window: {}", e);
            }
        }
    });

    // Start sidecar service
    let app_handle = app.handle().clone();
    let app_handle_for_push = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        match sidecar::start_sidecar(app_handle).await {
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

pub fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let is_visible = window
        .is_visible()
        .map_err(|e| format!("Failed to check main window visibility: {}", e))?;
    if !is_visible {
        window
            .show()
            .map_err(|e| format!("Failed to show main window: {}", e))?;
    }

    let is_minimized = window
        .is_minimized()
        .map_err(|e| format!("Failed to check main window minimized state: {}", e))?;
    if is_minimized {
        window
            .unminimize()
            .map_err(|e| format!("Failed to unminimize main window: {}", e))?;
    }

    window
        .set_focus()
        .map_err(|e| format!("Failed to focus main window: {}", e))?;

    Ok(())
}
