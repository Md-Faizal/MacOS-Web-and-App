use crate::types::round2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TaxSplit {
    pub gst_percent: f64,
    pub gst_amount: f64,
    pub sgst_amount: f64,
    pub cgst_amount: f64,
}

impl TaxSplit {
    pub fn calculate(taxable_amount: f64, gst_percent: f64) -> Self {
        if gst_percent <= 0.0 || taxable_amount <= 0.0 {
            return TaxSplit {
                gst_percent: 0.0,
                gst_amount: 0.0,
                sgst_amount: 0.0,
                cgst_amount: 0.0,
            };
        }

        let gst_amount = round2(taxable_amount * (gst_percent / 100.0));
        let half_gst = round2(gst_amount / 2.0);

        TaxSplit {
            gst_percent,
            gst_amount,
            sgst_amount: half_gst,
            cgst_amount: half_gst,
        }
    }

    /// Reverse GST extraction: Extracts base rate when rate includes GST.
    /// Formula: Base Rate = MRP / (1 + GST_Rate / 100)
    pub fn extract_reverse_base_rate(mrp: f64, gst_percent: f64) -> (f64, f64) {
        if gst_percent <= 0.0 || mrp <= 0.0 {
            return (mrp, 0.0);
        }

        let factor = 1.0 + (gst_percent / 100.0);
        let base_rate = round2(mrp / factor);
        let embedded_tax_deduction = round2(mrp - base_rate);
        (base_rate, embedded_tax_deduction)
    }
}
