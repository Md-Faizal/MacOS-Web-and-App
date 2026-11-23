use sha2::{Digest, Sha256};

/// Computes HMAC-SHA256 in pure Rust (FIPS 198 standard).
/// Zero external C or OS dependencies — compiles directly into WebAssembly & mobile runtimes.
pub fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut k = [0u8; 64];
    if key.len() > 64 {
        let hash = Sha256::digest(key);
        k[..32].copy_from_slice(&hash);
    } else {
        k[..key.len()].copy_from_slice(key);
    }

    let mut i_key = [0u8; 64];
    let mut o_key = [0u8; 64];
    for i in 0..64 {
        i_key[i] = k[i] ^ 0x36;
        o_key[i] = k[i] ^ 0x5c;
    }

    let mut inner = Sha256::new();
    inner.update(&i_key);
    inner.update(data);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(&o_key);
    outer.update(&inner_hash);
    outer.finalize().into()
}

/// Constant-time byte array equality comparison to prevent timing attacks.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Computes SHA256 hash of a string and returns hex string.
pub fn sha256_hex(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    let hash = hasher.finalize();
    let mut hex = String::with_capacity(64);
    for byte in hash {
        hex.push_str(&format!("{:02x}", byte));
    }
    hex
}

/// Encodes raw bytes into base64url without padding (RFC 7515).
pub fn base64_url_encode(input: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity((input.len() * 4 + 2) / 3);

    let mut i = 0;
    while i < input.len() {
        let b0 = input[i] as usize;
        let b1 = if i + 1 < input.len() { input[i + 1] as usize } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] as usize } else { 0 };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[(triple >> 18) & 0x3F] as char);
        out.push(TABLE[(triple >> 12) & 0x3F] as char);

        if i + 1 < input.len() {
            out.push(TABLE[(triple >> 6) & 0x3F] as char);
        }
        if i + 2 < input.len() {
            out.push(TABLE[triple & 0x3F] as char);
        }

        i += 3;
    }

    out
}

/// Decodes base64url string with or without padding.
pub fn base64_url_decode(input: &str) -> Result<Vec<u8>, String> {
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
    fn test_hmac_roundtrip() {
        let key = b"my_secret_key";
        let message = b"Hello Nexus Ecosystem";
        let sig1 = hmac_sha256(key, message);
        let sig2 = hmac_sha256(key, message);
        assert_eq!(sig1, sig2);
        assert!(constant_time_eq(&sig1, &sig2));

        let wrong_key = b"wrong_key";
        let sig3 = hmac_sha256(wrong_key, message);
        assert!(!constant_time_eq(&sig1, &sig3));
    }

    #[test]
    fn test_base64_url() {
        let text = b"{\"sub\":\"usr_faizal\",\"role\":\"owner\"}";
        let enc = base64_url_encode(text);
        assert!(!enc.contains('='));
        assert!(!enc.contains('+'));
        assert!(!enc.contains('/'));

        let dec = base64_url_decode(&enc).unwrap();
        assert_eq!(dec, text);
    }
}
