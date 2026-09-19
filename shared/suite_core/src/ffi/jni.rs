use crate::finance::invoicing::item::{LineItemCalculated, LineItemInput};

/// JNI bridge function for instant modal keystroke calculation in Android.
/// Takes rate, qty, disc1, disc2, gst, gstReverse and returns array of doubles:
/// [amount, disc1_amt, disc2_amt, gst_amt, sgst_amt, cgst_amt, final_amt]
#[no_mangle]
pub unsafe extern "system" fn Java_com_example_macosbusinesssuite_domain_calculation_BillCalculator_calculateLineItemFast(
    _env: *mut std::ffi::c_void,
    _class: *mut std::ffi::c_void,
    rate: f64,
    qty: f64,
    disc1: f64,
    disc2: f64,
    gst: f64,
    gst_reverse: u8,
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
