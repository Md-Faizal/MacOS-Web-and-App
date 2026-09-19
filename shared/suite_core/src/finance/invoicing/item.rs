use crate::finance::invoicing::tax::TaxSplit;
use crate::types::round2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LineItemInput {
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default)]
    pub product_name: String,
    #[serde(default)]
    pub variant_id: Option<String>,
    #[serde(default)]
    pub batch_id: Option<String>,
    #[serde(default)]
    pub batch_no: Option<String>,
    pub rate: f64,
    pub qty: f64,
    #[serde(default)]
    pub disc1_percent: f64,
    #[serde(default)]
    pub disc2_percent: f64,
    #[serde(default)]
    pub gst_percent: f64,
    #[serde(default)]
    pub gst_reverse: bool,
    #[serde(default)]
    pub scheme: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LineItemCalculated {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product_id: Option<String>,
    #[serde(default)]
    pub product_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_no: Option<String>,
    pub rate: f64,
    pub discounted_rate: f64,
    pub qty: f64,
    pub amount: f64,
    pub discount_1_percent: f64,
    pub discount_1_amount: f64,
    pub discount_2_percent: f64,
    pub discount_2_amount: f64,
    pub gst_percent: f64,
    pub gst_amount: f64,
    pub sgst_amount: f64,
    pub cgst_amount: f64,
    pub final_amount: f64,
    pub gst_reverse: bool,
    pub free_units: f64,
    // Database backward compatibility aliases
    pub discounted_amount: f64,
    pub finalAmount: f64,
}

impl LineItemCalculated {
    pub fn calculate(input: &LineItemInput) -> Self {
        let mut rate = input.rate;
        let qty = if input.qty <= 0.0 { 1.0 } else { input.qty };
        let disc1_percent = input.disc1_percent;
        let disc2_percent = input.disc2_percent;
        let gst_reverse = input.gst_reverse;
        let gst_percent = input.gst_percent;

        // GST Reverse Logic: Apply 4.77% base deduction to MRP (5% / 1.05 = 0.047619 -> 0.0477)
        if gst_reverse {
            let base_rate = rate * (1.0 - 0.0477);
            rate = base_rate;
        }

        // Step 1: Base Amount
        let amount = rate * qty;

        // Step 2: Discount 1
        let discount_1_amount = amount * (disc1_percent / 100.0);
        let amount_after_disc1 = amount - discount_1_amount;
        let discounted_rate = rate * (1.0 - disc1_percent / 100.0);

        // Step 3: Discount 2
        let discount_2_amount = amount_after_disc1 * (disc2_percent / 100.0);
        let amount_after_disc2 = amount_after_disc1 - discount_2_amount;

        // Step 4: Tax Calculation
        let tax = TaxSplit::calculate(amount_after_disc2, gst_percent);

        // Step 5: Final Amount
        let final_amount = amount_after_disc2 + tax.gst_amount;

        // Scheme bonus calculation
        let free_units = match &input.scheme {
            Some(s) if !s.trim().is_empty() => calculate_free_scheme_units(qty, s),
            _ => 0.0,
        };

        let rounded_final = round2(final_amount);
        let rounded_amount_after_disc2 = round2(amount_after_disc2);

        LineItemCalculated {
            product_id: input.product_id.clone(),
            product_name: input.product_name.clone(),
            variant_id: input.variant_id.clone(),
            batch_id: input.batch_id.clone(),
            batch_no: input.batch_no.clone(),
            rate: round2(rate),
            discounted_rate: round2(discounted_rate),
            qty,
            amount: round2(amount),
            discount_1_percent: disc1_percent,
            discount_1_amount: round2(discount_1_amount),
            discount_2_percent: disc2_percent,
            discount_2_amount: round2(discount_2_amount),
            gst_percent,
            gst_amount: tax.gst_amount,
            sgst_amount: tax.sgst_amount,
            cgst_amount: tax.cgst_amount,
            final_amount: rounded_final,
            gst_reverse,
            free_units,
            discounted_amount: rounded_amount_after_disc2,
            finalAmount: rounded_final,
        }
    }
}

/// Calculate free items from scheme string e.g. "10+1", "5+2"
pub fn calculate_free_scheme_units(qty: f64, scheme: &str) -> f64 {
    let parts: Vec<&str> = scheme.split('+').collect();
    if parts.len() != 2 {
        return 0.0;
    }

    let required: f64 = parts[0].trim().parse().unwrap_or(0.0);
    let free: f64 = parts[1].trim().parse().unwrap_or(0.0);

    if required <= 0.0 || free <= 0.0 {
        return 0.0;
    }

    let sets = (qty / required).floor();
    sets * free
}
