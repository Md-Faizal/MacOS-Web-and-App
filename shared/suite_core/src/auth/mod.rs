pub mod biometric;
pub mod config;
pub mod crypto;
pub mod passkey;

use crypto::{base64_url_decode, base64_url_encode, constant_time_eq, hmac_sha256};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiedTokenClaims {
    pub sub: String,
    pub email: String,
    pub name: String,
    pub roles: Vec<String>,
    pub token_version: i64,
    pub device_id: Option<String>,
    pub exp: usize,
    pub iat: usize,
    pub is_expired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenVerifyResult {
    pub valid: bool,
    pub error: Option<String>,
    pub claims: Option<VerifiedTokenClaims>,
}

/// Evaluates whether the user's role or granted scopes satisfy the requested scope.
///
/// Hierarchy:
/// - "owner" or "*" has universal access to all domains.
/// - "admin" has access to everything except destructive fleet owner commands.
/// - Exact string match (e.g., "business:read" matches "business:read").
/// - Domain wildcard (e.g., "business:*" matches "business:read" and "business:write").
pub fn evaluate_scope(roles: &[String], scopes: &[String], requested: &str) -> bool {
    let req = requested.trim();
    if req.is_empty() {
        return true;
    }

    // Master roles bypass scope restrictions
    for r in roles {
        let role_clean = r.trim().to_lowercase();
        if role_clean == "owner" || role_clean == "*" {
            return true;
        }
        if role_clean == "admin" && !req.starts_with("fleet:master") {
            return true;
        }
    }

    // Check explicit granted scopes
    let req_parts: Vec<&str> = req.split(':').collect();
    let req_prefix = req_parts.first().copied().unwrap_or("");

    for s in scopes {
        let s_clean = s.trim();
        if s_clean == "*" || s_clean == req {
            return true;
        }
        if s_clean.ends_with(":*") {
            let prefix = s_clean.trim_end_matches(":*");
            if prefix == req_prefix {
                return true;
            }
        }
    }

    false
}

/// Lightweight, pure-Rust parser of base64url-encoded JWT payload without external crypto dependencies.
/// Allows instant claim inspection in WebAssembly & Android Kotlin environments.
pub fn inspect_jwt_payload_unverified(token: &str) -> Result<VerifiedTokenClaims, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid JWT format: expected 3 dot-separated parts".into());
    }

    let payload_b64 = parts[1];
    let decoded_bytes = base64_url_decode(payload_b64)
        .map_err(|e| format!("Base64 decoding failed: {}", e))?;

    #[derive(Deserialize)]
    struct RawClaims {
        sub: Option<String>,
        email: Option<String>,
        name: Option<String>,
        roles: Option<Vec<String>>,
        role: Option<String>,
        token_version: Option<i64>,
        tokenVersion: Option<i64>,
        device_id: Option<String>,
        deviceId: Option<String>,
        exp: Option<usize>,
        iat: Option<usize>,
    }

    let raw: RawClaims = serde_json::from_slice(&decoded_bytes)
        .map_err(|e| format!("Claims JSON parse error: {}", e))?;

    let sub = raw.sub.unwrap_or_else(|| "anonymous".into());
    let email = raw.email.unwrap_or_default();
    let name = raw.name.unwrap_or_default();

    let mut roles = raw.roles.unwrap_or_default();
    if roles.is_empty() {
        if let Some(r) = raw.role {
            roles.push(r);
        }
    }

    let token_version = raw.token_version.or(raw.tokenVersion).unwrap_or(1);
    let device_id = raw.device_id.or(raw.deviceId);
    let exp = raw.exp.unwrap_or(0);
    let iat = raw.iat.unwrap_or(0);

    Ok(VerifiedTokenClaims {
        sub,
        email,
        name,
        roles,
        token_version,
        device_id,
        exp,
        iat,
        is_expired: false,
    })
}

/// Creates a signed HS256 JWT in pure Rust.
/// Zero external C or OS dependencies — compiles directly into WebAssembly.
pub fn create_jwt_token(claims: &VerifiedTokenClaims, secret: &[u8]) -> Result<String, String> {
    let header_json = r#"{"alg":"HS256","typ":"JWT"}"#;
    let header_b64 = base64_url_encode(header_json.as_bytes());

    let payload_json = serde_json::to_string(claims)
        .map_err(|e| format!("Failed to serialize claims: {}", e))?;
    let payload_b64 = base64_url_encode(payload_json.as_bytes());

    let signing_input = format!("{}.{}", header_b64, payload_b64);
    let signature = hmac_sha256(secret, signing_input.as_bytes());
    let sig_b64 = base64_url_encode(&signature);

    Ok(format!("{}.{}", signing_input, sig_b64))
}

/// Fully verifies an HS256 JWT signature and expiration in pure Rust.
pub fn verify_jwt_token(token: &str, secret: &[u8], current_epoch: usize) -> TokenVerifyResult {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return TokenVerifyResult {
            valid: false,
            error: Some("Invalid JWT format: expected 3 parts".into()),
            claims: None,
        };
    }

    let signing_input = format!("{}.{}", parts[0], parts[1]);
    let expected_sig = hmac_sha256(secret, signing_input.as_bytes());

    let actual_sig = match base64_url_decode(parts[2]) {
        Ok(s) => s,
        Err(e) => {
            return TokenVerifyResult {
                valid: false,
                error: Some(format!("Invalid signature encoding: {}", e)),
                claims: None,
            };
        }
    };

    if !constant_time_eq(&expected_sig, &actual_sig) {
        return TokenVerifyResult {
            valid: false,
            error: Some("Signature verification failed".into()),
            claims: None,
        };
    }

    let mut claims = match inspect_jwt_payload_unverified(token) {
        Ok(c) => c,
        Err(e) => {
            return TokenVerifyResult {
                valid: false,
                error: Some(e),
                claims: None,
            };
        }
    };

    if current_epoch > 0 && claims.exp > 0 && current_epoch > claims.exp {
        claims.is_expired = true;
        return TokenVerifyResult {
            valid: false,
            error: Some("Token expired".into()),
            claims: Some(claims),
        };
    }

    TokenVerifyResult {
        valid: true,
        error: None,
        claims: Some(claims),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scope_evaluation() {
        let owner_roles = vec!["owner".to_string()];
        assert!(evaluate_scope(&owner_roles, &[], "business:write"));
        assert!(evaluate_scope(&owner_roles, &[], "fleet:master:restart"));

        let worker_roles = vec!["worker".to_string()];
        let worker_scopes = vec!["business:read".to_string(), "profile:read".to_string()];
        assert!(evaluate_scope(&worker_roles, &worker_scopes, "business:read"));
        assert!(!evaluate_scope(&worker_roles, &worker_scopes, "business:write"));
    }

    #[test]
    fn test_jwt_create_and_verify() {
        let secret = b"my_super_jwt_secret_key_12345";
        let claims = VerifiedTokenClaims {
            sub: "usr_faizal".into(),
            email: "faizal@example.com".into(),
            name: "Faizal".into(),
            roles: vec!["owner".into(), "admin".into()],
            token_version: 1,
            device_id: Some("dev_macbook_pro".into()),
            exp: 1800000000,
            iat: 1700000000,
            is_expired: false,
        };

        let token = create_jwt_token(&claims, secret).expect("token creation");
        assert_eq!(token.split('.').count(), 3);

        let res = verify_jwt_token(&token, secret, 1750000000);
        assert!(res.valid);
        let verified = res.claims.unwrap();
        assert_eq!(verified.sub, "usr_faizal");
        assert_eq!(verified.roles, vec!["owner".to_string(), "admin".to_string()]);

        // Wrong secret
        let bad_res = verify_jwt_token(&token, b"wrong_secret", 1750000000);
        assert!(!bad_res.valid);

        // Expired
        let expired_res = verify_jwt_token(&token, secret, 1850000000);
        assert!(!expired_res.valid);
        assert_eq!(expired_res.error, Some("Token expired".into()));
    }
}
