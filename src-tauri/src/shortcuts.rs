use log::{error, info};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Register global shortcuts for the application
pub fn register_global_shortcuts(app: &AppHandle) -> Result<(), String> {
    info!("Registering global shortcuts...");

    // Register toggle main window shortcut (Shift+Alt+W)
    register_toggle_window_shortcut(app)?;

    info!("Global shortcuts registered successfully");
    Ok(())
}

/// Register shortcut to toggle main window visibility
fn register_toggle_window_shortcut(app: &AppHandle) -> Result<(), String> {
    let shortcut = "Shift+Alt+W";
    let app_handle = app.clone();

    // Parse the shortcut string
    let shortcut_obj: Shortcut = shortcut
        .parse()
        .map_err(|e| format!("Failed to parse shortcut '{}': {}", shortcut, e))?;

    // Register the shortcut
    app.global_shortcut()
        .on_shortcut(shortcut_obj, move |_app, _shortcut, event| {
            // Only respond to Pressed events to avoid double-triggering
            if event.state == ShortcutState::Pressed {
                if let Err(e) = toggle_main_window(&app_handle) {
                    error!("Failed to toggle main window: {}", e);
                }
            }
        })
        .map_err(|e| format!("Failed to register shortcut '{}': {}", shortcut, e))?;

    info!("Registered global shortcut: {}", shortcut);
    Ok(())
}

/// Toggle main window visibility (show/hide/focus)
fn toggle_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let is_visible = window
        .is_visible()
        .map_err(|e| format!("Failed to check window visibility: {}", e))?;

    if is_visible {
        // Window is visible - check if it's focused
        let is_focused = window
            .is_focused()
            .map_err(|e| format!("Failed to check window focus: {}", e))?;

        if is_focused {
            // Window is focused - hide it
            window
                .hide()
                .map_err(|e| format!("Failed to hide window: {}", e))?;
            info!("Main window hidden");
        } else {
            // Window is visible but not focused - bring to front
            window
                .set_focus()
                .map_err(|e| format!("Failed to focus window: {}", e))?;
            info!("Main window focused");
        }
    } else {
        // Window is hidden - show and focus it
        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
        info!("Main window shown and focused");
    }

    Ok(())
}
