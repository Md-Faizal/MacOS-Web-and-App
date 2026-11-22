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

    // Timestamp check requires current epoch passed from host runtime, or defaults
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

fn base64_url_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut s = input.replace('-', "+").replace('_', "/");
    while s.len() % 4 != 0 {
        s.push('=');
    }

    const DECODE_TABLE: [i8; 256] = {
        let mut t = [-1i8; 256];
        let mut i = 0u8;
        while i < 26 {
            t[(b'A' + i) as usize] = i as i8;
            t[(b'a' + i) as usize] = (i + 26) as i8;
            i += 1;
        }
        let mut d = 0u8;
        while d < 10 {
            t[(b'0' + d) as usize] = (d + 52) as i8;
            d += 1;
        }
        t[b'+' as usize] = 62;
        t[b'/' as usize] = 63;
        t
    };

    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);

    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'=' {
            break;
        }

        let b0 = DECODE_TABLE[bytes[i] as usize];
        let b1 = if i + 1 < bytes.len() && bytes[i + 1] != b'=' {
            DECODE_TABLE[bytes[i + 1] as usize]
        } else {
            0
        };
        let b2 = if i + 2 < bytes.len() && bytes[i + 2] != b'=' {
            DECODE_TABLE[bytes[i + 2] as usize]
        } else {
            0
        };
        let b3 = if i + 3 < bytes.len() && bytes[i + 3] != b'=' {
            DECODE_TABLE[bytes[i + 3] as usize]
        } else {
            0
        };

        if b0 < 0 || b1 < 0 {
            return Err("Invalid base64 character".into());
        }

        out.push(((b0 as u8) << 2) | ((b1 as u8) >> 4));
        if i + 2 < bytes.len() && bytes[i + 2] != b'=' {
            out.push(((b1 as u8) << 4) | ((b2 as u8) >> 2));
        }
        if i + 3 < bytes.len() && bytes[i + 3] != b'=' {
            out.push(((b2 as u8) << 6) | (b3 as u8));
        }

        i += 4;
    }

    Ok(out)
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
}
