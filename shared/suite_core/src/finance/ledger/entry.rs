use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BillEntry {
    pub id: String,
    pub customer_id: String,
    #[serde(default)]
    pub invoice_no: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub due_date: Option<String>,
    pub grand_total: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaymentEntry {
    pub id: String,
    pub customer_id: String,
    #[serde(default)]
    pub reference_no: String,
    #[serde(default)]
    pub date: String,
    pub amount: f64,
    #[serde(default)]
    pub is_credit_note: bool,
    #[serde(default)]
    pub payment_medium: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SettlementInfo {
    pub settled: bool,
    pub days: i64,
    pub paid: f64,
    pub remaining: f64,
    pub total: f64,
    pub status: String, // "PAID", "PARTIAL", "UNPAID"
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaymentAllocInfo {
    pub allocated: f64,
    pub remaining: f64,
    pub total: f64,
    pub allocated_percent: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StatementRow {
    pub id: String,
    pub date: Option<String>,
    pub date_formatted: String,
    #[serde(rename = "type")]
    pub row_type: String,
    pub reference: String,
    pub info_text: String,
    pub debit: f64,
    pub credit: f64,
    pub running_balance: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CustomerLedgerSummary {
    pub total_purchases: f64,
    pub total_billed: f64,
    pub total_paid: f64,
    pub total_credits: f64,
    pub total_collected: f64,
    pub current_due: f64,
    pub total_settled: f64,
    pub paid_percent: i64,
    pub total_bills: usize,
    pub total_payments: usize,
}
