use crate::finance::invoicing::item::{LineItemCalculated, LineItemInput};
use jni::objects::{JClass, JDoubleArray};
use jni::JNIEnv;

/// JNI bridge function for instant modal keystroke calculation in Android.
/// Takes rate, qty, disc1, disc2, gst, gstReverse and writes into out_array (7 doubles):
/// [amount, disc1_amt, disc2_amt, gst_amt, sgst_amt, cgst_amt, final_amt]
#[no_mangle]
pub extern "system" fn Java_com_example_macosbusinesssuite_domain_calculation_BillCalculator_calculateLineItemFast(
    env: JNIEnv,
    _class: JClass,
    rate: f64,
    qty: f64,
    disc1: f64,
    disc2: f64,
    gst: f64,
    gst_reverse: u8,
    out_array: JDoubleArray,
) -> i32 {
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

    let buf: [f64; 7] = [
        calc.amount,
        calc.discount_1_amount,
        calc.discount_2_amount,
        calc.gst_amount,
        calc.sgst_amount,
        calc.cgst_amount,
        calc.final_amount,
    ];

    if env.set_double_array_region(&out_array, 0, &buf).is_err() {
        return -1;
    }

    0
}

/// JNI function to calculate bill summary from flattened items array:
/// [amount, disc1_amt, disc2_amt, gst_amt, sgst_amt, cgst_amt] for each item.
/// Returns summary in out_summary_array (8 doubles):
/// [subtotal, total_amount, total_discount, total_gst, total_sgst, total_cgst, round_off, grand_total]
#[no_mangle]
pub extern "system" fn Java_com_example_macosbusinesssuite_domain_calculation_BillCalculator_calculateBillSummaryFast(
    env: JNIEnv,
    _class: JClass,
    items_array: JDoubleArray,
    items_count: i64,
    round_off_enabled: u8,
    out_summary_array: JDoubleArray,
) -> i32 {
    let count = items_count.max(0) as usize;
    let mut flat_items = vec![0.0f64; count * 6];
    if env.get_double_array_region(&items_array, 0, &mut flat_items).is_err() {
        return -1;
    }

    let mut total_amount = 0.0;
    let mut total_discount = 0.0;
    let mut total_gst = 0.0;
    let mut total_sgst = 0.0;
    let mut total_cgst = 0.0;

    for chunk in flat_items.chunks_exact(6) {
        total_amount += chunk[0];
        total_discount += chunk[1] + chunk[2];
        total_gst += chunk[3];
        total_sgst += chunk[4];
        total_cgst += chunk[5];
    }

    let subtotal_unrounded = total_amount - total_discount + total_gst;
    let grand_total = if round_off_enabled != 0 {
        subtotal_unrounded.round()
    } else {
        crate::types::round2(subtotal_unrounded)
    };
    let round_off = if round_off_enabled != 0 {
        crate::types::round2(grand_total - subtotal_unrounded)
    } else {
        0.0
    };

    let buf: [f64; 8] = [
        crate::types::round2(subtotal_unrounded),
        crate::types::round2(total_amount),
        crate::types::round2(total_discount),
        crate::types::round2(total_gst),
        crate::types::round2(total_sgst),
        crate::types::round2(total_cgst),
        round_off,
        grand_total,
    ];

    if env.set_double_array_region(&out_summary_array, 0, &buf).is_err() {
        return -1;
    }

    0
}
