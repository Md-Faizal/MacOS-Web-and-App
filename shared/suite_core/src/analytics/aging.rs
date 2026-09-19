use crate::types::round2;
use serde::{Deserialize, Serialize};

/// Granular Aging buckets for customer statements (0-7, 8-15, 16-30, >30 days)
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct CustomerAgingBuckets {
    pub ageing_0_to_7: f64,
    pub ageing_8_to_15: f64,
    pub ageing_16_to_30: f64,
    pub ageing_over_30: f64,
    pub total: f64,
    // Database and Frontend legacy aliases
    pub ageing0to7: f64,
    pub ageing8to15: f64,
    pub ageing16to30: f64,
    pub ageingOver30: f64,
}

/// Executive Macro Aging buckets for executive dashboards (0-30, 31-60, 61+ days)
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ReceivablesAgingBuckets {
    pub outstanding0to30: f64,
    pub outstanding31to60: f64,
    pub outstanding61Plus: f64,
    pub totalOutstanding: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UnpaidBillItem {
    pub bill_id: String,
    pub days_elapsed: i64,
    pub remaining_amount: f64,
}

/// Calculate customer statement aging buckets (0-7, 8-15, 16-30, >30)
pub fn calculate_customer_aging(
    unpaid_items: &[UnpaidBillItem],
    opening_balance: f64,
) -> CustomerAgingBuckets {
    let mut b0_7 = 0.0;
    let mut b8_15 = 0.0;
    let mut b16_30 = 0.0;
    let mut b_over30 = if opening_balance > 0.0 { opening_balance } else { 0.0 };

    for item in unpaid_items {
        if item.remaining_amount <= 0.001 {
            continue;
        }
        let days = item.days_elapsed;
        let amt = item.remaining_amount;

        if days <= 7 {
            b0_7 += amt;
        } else if days <= 15 {
            b8_15 += amt;
        } else if days <= 30 {
            b16_30 += amt;
        } else {
            b_over30 += amt;
        }
    }

    let r0_7 = round2(b0_7);
    let r8_15 = round2(b8_15);
    let r16_30 = round2(b16_30);
    let r_over30 = round2(b_over30);
    let total = round2(r0_7 + r8_15 + r16_30 + r_over30);

    CustomerAgingBuckets {
        ageing_0_to_7: r0_7,
        ageing_8_to_15: r8_15,
        ageing_16_to_30: r16_30,
        ageing_over_30: r_over30,
        total,
        ageing0to7: r0_7,
        ageing8to15: r8_15,
        ageing16to30: r16_30,
        ageingOver30: r_over30,
    }
}

/// Calculate executive macro receivables aging buckets (0-30, 31-60, 61+)
pub fn calculate_receivables_aging(unpaid_items: &[UnpaidBillItem]) -> ReceivablesAgingBuckets {
    let mut b0_30 = 0.0;
    let mut b31_60 = 0.0;
    let mut b61_plus = 0.0;

    for item in unpaid_items {
        if item.remaining_amount <= 0.001 {
            continue;
        }
        let days = item.days_elapsed;
        let amt = item.remaining_amount;

        if days <= 30 {
            b0_30 += amt;
        } else if days <= 60 {
            b31_60 += amt;
        } else {
            b61_plus += amt;
        }
    }

    let r0_30 = round2(b0_30);
    let r31_60 = round2(b31_60);
    let r61_plus = round2(b61_plus);
    let total = round2(r0_30 + r31_60 + r61_plus);

    ReceivablesAgingBuckets {
        outstanding0to30: r0_30,
        outstanding31to60: r31_60,
        outstanding61Plus: r61_plus,
        totalOutstanding: total,
    }
}
