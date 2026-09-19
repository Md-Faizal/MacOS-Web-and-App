use crate::finance::invoicing::item::{LineItemCalculated, LineItemInput};
use crate::types::round2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BillSummary {
    pub subtotal: f64,
    pub total_amount: f64,
    pub total_discount: f64,
    pub total_gst: f64,
    pub total_sgst: f64,
    pub total_cgst: f64,
    pub round_off: f64,
    pub grand_total: f64,
    #[serde(default)]
    pub previous_due: f64,
    #[serde(default)]
    pub projected_due: f64,
    // Database backward compatibility aliases
    pub discountTotal: f64,
    pub taxTotal: f64,
    pub grandTotal: f64,
    pub roundOff: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CalculateBillResult {
    pub success: bool,
    pub items: Vec<LineItemCalculated>,
    pub summary: BillSummary,
    #[serde(default)]
    pub previous_due: f64,
    #[serde(default)]
    pub projected_due: f64,
}

impl BillSummary {
    pub fn calculate(items: &[LineItemCalculated], previous_due: f64, round_off_enabled: bool) -> Self {
        let mut total_amount = 0.0;
        let mut total_discount = 0.0;
        let mut total_gst = 0.0;
        let mut total_sgst = 0.0;
        let mut total_cgst = 0.0;

        for item in items {
            total_amount += item.amount;
            total_discount += item.discount_1_amount + item.discount_2_amount;
            total_gst += item.gst_amount;
            total_sgst += item.sgst_amount;
            total_cgst += item.cgst_amount;
        }

        let subtotal_unrounded = total_amount - total_discount + total_gst;
        let grand_total = if round_off_enabled {
            subtotal_unrounded.round()
        } else {
            round2(subtotal_unrounded)
        };
        let round_off = round2(grand_total - subtotal_unrounded);
        let projected_due = round2(previous_due + grand_total);

        BillSummary {
            subtotal: round2(subtotal_unrounded),
            total_amount: round2(total_amount),
            total_discount: round2(total_discount),
            total_gst: round2(total_gst),
            total_sgst: round2(total_sgst),
            total_cgst: round2(total_cgst),
            round_off,
            grand_total,
            previous_due: round2(previous_due),
            projected_due,
            discountTotal: round2(total_discount),
            taxTotal: round2(total_gst),
            grandTotal: grand_total,
            roundOff: round_off,
        }
    }
}

pub fn calculate_bill(
    raw_items: &[LineItemInput],
    previous_due: f64,
    round_off_enabled: bool,
) -> CalculateBillResult {
    let calculated_items: Vec<LineItemCalculated> = raw_items
        .iter()
        .map(LineItemCalculated::calculate)
        .collect();

    let summary = BillSummary::calculate(&calculated_items, previous_due, round_off_enabled);

    CalculateBillResult {
        success: true,
        items: calculated_items,
        summary: summary.clone(),
        previous_due: summary.previous_due,
        projected_due: summary.projected_due,
    }
}
