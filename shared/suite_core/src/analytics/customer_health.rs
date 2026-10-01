use serde::{Deserialize, Serialize};

#[inline]
pub fn clamp(value: f64, min: f64, max: f64) -> f64 {
    if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct CustomerHealthInputs {
    pub total_sales: f64,
    pub current_due: f64,
    pub opening_balance: f64,
    pub avg_settlement_days: f64,
    pub invoice_count: u32,
    pub days_since_last_payment: f64,
    pub days_since_last_activity: f64,
    pub last_payment_amount: f64,
    pub last_bill_amount: f64,
    pub collected_amount: f64,
    pub payment_count: u32,
    pub favorite_product: String,
    pub customer_type: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct CustomerHealthSnapshot {
    pub credit_health: f64,
    pub payment_momentum: f64,
    pub settlement_score: f64,
    pub coverage_score: f64,
    pub activity_trend: Vec<f64>,
}

#[inline]
pub fn settlement_score(avg_settlement_days: f64, invoice_count: u32) -> f64 {
    let invoice_factor = clamp((invoice_count as f64) / 20.0, 0.0, 1.0);
    let speed_score = clamp(100.0 - (avg_settlement_days / 60.0) * 100.0, 0.0, 100.0);
    let score = (speed_score * 0.8) + (invoice_factor * 100.0 * 0.2);
    clamp(score, 0.0, 100.0)
}

#[inline]
pub fn coverage_score(total_sales: f64, current_due: f64) -> f64 {
    if total_sales <= 0.0 {
        return 100.0;
    }
    let realized_ratio = (total_sales - current_due) / total_sales;
    clamp(realized_ratio * 100.0, 0.0, 100.0)
}

#[inline]
pub fn activity_recency_score(days_since_last_payment: f64, days_since_last_activity: f64) -> f64 {
    let payment_recency = clamp(100.0 - (days_since_last_payment / 90.0) * 100.0, 0.0, 100.0);
    let activity_recency = clamp(100.0 - (days_since_last_activity / 120.0) * 100.0, 0.0, 100.0);
    clamp((payment_recency * 0.7) + (activity_recency * 0.3), 0.0, 100.0)
}

#[inline]
pub fn credit_health_score(input: &CustomerHealthInputs) -> f64 {
    let coverage = coverage_score(input.total_sales, input.current_due);
    let recency = activity_recency_score(input.days_since_last_payment, input.days_since_last_activity);
    let settlement = settlement_score(input.avg_settlement_days, input.invoice_count);
    let balance_factor = if input.current_due <= 0.0 {
        100.0
    } else {
        clamp((1.0 - (input.current_due / input.total_sales.max(1.0))) * 100.0, 0.0, 100.0)
    };

    let score = (coverage * 0.45) + (recency * 0.25) + (settlement * 0.20) + (balance_factor * 0.10);
    clamp(score, 0.0, 100.0)
}

#[inline]
pub fn payment_momentum_score(input: &CustomerHealthInputs) -> f64 {
    let collection_ratio = if input.total_sales > 0.0 {
        clamp(((input.total_sales - input.current_due) / input.total_sales) * 100.0, 0.0, 100.0)
    } else {
        0.0
    };
    let recency = activity_recency_score(input.days_since_last_payment, input.days_since_last_activity);
    let settlement = settlement_score(input.avg_settlement_days, input.invoice_count);
    let payment_density = if input.payment_count == 0 {
        0.0
    } else {
        clamp((input.payment_count as f64 / 12.0) * 100.0, 0.0, 100.0)
    };

    let score = (collection_ratio * 0.45) + (recency * 0.30) + (settlement * 0.15) + (payment_density * 0.10);
    clamp(score, 0.0, 100.0)
}

#[inline]
pub fn build_activity_trend(input: &CustomerHealthInputs) -> Vec<f64> {
    let trend_base = credit_health_score(input) * 0.75 + payment_momentum_score(input) * 0.25;
    let mut points: Vec<f64> = Vec::with_capacity(6);

    for idx in 0..6 {
        let wave = ((idx as f64 + 1.0) * 9.0) / 6.0;
        let variance = ((idx % 3) as f64 * 8.0) + 10.0;
        let recency_boost = if input.days_since_last_payment <= 30.0 { 18.0 } else { 0.0 };
        let score = clamp(trend_base + wave - variance + recency_boost, 15.0, 98.0);
        points.push(round2(score));
    }

    points
}

#[inline]
pub fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[inline]
pub fn score_customer_health(input: &CustomerHealthInputs) -> CustomerHealthSnapshot {
    let credit = credit_health_score(input);
    let payment = payment_momentum_score(input);
    let settlement = settlement_score(input.avg_settlement_days, input.invoice_count);
    let coverage = coverage_score(input.total_sales, input.current_due);
    let trend = build_activity_trend(input);

    CustomerHealthSnapshot {
        credit_health: round2(credit),
        payment_momentum: round2(payment),
        settlement_score: round2(settlement),
        coverage_score: round2(coverage),
        activity_trend: trend,
    }
}
