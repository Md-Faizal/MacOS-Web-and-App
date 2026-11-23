use serde::{Deserialize, Serialize};
use crate::auth::crypto::{constant_time_eq, hmac_sha256};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum BiometricReason {
    Login,
    SessionElevation,
    SudoMode,
    CredentialExport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElevationProof {
    pub user_id: String,
    pub reason: String,
    pub issued_at: usize,
    pub expires_at: usize,
    pub signature: String,
}

pub fn create_elevation_proof(
    user_id: &str,
    reason: BiometricReason,
    current_epoch: usize,
    ttl_seconds: usize,
    secret: &[u8],
) -> ElevationProof {
    let issued_at = current_epoch;
    let expires_at = current_epoch + ttl_seconds;
    let reason_str = match reason {
        BiometricReason::Login => "login",
        BiometricReason::SessionElevation => "session_elevation",
        BiometricReason::SudoMode => "sudo_mode",
        BiometricReason::CredentialExport => "credential_export",
    };

    let payload = format!("{}:{}:{}:{}", user_id, reason_str, issued_at, expires_at);
    let sig = hmac_sha256(secret, payload.as_bytes());
    let sig_hex = hex_encode(&sig);

    ElevationProof {
        user_id: user_id.to_string(),
        reason: reason_str.to_string(),
        issued_at,
        expires_at,
        signature: sig_hex,
    }
}

pub fn verify_elevation_proof(
    proof: &ElevationProof,
    user_id: &str,
    current_epoch: usize,
    secret: &[u8],
) -> bool {
    if proof.user_id != user_id {
        return false;
    }
    if current_epoch > proof.expires_at {
        return false;
    }

    let payload = format!(
        "{}:{}:{}:{}",
        proof.user_id, proof.reason, proof.issued_at, proof.expires_at
    );
    let expected_sig = hmac_sha256(secret, payload.as_bytes());
    let expected_hex = hex_encode(&expected_sig);

    constant_time_eq(proof.signature.as_bytes(), expected_hex.as_bytes())
}

fn hex_encode(data: &[u8]) -> String {
    let mut s = String::with_capacity(data.len() * 2);
    for b in data {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_elevation_proof_roundtrip() {
        let secret = b"super_secret_biometric_salt";
        let user = "usr_faizal_01";
        let now = 1700000000;
        let proof = create_elevation_proof(user, BiometricReason::SudoMode, now, 300, secret);

        assert!(verify_elevation_proof(&proof, user, now + 100, secret));
        assert!(!verify_elevation_proof(&proof, "wrong_user", now + 100, secret));
        assert!(!verify_elevation_proof(&proof, user, now + 301, secret)); // expired
    }
}
