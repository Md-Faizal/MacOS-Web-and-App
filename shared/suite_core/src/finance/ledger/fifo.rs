use crate::finance::ledger::entry::{BillEntry, PaymentAllocInfo, PaymentEntry, SettlementInfo};
use crate::types::round2;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Convert a date string (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS) into days since 1970-01-01
pub fn parse_date_to_days(s: &str) -> Option<i64> {
    if s.is_empty() {
        return None;
    }
    let parts: Vec<&str> = s.split(|c| c == '-' || c == '/' || c == 'T' || c == ' ').collect();
    if parts.len() < 3 {
        return None;
    }
    let year: i64 = parts[0].parse().ok()?;
    let month: u64 = parts[1].parse().ok()?;
    let day: u64 = parts[2].parse().ok()?;

    if month < 1 || month > 12 || day < 1 || day > 31 {
        return None;
    }

    Some(days_from_civil(year, month, day))
}

#[inline]
fn days_from_civil(mut y: i64, m: u64, d: u64) -> i64 {
    if m <= 2 {
        y -= 1;
    }
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe as i64 - 719468
}

#[derive(Debug, Clone)]
struct PaymentQueueItem {
    id: String,
    total: f64,
    remaining: f64,
    date_days: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FifoResult {
    pub bill_settlements: HashMap<String, SettlementInfo>,
    pub payment_allocations: HashMap<String, PaymentAllocInfo>,
}

/// Execute FIFO debt settlement across bills and payments for a given customer opening balance.
pub fn execute_fifo_settlement(
    opening_balance: f64,
    bills: &[BillEntry],
    payments: &[PaymentEntry],
    current_date_days: i64,
) -> FifoResult {
    let mut p_queue: Vec<PaymentQueueItem> = payments
        .iter()
        .map(|p| PaymentQueueItem {
            id: p.id.clone(),
            total: p.amount,
            remaining: p.amount,
            date_days: parse_date_to_days(&p.date),
        })
        .collect();

    let mut available_credit = if opening_balance < 0.0 {
        opening_balance.abs()
    } else {
        0.0
    };

    let mut debt_to_settle_first = if opening_balance > 0.0 {
        opening_balance
    } else {
        0.0
    };

    // Settle opening debt first
    while debt_to_settle_first > 0.001 && !p_queue.is_empty() {
        let p = &mut p_queue[0];
        let consumed = debt_to_settle_first.min(p.remaining);
        debt_to_settle_first -= consumed;
        p.remaining -= consumed;
        if p.remaining <= 0.001 {
            p_queue.remove(0);
        }
    }

    let mut bill_settlements = HashMap::new();

    for bill in bills {
        let bill_amount = bill.grand_total;
        let mut remaining_to_settle = bill_amount;
        let mut last_credit_days: Option<i64> = None;
        let bill_date_days = parse_date_to_days(&bill.date).unwrap_or(current_date_days);

        if available_credit > 0.001 {
            let consumed = remaining_to_settle.min(available_credit);
            remaining_to_settle -= consumed;
            available_credit -= consumed;
            if remaining_to_settle <= 0.001 {
                last_credit_days = Some(bill_date_days);
            }
        }

        while remaining_to_settle > 0.001 && !p_queue.is_empty() {
            let p = &mut p_queue[0];
            let consumed = remaining_to_settle.min(p.remaining);
            remaining_to_settle -= consumed;
            p.remaining -= consumed;
            if remaining_to_settle <= 0.001 {
                last_credit_days = p.date_days;
            }
            if p.remaining <= 0.001 {
                p_queue.remove(0);
            }
        }

        let paid_amt = bill_amount - remaining_to_settle;
        let is_settled = remaining_to_settle <= 0.001;

        let diff_days = if is_settled {
            let settle_days = last_credit_days.unwrap_or(bill_date_days);
            (settle_days - bill_date_days).max(1)
        } else {
            (current_date_days - bill_date_days).max(1)
        };

        let status = if is_settled {
            "PAID".to_string()
        } else if paid_amt > 0.001 {
            "PARTIAL".to_string()
        } else {
            "UNPAID".to_string()
        };

        bill_settlements.insert(
            bill.id.clone(),
            SettlementInfo {
                settled: is_settled,
                days: diff_days,
                paid: round2(paid_amt),
                remaining: if is_settled { 0.0 } else { round2(remaining_to_settle) },
                total: round2(bill_amount),
                status,
            },
        );
    }

    // Payment allocation results
    let mut payment_allocations = HashMap::new();
    for p in payments {
        let total = p.amount;
        let remaining = p_queue
            .iter()
            .find(|item| item.id == p.id)
            .map(|item| item.remaining)
            .unwrap_or(0.0);
        let allocated = total - remaining;
        let alloc_percent = if total > 0.001 {
            ((allocated / total) * 100.0).round().min(100.0) as i64
        } else {
            100
        };

        payment_allocations.insert(
            p.id.clone(),
            PaymentAllocInfo {
                allocated: round2(allocated),
                remaining: round2(remaining),
                total: round2(total),
                allocated_percent: alloc_percent,
            },
        );
    }

    FifoResult {
        bill_settlements,
        payment_allocations,
    }
}
