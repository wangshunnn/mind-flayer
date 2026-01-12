use keyring::Entry;
use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const SERVICE_NAME: &str = "mind-flayer";
const PROVIDER_LIST_KEY: &str = "__provider_list__";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

/// Save provider configuration to system keychain
pub fn save_config(provider: &str, config: &ProviderConfig) -> Result<(), String> {
    info!("[Keychain] Saving config for provider: {}", provider);

    let entry = Entry::new(SERVICE_NAME, provider).map_err(|e| {
        error!(
            "[Keychain] Failed to create keychain entry for {}: {}",
            provider, e
        );
        e.to_string()
    })?;

    let config_json = serde_json::to_string(config).map_err(|e| {
        error!(
            "[Keychain] Failed to serialize config for {}: {}",
            provider, e
        );
        e.to_string()
    })?;

    debug!("[Keychain] Config JSON for {}: {}", provider, config_json);

    entry.set_password(&config_json).map_err(|e| {
        error!("[Keychain] Failed to save password for {}: {}", provider, e);
        e.to_string()
    })?;

    info!("[Keychain] Successfully saved config for {}", provider);

    // Add provider to the list of configured providers
    add_provider_to_list(provider)?;

    Ok(())
}

/// Get provider configuration from system keychain
pub fn get_config(provider: &str) -> Result<ProviderConfig, String> {
    let entry = Entry::new(SERVICE_NAME, provider).map_err(|e| e.to_string())?;
    let config_json = entry.get_password().map_err(|e| e.to_string())?;
    let config: ProviderConfig = serde_json::from_str(&config_json).map_err(|e| e.to_string())?;
    Ok(config)
}

/// Delete provider configuration from system keychain
pub fn delete_config(provider: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, provider).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())?;

    // Remove provider from the list of configured providers
    remove_provider_from_list(provider)?;

    Ok(())
}

/// Get all provider configurations from system keychain
pub fn get_all_configs() -> HashMap<String, ProviderConfig> {
    debug!("[Keychain] Getting all configs...");
    let mut configs = HashMap::new();

    // Get the list of configured providers
    let providers = get_provider_list();
    info!(
        "[Keychain] Found {} providers in list: {:?}",
        providers.len(),
        providers
    );

    for provider in providers {
        debug!("[Keychain] Attempting to load config for: {}", provider);
        match get_config(&provider) {
            Ok(config) => {
                debug!("[Keychain] Successfully loaded config for {}", provider);
                configs.insert(provider, config);
            }
            Err(e) => {
                error!("[Keychain] Failed to load config for {}: {}", provider, e);
            }
        }
    }

    info!("[Keychain] Returning {} configs", configs.len());
    configs
}

/// List all configured providers
pub fn list_all_providers() -> Vec<String> {
    get_provider_list()
}

/// Get the list of configured provider names from keychain
fn get_provider_list() -> Vec<String> {
    let entry = match Entry::new(SERVICE_NAME, PROVIDER_LIST_KEY) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    match entry.get_password() {
        Ok(json) => serde_json::from_str(&json).unwrap_or_else(|_| Vec::new()),
        Err(_) => Vec::new(),
    }
}

/// Add a provider to the list of configured providers
fn add_provider_to_list(provider: &str) -> Result<(), String> {
    debug!("[Keychain] Adding provider to list: {}", provider);
    let mut providers = get_provider_list();
    debug!("[Keychain] Current provider list: {:?}", providers);

    if !providers.contains(&provider.to_string()) {
        providers.push(provider.to_string());
        info!(
            "[Keychain] Added {} to provider list, new list: {:?}",
            provider, providers
        );
        save_provider_list(&providers)?;
    } else {
        debug!("[Keychain] Provider {} already in list", provider);
    }

    Ok(())
}

/// Remove a provider from the list of configured providers
fn remove_provider_from_list(provider: &str) -> Result<(), String> {
    let mut providers = get_provider_list();
    providers.retain(|p| p != provider);
    save_provider_list(&providers)?;
    Ok(())
}

/// Save the list of configured providers to keychain
fn save_provider_list(providers: &[String]) -> Result<(), String> {
    debug!("[Keychain] Saving provider list: {:?}", providers);
    let entry = Entry::new(SERVICE_NAME, PROVIDER_LIST_KEY).map_err(|e| {
        error!("[Keychain] Failed to create entry for provider list: {}", e);
        e.to_string()
    })?;

    let json = serde_json::to_string(providers).map_err(|e| {
        error!("[Keychain] Failed to serialize provider list: {}", e);
        e.to_string()
    })?;

    entry.set_password(&json).map_err(|e| {
        error!("[Keychain] Failed to save provider list to keychain: {}", e);
        e.to_string()
    })?;

    info!(
        "[Keychain] Successfully saved provider list with {} entries",
        providers.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save_and_get_config() {
        let config = ProviderConfig {
            api_key: "test_key_123".to_string(),
            base_url: Some("https://api.test.com".to_string()),
        };

        let provider = "test_provider";

        // Save
        assert!(save_config(provider, &config).is_ok());

        // Get
        let retrieved = get_config(provider).unwrap();
        assert_eq!(retrieved.api_key, config.api_key);
        assert_eq!(retrieved.base_url, config.base_url);

        // Clean up
        delete_config(provider).unwrap();
    }
}
