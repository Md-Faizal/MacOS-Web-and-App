use serde::{Deserialize, Serialize};
use crate::auth::crypto::base64_url_decode;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientDataJSON {
    #[serde(rename = "type")]
    pub action_type: String, // "webauthn.get" or "webauthn.create"
    pub challenge: String,
    pub origin: String,
    #[serde(default)]
    pub cross_origin: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasskeyVerifyResult {
    pub valid: bool,
    pub error: Option<String>,
}

/// Verifies clientDataJSON for WebAuthn authentication/registration in pure Rust.
/// Compatible with Wasm in browsers and native apps.
pub fn verify_client_data_json(
    client_data_raw: &[u8],
    expected_challenge: &str,
    expected_origin: &str,
    is_registration: bool,
) -> PasskeyVerifyResult {
    let client_data: ClientDataJSON = match serde_json::from_slice(client_data_raw) {
        Ok(c) => c,
        Err(e) => {
            return PasskeyVerifyResult {
                valid: false,
                error: Some(format!("Invalid clientDataJSON: {}", e)),
            };
        }
    };

    let expected_type = if is_registration {
        "webauthn.create"
    } else {
        "webauthn.get"
    };

    if client_data.action_type != expected_type {
        return PasskeyVerifyResult {
            valid: false,
            error: Some(format!(
                "Invalid type '{}', expected '{}'",
                client_data.action_type, expected_type
            )),
        };
    }

    if client_data.challenge != expected_challenge {
        return PasskeyVerifyResult {
            valid: false,
            error: Some("Challenge mismatch".into()),
        };
    }

    let origin_clean = client_data.origin.trim().to_lowercase();
    let expected_clean = expected_origin.trim().to_lowercase();
    if !origin_clean.starts_with(&expected_clean) {
        return PasskeyVerifyResult {
            valid: false,
            error: Some(format!(
                "Origin '{}' does not match expected '{}'",
                client_data.origin, expected_origin
            )),
        };
    }

    PasskeyVerifyResult {
        valid: true,
        error: None,
    }
}

pub fn verify_client_data_b64(
    client_data_b64: &str,
    expected_challenge: &str,
    expected_origin: &str,
    is_registration: bool,
) -> PasskeyVerifyResult {
    match base64_url_decode(client_data_b64) {
        Ok(bytes) => verify_client_data_json(&bytes, expected_challenge, expected_origin, is_registration),
        Err(e) => PasskeyVerifyResult {
            valid: false,
            error: Some(format!("Base64 decoding of clientDataJSON failed: {}", e)),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_passkey_client_data_verification() {
        let json = r#"{"type":"webauthn.get","challenge":"chal_xyz123","origin":"https://hub.faizal.cloud"}"#;
        let res = verify_client_data_json(json.as_bytes(), "chal_xyz123", "https://hub.faizal.cloud", false);
        assert!(res.valid);

        let bad_chal = verify_client_data_json(json.as_bytes(), "wrong_chal", "https://hub.faizal.cloud", false);
        assert!(!bad_chal.valid);

        let bad_type = verify_client_data_json(json.as_bytes(), "chal_xyz123", "https://hub.faizal.cloud", true);
        assert!(!bad_type.valid);
    }
}
