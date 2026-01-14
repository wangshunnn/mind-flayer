use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const CONFIG_FILE_NAME: &str = "provider_configs.dat";
const NONCE: &[u8; 12] = b"mind-flayer!"; // Fixed nonce for simplicity

#[cfg(test)]
use std::sync::Mutex;

#[cfg(test)]
static TEST_FILE_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

/// Get the config file path
fn get_config_file_path() -> Result<PathBuf, String> {
    #[cfg(test)]
    {
        let guard = TEST_FILE_PATH.lock().unwrap();
        if let Some(path) = guard.as_ref() {
            return Ok(path.clone());
        }
    }

    let app_dir = dirs::data_local_dir()
        .ok_or_else(|| "Failed to get app data directory".to_string())?
        .join("mind-flayer");

    fs::create_dir_all(&app_dir).map_err(|e| {
        error!("[Storage] Failed to create app directory: {}", e);
        e.to_string()
    })?;

    Ok(app_dir.join(CONFIG_FILE_NAME))
}

/// Get encryption key derived from machine-specific data
fn get_encryption_key() -> [u8; 32] {
    // Derive a machine-specific key
    let machine_id = whoami::devicename();
    let mut hasher = Sha256::new();
    hasher.update(b"mind-flayer-v1");
    hasher.update(machine_id.as_bytes());
    let result = hasher.finalize();
    result.into()
}

/// Save provider configuration to encrypted local storage
pub fn save_config(provider: &str, config: &ProviderConfig) -> Result<(), String> {
    info!("[Storage] Saving config for provider: {}", provider);

    let mut all_configs = get_all_configs_internal()?;
    all_configs.insert(provider.to_string(), config.clone());
    save_all_configs_internal(&all_configs)?;

    info!("[Storage] Successfully saved config for {}", provider);
    Ok(())
}

/// Get provider configuration from encrypted local storage
pub fn get_config(provider: &str) -> Result<ProviderConfig, String> {
    let all_configs = get_all_configs_internal()?;
    all_configs
        .get(provider)
        .cloned()
        .ok_or_else(|| format!("Provider '{}' not found", provider))
}

/// Delete provider configuration from encrypted local storage
pub fn delete_config(provider: &str) -> Result<(), String> {
    info!("[Storage] Deleting config for provider: {}", provider);

    let mut all_configs = get_all_configs_internal()?;
    all_configs.remove(provider);
    save_all_configs_internal(&all_configs)?;

    info!("[Storage] Successfully deleted config for {}", provider);
    Ok(())
}

/// Get all provider configurations from encrypted local storage
pub fn get_all_configs() -> HashMap<String, ProviderConfig> {
    debug!("[Storage] Getting all configs...");
    match get_all_configs_internal() {
        Ok(configs) => {
            info!(
                "[Storage] Retrieved configs from {} providers",
                configs.len()
            );
            configs
        }
        Err(e) => {
            error!("[Storage] Failed to get configs: {}", e);
            HashMap::new()
        }
    }
}

/// List all configured providers
pub fn list_all_providers() -> Vec<String> {
    get_all_configs().keys().cloned().collect()
}

/// Internal: Get all configs from encrypted file
fn get_all_configs_internal() -> Result<HashMap<String, ProviderConfig>, String> {
    let config_path = get_config_file_path()?;

    if !config_path.exists() {
        debug!("[Storage] Config file does not exist, returning empty map");
        return Ok(HashMap::new());
    }

    let encrypted_data = fs::read(&config_path).map_err(|e| {
        error!("[Storage] Failed to read config file: {}", e);
        e.to_string()
    })?;

    if encrypted_data.is_empty() {
        debug!("[Storage] Config file is empty, returning empty map");
        return Ok(HashMap::new());
    }

    // Decode from base64
    let encrypted_bytes = general_purpose::STANDARD
        .decode(&encrypted_data)
        .map_err(|e| {
            error!("[Storage] Failed to decode base64: {}", e);
            e.to_string()
        })?;

    // Decrypt
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new(&key.into());
    let nonce = Nonce::from_slice(NONCE);

    let decrypted_data = cipher
        .decrypt(nonce, encrypted_bytes.as_ref())
        .map_err(|e| {
            error!("[Storage] Failed to decrypt config: {}", e);
            "Failed to decrypt config, data may be corrupted".to_string()
        })?;

    // Parse JSON
    let json_str = String::from_utf8(decrypted_data).map_err(|e| {
        error!("[Storage] Failed to parse decrypted data as UTF-8: {}", e);
        e.to_string()
    })?;

    let configs: HashMap<String, ProviderConfig> =
        serde_json::from_str(&json_str).map_err(|e| {
            error!("[Storage] Failed to deserialize configs: {}", e);
            e.to_string()
        })?;

    Ok(configs)
}

/// Internal: Save all configs to encrypted file
fn save_all_configs_internal(configs: &HashMap<String, ProviderConfig>) -> Result<(), String> {
    debug!("[Storage] Saving configs for {} providers", configs.len());

    let config_path = get_config_file_path()?;

    // Serialize to JSON
    let json_str = serde_json::to_string(configs).map_err(|e| {
        error!("[Storage] Failed to serialize configs: {}", e);
        e.to_string()
    })?;

    // Encrypt
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new(&key.into());
    let nonce = Nonce::from_slice(NONCE);

    let encrypted_data = cipher.encrypt(nonce, json_str.as_bytes()).map_err(|e| {
        error!("[Storage] Failed to encrypt config: {}", e);
        e.to_string()
    })?;

    // Encode to base64
    let encoded_data = general_purpose::STANDARD.encode(&encrypted_data);

    // Write to file
    fs::write(&config_path, encoded_data).map_err(|e| {
        error!("[Storage] Failed to write config file: {}", e);
        e.to_string()
    })?;

    info!(
        "[Storage] Successfully saved configs for {} providers to file",
        configs.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn setup_test() -> std::sync::MutexGuard<'static, ()> {
        let guard = TEST_LOCK.lock().unwrap();

        // Create a temporary test file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join(format!("mind_flayer_test_{}.dat", std::process::id()));

        {
            let mut path_guard = TEST_FILE_PATH.lock().unwrap();
            *path_guard = Some(test_file.clone());
        }

        // Clean up existing test file if it exists
        let _ = fs::remove_file(&test_file);

        guard
    }

    fn cleanup_test() {
        let guard = TEST_FILE_PATH.lock().unwrap();
        if let Some(path) = guard.as_ref() {
            let _ = fs::remove_file(path);
        }
    }

    #[test]
    fn test_save_and_get_config() {
        let _guard = setup_test();

        let provider = "test_provider";
        let config = ProviderConfig {
            api_key: "test_key_123".to_string(),
            base_url: Some("https://api.test.com".to_string()),
        };

        // Save
        assert!(save_config(provider, &config).is_ok());

        // Get
        let retrieved = get_config(provider).unwrap();
        assert_eq!(retrieved.api_key, config.api_key);
        assert_eq!(retrieved.base_url, config.base_url);

        cleanup_test();
    }

    #[test]
    fn test_multiple_providers() {
        let _guard = setup_test();

        let config1 = ProviderConfig {
            api_key: "key1".to_string(),
            base_url: None,
        };
        let config2 = ProviderConfig {
            api_key: "key2".to_string(),
            base_url: Some("https://api.example.com".to_string()),
        };

        // Save two providers
        save_config("provider1", &config1).unwrap();
        save_config("provider2", &config2).unwrap();

        // Get all
        let all_configs = get_all_configs();
        assert_eq!(all_configs.len(), 2);

        // Delete one
        delete_config("provider1").unwrap();
        let all_configs = get_all_configs();
        assert_eq!(all_configs.len(), 1);

        cleanup_test();
    }
}
