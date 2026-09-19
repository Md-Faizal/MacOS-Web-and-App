use crate::types::round2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ExecutiveKpis {
    pub total_billed: f64,
    pub total_bills_count: usize,
    pub total_collected: f64,
    pub payments_count: usize,
    pub amount_due: f64,
    pub overdue_amount: f64,
    pub collection_rate_percent: f64,
    // Database / Frontend camelCase aliases
    pub totalBilled: f64,
    pub totalBillsCount: usize,
    pub totalCollected: f64,
    pub paymentsCount: usize,
    pub amountDue: f64,
    pub overdueAmount: f64,
    pub collectionRatePercent: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OverdueReminder {
    pub bill_id: String,
    pub reference_no: String,
    pub customer_name: String,
    pub invoice_date: Option<String>,
    pub remaining_amount: f64,
    pub days_overdue: i64,
    pub is_critical: bool,
}

pub fn calculate_executive_kpis(
    billed_amounts: &[f64],
    collected_amounts: &[f64],
    opening_balance: f64,
    overdue_amount: f64,
) -> ExecutiveKpis {
    let sum_billed: f64 = billed_amounts.iter().sum::<f64>() + if opening_balance > 0.0 { opening_balance } else { 0.0 };
    let sum_collected: f64 = collected_amounts.iter().sum();

    let total_billed = round2(sum_billed);
    let total_collected = round2(sum_collected);
    let amount_due = (total_billed - total_collected).max(0.0);
    let rounded_due = round2(amount_due);

    let collection_rate = if total_billed > 0.001 {
        ((total_collected / total_billed) * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    };

    ExecutiveKpis {
        total_billed,
        total_bills_count: billed_amounts.len(),
        total_collected,
        payments_count: collected_amounts.len(),
        amount_due: rounded_due,
        overdue_amount: round2(overdue_amount),
        collection_rate_percent: collection_rate,
        totalBilled: total_billed,
        totalBillsCount: billed_amounts.len(),
        totalCollected: total_collected,
        paymentsCount: collected_amounts.len(),
        amountDue: rounded_due,
        overdueAmount: round2(overdue_amount),
        collectionRatePercent: collection_rate,
    }
}
