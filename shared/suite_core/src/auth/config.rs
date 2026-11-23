use serde::{Deserialize, Serialize};

/// Pluggable configuration for Nexus Auth Engine per application/platform.
/// Allows apps to opt-in or opt-out of biometric features, passkeys, device flows,
/// and offline caches without altering core authentication verification logic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub app_slug: String,
    pub hub_url: String,
    pub enable_touch_id: bool,
    pub enable_passkey: bool,
    pub enable_security_questions: bool,
    pub enable_device_flow: bool,
    pub offline_token_cache: bool,
    pub session_duration_secs: u64,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            app_slug: "nexus_core_app".into(),
            hub_url: "https://hub.faizal.cloud".into(),
            enable_touch_id: true,
            enable_passkey: true,
            enable_security_questions: true,
            enable_device_flow: false,
            offline_token_cache: true,
            session_duration_secs: 86400 * 7, // 7 days default
        }
    }
}

impl AuthConfig {
    pub fn for_app(app_slug: &str) -> Self {
        let mut cfg = Self::default();
        cfg.app_slug = app_slug.to_string();
        let slug_lower = app_slug.to_lowercase();
        if slug_lower.contains("cli") || slug_lower.contains("tv") || slug_lower.contains("terminal") {
            cfg.enable_device_flow = true;
            cfg.enable_touch_id = false;
        }
        cfg
    }
}
