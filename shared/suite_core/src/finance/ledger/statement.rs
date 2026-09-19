use crate::finance::ledger::entry::{
    BillEntry, CustomerLedgerSummary, PaymentEntry, StatementRow,
};
use crate::finance::ledger::fifo::{execute_fifo_settlement, parse_date_to_days, FifoResult};
use crate::types::round2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CustomerStatementResult {
    pub success: bool,
    pub summary: CustomerLedgerSummary,
    pub statement_rows: Vec<StatementRow>,
    pub fifo_result: Option<FifoResult>,
}

#[derive(Debug, Clone)]
enum CombinedItem<'a> {
    Bill(&'a BillEntry, i64),
    Payment(&'a PaymentEntry, i64),
}

pub fn generate_customer_statement(
    opening_balance: f64,
    bills: &[BillEntry],
    payments: &[PaymentEntry],
    current_date_days: i64,
) -> CustomerStatementResult {
    // 1. Sort bills and payments chronologically
    let mut sorted_bills = bills.to_vec();
    sorted_bills.sort_by_key(|b| parse_date_to_days(&b.date).unwrap_or(0));

    let mut sorted_payments = payments.to_vec();
    sorted_payments.sort_by_key(|p| parse_date_to_days(&p.date).unwrap_or(0));

    // 2. Execute FIFO settlement
    let fifo = execute_fifo_settlement(opening_balance, &sorted_bills, &sorted_payments, current_date_days);

    // 3. Build chronological combined stream
    let mut combined: Vec<CombinedItem> = Vec::with_capacity(sorted_bills.len() + sorted_payments.len());
    for b in &sorted_bills {
        let d = parse_date_to_days(&b.date).unwrap_or(0);
        combined.push(CombinedItem::Bill(b, d));
    }
    for p in &sorted_payments {
        let d = parse_date_to_days(&p.date).unwrap_or(0);
        combined.push(CombinedItem::Payment(p, d));
    }
    combined.sort_by_key(|item| match item {
        CombinedItem::Bill(_, d) => *d,
        CombinedItem::Payment(_, d) => *d,
    });

    let mut running_balance = opening_balance;
    let mut statement_rows = Vec::with_capacity(combined.len() + 1);

    // Opening balance row
    statement_rows.push(StatementRow {
        id: "op-bal".to_string(),
        date: None,
        date_formatted: "-".to_string(),
        row_type: "OPENING BALANCE".to_string(),
        reference: "-".to_string(),
        info_text: "-".to_string(),
        debit: if opening_balance > 0.0 { round2(opening_balance) } else { 0.0 },
        credit: if opening_balance < 0.0 { round2(opening_balance.abs()) } else { 0.0 },
        running_balance: round2(running_balance),
    });

    for item in combined {
        match item {
            CombinedItem::Bill(b, _) => {
                running_balance += b.grand_total;
                let info_text = match fifo.bill_settlements.get(&b.id) {
                    Some(s) if s.settled => format!("SETTLED IN {}D", s.days),
                    Some(s) => format!("{}D OUTSTANDING", s.days),
                    None => "-".to_string(),
                };
                statement_rows.push(StatementRow {
                    id: b.id.clone(),
                    date: Some(b.date.clone()),
                    date_formatted: b.date.clone(),
                    row_type: "BILL".to_string(),
                    reference: b.invoice_no.clone(),
                    info_text,
                    debit: round2(b.grand_total),
                    credit: 0.0,
                    running_balance: round2(running_balance),
                });
            }
            CombinedItem::Payment(p, _) => {
                running_balance -= p.amount;
                let info_text = match fifo.payment_allocations.get(&p.id) {
                    Some(a) => format!("ALLOCATED ({}%)", a.allocated_percent),
                    None => "-".to_string(),
                };
                let row_type = if p.is_credit_note {
                    "CREDIT NOTE".to_string()
                } else {
                    "PAYMENT".to_string()
                };
                statement_rows.push(StatementRow {
                    id: p.id.clone(),
                    date: Some(p.date.clone()),
                    date_formatted: p.date.clone(),
                    row_type,
                    reference: p.reference_no.clone(),
                    info_text,
                    debit: 0.0,
                    credit: round2(p.amount),
                    running_balance: round2(running_balance),
                });
            }
        }
    }

    // 4. Summaries
    let mut total_purchases: f64 = sorted_bills.iter().map(|b| b.grand_total).sum();
    if opening_balance > 0.0 {
        total_purchases += opening_balance;
    }

    let current_due = round2(running_balance);
    let total_settled = (total_purchases - current_due).max(0.0);
    let paid_percent = if total_purchases > 0.001 {
        ((total_settled / total_purchases) * 100.0).round().min(100.0) as i64
    } else {
        100
    };

    let total_paid: f64 = sorted_payments
        .iter()
        .filter(|p| !p.is_credit_note)
        .map(|p| p.amount)
        .sum();
    let total_credits: f64 = sorted_payments
        .iter()
        .filter(|p| p.is_credit_note)
        .map(|p| p.amount)
        .sum();

    let summary = CustomerLedgerSummary {
        total_purchases: round2(total_purchases),
        total_billed: round2(total_purchases),
        total_paid: round2(total_paid),
        total_credits: round2(total_credits),
        total_collected: round2(total_paid + total_credits),
        current_due,
        total_settled: round2(total_settled),
        paid_percent,
        total_bills: sorted_bills.len(),
        total_payments: sorted_payments.len(),
    };

    CustomerStatementResult {
        success: true,
        summary,
        statement_rows,
        fifo_result: Some(fifo),
    }
}
