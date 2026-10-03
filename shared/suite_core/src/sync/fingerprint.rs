use serde::{Deserialize, Serialize};

/// Fast 64-bit FNV-1a hash for deterministic collection fingerprinting
pub fn fnv1a_64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in bytes {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CollectionMetadata {
    pub domain: String,
    pub count: u64,
    pub max_id: u64,
    pub max_updated_at: i64,
    pub content_hash: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FingerprintResult {
    pub domain: String,
    pub etag: String,
    pub count: u64,
    pub max_id: u64,
    pub max_updated_at: i64,
    pub checksum: String,
}

/// Compute a strong, standardized ETag from collection state parameters
pub fn compute_collection_fingerprint(
    domain: &str,
    count: u64,
    max_id: u64,
    max_updated_at: i64,
    checksum: u64,
) -> FingerprintResult {
    let raw = format!("{}:{}:{}:{}:{:x}", domain, count, max_id, max_updated_at, checksum);
    let hash = fnv1a_64(raw.as_bytes());
    let etag = format!("\"w/f-{:x}-{:x}\"", count, hash);
    let checksum_hex = format!("{:016x}", checksum);

    FingerprintResult {
        domain: domain.to_string(),
        etag,
        count,
        max_id,
        max_updated_at,
        checksum: checksum_hex,
    }
}

/// Compute an ETag directly from a raw JSON data string or payload
pub fn compute_json_etag(domain: &str, json_content: &str) -> FingerprintResult {
    let trimmed = json_content.trim();
    let hash = fnv1a_64(trimmed.as_bytes());
    let len = trimmed.len() as u64;
    let etag = format!("\"w/j-{:x}-{:x}\"", len, hash);

    FingerprintResult {
        domain: domain.to_string(),
        etag,
        count: len,
        max_id: 0,
        max_updated_at: 0,
        checksum: format!("{:016x}", hash),
    }
}

/// Check if client ETag matches server ETag
pub fn compare_etags(client_etag: &str, server_etag: &str) -> bool {
    let clean_client = client_etag.trim().trim_start_matches("W/").trim_matches('"');
    let clean_server = server_etag.trim().trim_start_matches("W/").trim_matches('"');
    clean_client == clean_server
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fnv1a_deterministic() {
        let h1 = fnv1a_64(b"test-invoice-payload-data");
        let h2 = fnv1a_64(b"test-invoice-payload-data");
        assert_eq!(h1, h2);
        assert_ne!(h1, 0);
    }

    #[test]
    fn test_compute_collection_fingerprint() {
        let res = compute_collection_fingerprint("billing:invoices", 42, 108, 1727980000000, 0x12345678);
        assert_eq!(res.domain, "billing:invoices");
        assert!(res.etag.starts_with("\"w/f-2a-"));
    }

    #[test]
    fn test_compare_etags_weak_and_strong() {
        let server = "\"w/f-2a-abcdef\"";
        let client_weak = "W/\"w/f-2a-abcdef\"";
        let client_plain = "\"w/f-2a-abcdef\"";
        assert!(compare_etags(client_weak, server));
        assert!(compare_etags(client_plain, server));
        assert!(!compare_etags("\"w/f-2a-different\"", server));
    }
}
