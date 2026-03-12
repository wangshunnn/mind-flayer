use log::error;
use std::{fs, path::PathBuf};

pub const CUSTOM_APP_SUPPORT_DIR_NAME: &str = "Mind Flayer";

pub fn resolve_custom_app_support_dir() -> Result<PathBuf, String> {
    let app_support_dir = dirs::data_local_dir()
        .ok_or_else(|| "Failed to get local app data directory".to_string())?
        .join(CUSTOM_APP_SUPPORT_DIR_NAME);

    fs::create_dir_all(&app_support_dir).map_err(|e| {
        let message = format!(
            "Failed to create app support directory '{}': {}",
            app_support_dir.display(),
            e
        );
        error!("{}", message);
        message
    })?;

    Ok(app_support_dir)
}
