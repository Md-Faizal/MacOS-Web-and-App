use crate::types::{round2, Paise};
use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Pure Rust Self-Contained SHA-256 Implementation (Zero Dependencies)
// Compliant with NIST FIPS 180-4
// ─────────────────────────────────────────────────────────────────────────────

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

#[inline]
fn rotr(x: u32, n: u32) -> u32 {
    (x >> n) | (x << (32 - n))
}

pub fn sha256_hex(data: &[u8]) -> String {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0x00);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            let s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for i in 0..64 {
            let s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    format!(
        "{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}",
        h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Numbering & Sequencing Engine
// ─────────────────────────────────────────────────────────────────────────────

pub const DEFAULT_GENESIS_HASH: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceSequenceConfig {
    #[serde(default = "default_prefix")]
    pub prefix: String,
    pub year: Option<String>,
    #[serde(default = "default_separator")]
    pub separator: String,
    #[serde(default = "default_padding")]
    pub padding: usize,
}

fn default_prefix() -> String {
    "INV".to_string()
}
fn default_separator() -> String {
    "-".to_string()
}
fn default_padding() -> usize {
    4
}

impl Default for InvoiceSequenceConfig {
    fn default() -> Self {
        Self {
            prefix: default_prefix(),
            year: None,
            separator: default_separator(),
            padding: default_padding(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InvoiceNumberParsed {
    pub full_number: String,
    pub prefix: String,
    pub year: Option<String>,
    pub sequence_num: u64,
}

/// Format an invoice number from config and sequence number
pub fn format_invoice_number(config: &InvoiceSequenceConfig, seq: u64) -> String {
    let padded = format!("{:0width$}", seq, width = config.padding);
    match &config.year {
        Some(y) if !y.is_empty() => {
            format!("{}{}{}{}{}", config.prefix, config.separator, y, config.separator, padded)
        }
        _ => format!("{}{}{}", config.prefix, config.separator, padded),
    }
}

/// Parse an invoice number into prefix, optional year, and sequence number.
/// Supports formats like INV-0001, INV-2026-0001, BILL/2026-27/0001
pub fn parse_invoice_number(full_number: &str) -> Option<InvoiceNumberParsed> {
    let s = full_number.trim();
    if s.is_empty() {
        return None;
    }

    let parts: Vec<&str> = s.split(|c| c == '-' || c == '/' || c == '_').collect();
    if parts.is_empty() {
        return None;
    }

    let last_part = parts.last()?;
    let seq_num: u64 = last_part.parse().ok()?;

    if parts.len() == 1 {
        return Some(InvoiceNumberParsed {
            full_number: s.to_string(),
            prefix: String::new(),
            year: None,
            sequence_num: seq_num,
        });
    }

    let prefix = parts[0].to_string();
    let year = if parts.len() >= 3 {
        // e.g. INV - 2026 - 0001 -> parts[1] is year
        Some(parts[1..parts.len() - 1].join("-"))
    } else {
        None
    };

    Some(InvoiceNumberParsed {
        full_number: s.to_string(),
        prefix,
        year,
        sequence_num: seq_num,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmployeeCodeConfig {
    #[serde(default = "default_emp_prefix")]
    pub prefix: String,
    #[serde(default = "default_emp_separator")]
    pub separator: String,
    #[serde(default = "default_emp_padding")]
    pub padding: usize,
}

fn default_emp_prefix() -> String {
    "UCA-26".to_string()
}
fn default_emp_separator() -> String {
    "-".to_string()
}
fn default_emp_padding() -> usize {
    4
}

impl Default for EmployeeCodeConfig {
    fn default() -> Self {
        Self {
            prefix: default_emp_prefix(),
            separator: default_emp_separator(),
            padding: default_emp_padding(),
        }
    }
}

/// Format an employee code given config and sequence number (e.g. EMP-001, EMP-042)
pub fn format_employee_code(config: &EmployeeCodeConfig, seq: u64) -> String {
    format!(
        "{}{:0width$}",
        format!("{}{}", config.prefix, config.separator),
        seq,
        width = config.padding
    )
}

/// Compute the next sequential employee code given a list of existing employee codes.
/// Finds the highest numeric suffix matching prefix, or falls back to max(count + 1).
pub fn generate_next_employee_code(existing_codes: &[String], config: Option<&EmployeeCodeConfig>) -> String {
    let default_cfg = EmployeeCodeConfig::default();
    let cfg = config.unwrap_or(&default_cfg);

    let mut max_seq: u64 = 0;
    for code in existing_codes {
        let trimmed = code.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(parsed) = parse_invoice_number(trimmed) {
            if parsed.sequence_num > max_seq {
                max_seq = parsed.sequence_num;
            }
        }
    }

    let next_seq = max_seq + 1;
    format_employee_code(cfg, next_seq)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompanyDocRefConfig {
    #[serde(default = "default_company_prefix")]
    pub company_prefix: String,
    #[serde(default = "default_dept_code")]
    pub department_code: String,
    #[serde(default = "default_ref_year")]
    pub year: String,
    #[serde(default = "default_ref_padding")]
    pub padding: usize,
}

fn default_company_prefix() -> String {
    "UCA".to_string()
}
fn default_dept_code() -> String {
    "GEN".to_string()
}
fn default_ref_year() -> String {
    "2026".to_string()
}
fn default_ref_padding() -> usize {
    4
}

impl Default for CompanyDocRefConfig {
    fn default() -> Self {
        Self {
            company_prefix: default_company_prefix(),
            department_code: default_dept_code(),
            year: default_ref_year(),
            padding: default_ref_padding(),
        }
    }
}

/// Format a company document reference (e.g. UCA/HR/2026/0001, UCA/REG/2026/0042)
pub fn format_company_doc_ref(config: &CompanyDocRefConfig, seq: u64) -> String {
    format!(
        "{}/{}/{}/{:0width$}",
        config.company_prefix.trim().to_uppercase(),
        config.department_code.trim().to_uppercase(),
        config.year.trim(),
        seq,
        width = config.padding
    )
}

/// Compute the next sequential company document reference based on existing references for that dept & year
pub fn generate_next_company_doc_ref(existing_refs: &[String], config: &CompanyDocRefConfig) -> String {
    let mut max_seq: u64 = 0;
    for r in existing_refs {
        let trimmed = r.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split('/').collect();
        if parts.len() >= 4 {
            if let Ok(seq) = parts[parts.len() - 1].parse::<u64>() {
                if seq > max_seq {
                    max_seq = seq;
                }
            }
        }
    }
    format_company_doc_ref(config, max_seq + 1)
}


#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NumberingAuditResult {
    pub total_count: usize,
    pub min_seq: Option<u64>,
    pub max_seq: Option<u64>,
    pub missing_numbers: Vec<u64>,
    pub duplicate_numbers: Vec<u64>,
    pub next_available_number: u64,
    pub is_strictly_sequential: bool,
}

/// Analyze an array of invoice numbers and detect numbering gaps or duplicates.
pub fn audit_invoice_numbering(invoice_numbers: &[String]) -> NumberingAuditResult {
    if invoice_numbers.is_empty() {
        return NumberingAuditResult {
            total_count: 0,
            min_seq: None,
            max_seq: None,
            missing_numbers: Vec::new(),
            duplicate_numbers: Vec::new(),
            next_available_number: 1,
            is_strictly_sequential: true,
        };
    }

    let mut seqs = Vec::new();
    for num in invoice_numbers {
        if let Some(parsed) = parse_invoice_number(num) {
            seqs.push(parsed.sequence_num);
        }
    }

    if seqs.is_empty() {
        return NumberingAuditResult {
            total_count: 0,
            min_seq: None,
            max_seq: None,
            missing_numbers: Vec::new(),
            duplicate_numbers: Vec::new(),
            next_available_number: 1,
            is_strictly_sequential: true,
        };
    }

    seqs.sort_unstable();

    let mut duplicates = Vec::new();
    let mut deduped = Vec::new();

    for &val in &seqs {
        if let Some(&last) = deduped.last() {
            if last == val {
                if !duplicates.contains(&val) {
                    duplicates.push(val);
                }
                continue;
            }
        }
        deduped.push(val);
    }

    let min_seq = *deduped.first().unwrap();
    let max_seq = *deduped.last().unwrap();
    let mut missing = Vec::new();

    // Check consecutive range between min and max
    let mut expected = min_seq;
    for &curr in &deduped {
        while expected < curr {
            missing.push(expected);
            expected += 1;
        }
        expected = curr + 1;
    }

    let is_strictly_sequential = missing.is_empty() && duplicates.is_empty();
    let next_available_number = max_seq + 1;

    NumberingAuditResult {
        total_count: invoice_numbers.len(),
        min_seq: Some(min_seq),
        max_seq: Some(max_seq),
        missing_numbers: missing,
        duplicate_numbers: duplicates,
        next_available_number,
        is_strictly_sequential,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cryptographic Anti-Tamper Audit Trail (Rolling SHA-256 Hash Chain)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LedgerAuditEntry {
    pub entry_id: String,
    pub invoice_no: Option<String>,
    pub party_id: String,
    pub party_name: Option<String>,
    pub amount: f64,
    pub timestamp: i64,
    pub entry_type: String, // e.g. "invoice", "payment", "credit_note"
    pub stored_hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LedgerChainAuditReport {
    pub is_valid: bool,
    pub total_entries: usize,
    pub tampered_index: Option<usize>,
    pub tampered_entry_id: Option<String>,
    pub expected_hash: Option<String>,
    pub actual_hash: Option<String>,
    pub head_hash: String,
    pub computed_hashes: Vec<String>,
}

/// Compute rolling SHA-256 hash for a single ledger entry based on previous hash.
/// Format: sha256("{prev_hash}|{entry_id}|{party_id}|{amount_paise}|{timestamp}|{entry_type}")
pub fn compute_ledger_entry_hash(prev_hash: &str, entry: &LedgerAuditEntry) -> String {
    let amount_paise = Paise::from_rupees(round2(entry.amount)).0;
    let payload = format!(
        "{}|{}|{}|{}|{}|{}",
        prev_hash.trim(),
        entry.entry_id.trim(),
        entry.party_id.trim(),
        amount_paise,
        entry.timestamp,
        entry.entry_type.trim().to_lowercase()
    );
    sha256_hex(payload.as_bytes())
}

/// Verify the entire rolling hash chain across a list of chronological ledger entries.
/// Returns true if all entries are cryptographically linked without any tampering.
pub fn verify_ledger_chain(
    entries: &[LedgerAuditEntry],
    genesis_hash: Option<&str>,
) -> LedgerChainAuditReport {
    let genesis = genesis_hash.unwrap_or(DEFAULT_GENESIS_HASH);
    let mut current_hash = genesis.to_string();
    let mut computed_hashes = Vec::with_capacity(entries.len());

    for (idx, entry) in entries.iter().enumerate() {
        let expected = compute_ledger_entry_hash(&current_hash, entry);
        computed_hashes.push(expected.clone());

        if let Some(ref stored) = entry.stored_hash {
            if stored.trim().to_lowercase() != expected {
                return LedgerChainAuditReport {
                    is_valid: false,
                    total_entries: entries.len(),
                    tampered_index: Some(idx),
                    tampered_entry_id: Some(entry.entry_id.clone()),
                    expected_hash: Some(expected),
                    actual_hash: Some(stored.clone()),
                    head_hash: current_hash,
                    computed_hashes,
                };
            }
        }

        current_hash = expected;
    }

    LedgerChainAuditReport {
        is_valid: true,
        total_entries: entries.len(),
        tampered_index: None,
        tampered_entry_id: None,
        expected_hash: None,
        actual_hash: None,
        head_hash: current_hash,
        computed_hashes,
    }
}
