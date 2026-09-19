use crate::finance::invoicing::item::{LineItemCalculated, LineItemInput};
use crate::finance::invoicing::tax::TaxSplit;

/// Fast register C ABI for live keystroke calculation in modals.
/// Writes [amount, disc1_amt, disc2_amt, gst_amt, sgst_amt, cgst_amt, final_amt] to out_ptr.
/// Returns 0 on success, -1 on invalid pointer.
#[no_mangle]
pub unsafe extern "C" fn calc_line_item_fast(
    rate: f64,
    qty: f64,
    disc1: f64,
    disc2: f64,
    gst: f64,
    gst_reverse: i32,
    out_ptr: *mut f64,
) -> i32 {
    if out_ptr.is_null() {
        return -1;
    }

    let input = LineItemInput {
        product_id: None,
        product_name: String::new(),
        variant_id: None,
        batch_id: None,
        batch_no: None,
        rate,
        qty,
        disc1_percent: disc1,
        disc2_percent: disc2,
        gst_percent: gst,
        gst_reverse: gst_reverse != 0,
        scheme: None,
    };

    let calc = LineItemCalculated::calculate(&input);

    let out = std::slice::from_raw_parts_mut(out_ptr, 7);
    out[0] = calc.amount;
    out[1] = calc.discount_1_amount;
    out[2] = calc.discount_2_amount;
    out[3] = calc.gst_amount;
    out[4] = calc.sgst_amount;
    out[5] = calc.cgst_amount;
    out[6] = calc.final_amount;

    0
}

/// Fast register C ABI for tax split calculation.
/// Writes [gst_amt, sgst_amt, cgst_amt] to out_ptr.
#[no_mangle]
pub unsafe extern "C" fn calc_tax_split_fast(
    amount: f64,
    gst_percent: f64,
    out_ptr: *mut f64,
) -> i32 {
    if out_ptr.is_null() {
        return -1;
    }

    let split = TaxSplit::calculate(amount, gst_percent);
    let out = std::slice::from_raw_parts_mut(out_ptr, 3);
    out[0] = split.gst_amount;
    out[1] = split.sgst_amount;
    out[2] = split.cgst_amount;

    0
}
