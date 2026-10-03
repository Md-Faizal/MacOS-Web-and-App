use crate::finance::ledger::fifo::parse_date_to_days;
use crate::types::round2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DepletionStrategy {
    #[serde(rename = "fefo")]
    FEFO,
    #[serde(rename = "fifo")]
    FIFO,
}

impl Default for DepletionStrategy {
    fn default() -> Self {
        DepletionStrategy::FEFO
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BatchStockItem {
    pub batch_id: Option<String>,
    pub batch_no: String,
    pub expiry_date: Option<String>,
    pub current_stock: f64,
    pub mrp: Option<f64>,
    pub rate: Option<f64>,
    pub created_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DepletionAllocation {
    pub batch_id: Option<String>,
    pub batch_no: String,
    pub qty_deducted: f64,
    pub remaining_in_batch: f64,
    pub expiry_date: Option<String>,
    pub rate: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DepletionResult {
    pub success: bool,
    pub requested_qty: f64,
    pub allocated_qty: f64,
    pub unfulfilled_qty: f64,
    pub is_fully_allocated: bool,
    pub allocations: Vec<DepletionAllocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepletionOptions {
    #[serde(default)]
    pub strategy: DepletionStrategy,
    #[serde(default)]
    pub allow_expired: bool,
    pub current_date_days: Option<i64>,
}

impl Default for DepletionOptions {
    fn default() -> Self {
        Self {
            strategy: DepletionStrategy::FEFO,
            allow_expired: false,
            current_date_days: None,
        }
    }
}

/// Helper to parse expiry string into days since epoch.
/// Supports YYYY-MM-DD, YYYY-MM, MM/YY, and MM/YYYY.
pub fn parse_batch_expiry_to_days(raw_expiry: &str) -> Option<i64> {
    let s = raw_expiry.trim();
    if s.is_empty() {
        return None;
    }

    if s.contains('/') && !s.contains('-') {
        let parts: Vec<&str> = s.split('/').collect();
        if parts.len() == 2 {
            let m: u64 = parts[0].trim().parse().ok()?;
            let raw_y: i64 = parts[1].trim().parse().ok()?;
            let y = if raw_y < 100 { 2000 + raw_y } else { raw_y };
            let date_str = format!("{:04}-{:02}-28", y, m);
            return parse_date_to_days(&date_str);
        }
    }

    // Try standard YYYY-MM-DD
    if let Some(days) = parse_date_to_days(s) {
        return Some(days);
    }

    // Try YYYY-MM
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() == 2 {
        let y: i64 = parts[0].trim().parse().ok()?;
        let m: u64 = parts[1].trim().parse().ok()?;
        let date_str = format!("{:04}-{:02}-28", y, m);
        return parse_date_to_days(&date_str);
    }

    None
}

/// Deplete inventory across available batches according to FEFO/FIFO strategy.
///
/// Features:
/// - Deterministic FEFO (earliest expiry consumed first).
/// - Fallback to FIFO for identical expiry dates.
/// - Option to reject expired batches (`allow_expired = false`).
/// - Zero floating-point drift with `round2`.
pub fn deplete_inventory_batches(
    requested_qty: f64,
    batches: &[BatchStockItem],
    options: &DepletionOptions,
) -> DepletionResult {
    let target_qty = round2(requested_qty.max(0.0));
    if target_qty <= 0.0 {
        return DepletionResult {
            success: true,
            requested_qty: 0.0,
            allocated_qty: 0.0,
            unfulfilled_qty: 0.0,
            is_fully_allocated: true,
            allocations: Vec::new(),
        };
    }

    struct Candidate<'a> {
        index: usize,
        batch: &'a BatchStockItem,
        expiry_days: Option<i64>,
        created_at: i64,
        is_expired: bool,
    }

    let mut candidates: Vec<Candidate> = batches
        .iter()
        .enumerate()
        .filter(|(_, b)| b.current_stock > 0.0)
        .map(|(index, batch)| {
            let expiry_days = batch
                .expiry_date
                .as_deref()
                .and_then(parse_batch_expiry_to_days);

            let is_expired = match (expiry_days, options.current_date_days) {
                (Some(exp), Some(cur)) => exp < cur,
                _ => false,
            };

            let created_at = batch.created_at.unwrap_or(index as i64);

            Candidate {
                index,
                batch,
                expiry_days,
                created_at,
                is_expired,
            }
        })
        .filter(|c| options.allow_expired || !c.is_expired)
        .collect();

    // Sort according to strategy
    match options.strategy {
        DepletionStrategy::FEFO => {
            candidates.sort_by(|a, b| {
                match (a.expiry_days, b.expiry_days) {
                    (Some(d1), Some(d2)) if d1 != d2 => d1.cmp(&d2),
                    (Some(_), None) => std::cmp::Ordering::Less, // Batches with expiry come first
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    _ => a.created_at.cmp(&b.created_at).then(a.index.cmp(&b.index)),
                }
            });
        }
        DepletionStrategy::FIFO => {
            candidates.sort_by(|a, b| {
                a.created_at.cmp(&b.created_at).then(a.index.cmp(&b.index))
            });
        }
    }

    let mut remaining_needed = target_qty;
    let mut allocations = Vec::new();
    let mut total_allocated = 0.0;

    for candidate in candidates {
        if remaining_needed <= 0.0 {
            break;
        }

        let available = round2(candidate.batch.current_stock);
        if available <= 0.0 {
            continue;
        }

        let to_deduct = round2(remaining_needed.min(available));
        let remaining_in_batch = round2(available - to_deduct);

        allocations.push(DepletionAllocation {
            batch_id: candidate.batch.batch_id.clone(),
            batch_no: candidate.batch.batch_no.clone(),
            qty_deducted: to_deduct,
            remaining_in_batch,
            expiry_date: candidate.batch.expiry_date.clone(),
            rate: candidate.batch.rate,
        });

        total_allocated = round2(total_allocated + to_deduct);
        remaining_needed = round2(remaining_needed - to_deduct);
    }

    let unfulfilled_qty = round2(remaining_needed.max(0.0));
    let is_fully_allocated = unfulfilled_qty == 0.0;

    DepletionResult {
        success: true,
        requested_qty: target_qty,
        allocated_qty: total_allocated,
        unfulfilled_qty,
        is_fully_allocated,
        allocations,
    }
}
