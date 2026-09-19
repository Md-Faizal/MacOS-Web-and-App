use crate::finance::ledger::fifo::parse_date_to_days;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BatchExpiryInfo {
    pub raw_expiry: String,
    pub is_expired: bool,
    pub is_near_expiry: bool,
    pub days_remaining: i64,
}

pub fn check_batch_expiry(raw_expiry: &str, current_date_days: i64) -> BatchExpiryInfo {
    let s = raw_expiry.trim();
    if s.is_empty() {
        return BatchExpiryInfo {
            raw_expiry: s.to_string(),
            is_expired: false,
            is_near_expiry: false,
            days_remaining: 9999,
        };
    }

    // Check if format is MM/YY or MM/YYYY
    let target_days = if s.contains('/') && !s.contains('-') {
        let parts: Vec<&str> = s.split('/').collect();
        if parts.len() == 2 {
            let m: u64 = parts[0].trim().parse().unwrap_or(1);
            let raw_y: i64 = parts[1].trim().parse().unwrap_or(2025);
            let y = if raw_y < 100 { 2000 + raw_y } else { raw_y };
            // Expiry usually ends at the last day of month, say day 28
            let date_str = format!("{:04}-{:02}-28", y, m);
            parse_date_to_days(&date_str).unwrap_or(current_date_days)
        } else {
            current_date_days
        }
    } else {
        parse_date_to_days(s).unwrap_or(current_date_days)
    };

    let diff = target_days - current_date_days;
    let is_expired = diff < 0;
    let is_near_expiry = !is_expired && diff <= 90;

    BatchExpiryInfo {
        raw_expiry: s.to_string(),
        is_expired,
        is_near_expiry,
        days_remaining: diff,
    }
}
