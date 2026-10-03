use crate::analytics::aging::{calculate_customer_aging, calculate_receivables_aging, UnpaidBillItem};
use crate::finance::invoicing::bill::calculate_bill;
use crate::finance::invoicing::item::LineItemInput;
use crate::finance::ledger::statement::generate_customer_statement;
use crate::finance::ledger::entry::{BillEntry, PaymentEntry};
use serde::{Deserialize, Serialize};

#[no_mangle]
pub extern "C" fn suite_alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn suite_dealloc(ptr: *mut u8, size: usize) {
    if !ptr.is_null() {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}

/// Helper to serialize any result to a buffer prefixed with 4-byte length
fn package_response<T: Serialize>(val: &T) -> *mut u8 {
    let json = serde_json::to_string(val).unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e));
    let bytes = json.as_bytes();
    let len = bytes.len() as u32;

    let mut buf = Vec::with_capacity(4 + bytes.len());
    buf.extend_from_slice(&len.to_le_bytes());
    buf.extend_from_slice(bytes);

    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[derive(Deserialize)]
struct BillRequest {
    items: Vec<LineItemInput>,
    #[serde(default)]
    previous_due: f64,
    #[serde(default = "default_true")]
    round_off: bool,
}

fn default_true() -> bool {
    true
}

#[no_mangle]
pub unsafe extern "C" fn suite_calculate_bill(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<BillRequest>(slice) {
        Ok(req) => {
            let res = calculate_bill(&req.items, req.previous_due, req.round_off);
            package_response(&res)
        }
        Err(e) => {
            #[derive(Serialize)]
            struct ErrResp {
                success: bool,
                error: String,
            }
            package_response(&ErrResp {
                success: false,
                error: e.to_string(),
            })
        }
    }
}

#[derive(Deserialize)]
struct StatementRequest {
    opening_balance: f64,
    bills: Vec<BillEntry>,
    payments: Vec<PaymentEntry>,
    current_date_days: i64,
}

#[no_mangle]
pub unsafe extern "C" fn suite_calculate_statement(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<StatementRequest>(slice) {
        Ok(req) => {
            let res = generate_customer_statement(
                req.opening_balance,
                &req.bills,
                &req.payments,
                req.current_date_days,
            );
            package_response(&res)
        }
        Err(e) => {
            #[derive(Serialize)]
            struct ErrResp {
                success: bool,
                error: String,
            }
            package_response(&ErrResp {
                success: false,
                error: e.to_string(),
            })
        }
    }
}

#[derive(Deserialize)]
struct AgingRequest {
    items: Vec<UnpaidBillItem>,
    #[serde(default)]
    opening_balance: f64,
    #[serde(default)]
    is_macro: bool,
}

#[no_mangle]
pub unsafe extern "C" fn suite_calculate_aging(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<AgingRequest>(slice) {
        Ok(req) => {
            if req.is_macro {
                let res = calculate_receivables_aging(&req.items);
                package_response(&res)
            } else {
                let res = calculate_customer_aging(&req.items, req.opening_balance);
                package_response(&res)
            }
        }
        Err(e) => {
            #[derive(Serialize)]
            struct ErrResp {
                success: bool,
                error: String,
            }
            package_response(&ErrResp {
                success: false,
                error: e.to_string(),
            })
        }
    }
}

#[derive(Deserialize)]
struct SummaryItemInput {
    #[serde(default)]
    amount: f64,
    #[serde(default)]
    discount_1_amount: f64,
    #[serde(default)]
    discount_2_amount: f64,
    #[serde(default)]
    gst_amount: f64,
    #[serde(default)]
    sgst_amount: f64,
    #[serde(default)]
    cgst_amount: f64,
}

#[derive(Deserialize)]
struct SummaryRequest {
    items: Vec<SummaryItemInput>,
    #[serde(default)]
    previous_due: f64,
    #[serde(default = "default_true")]
    round_off: bool,
}

#[no_mangle]
pub unsafe extern "C" fn suite_calculate_summary(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<SummaryRequest>(slice) {
        Ok(req) => {
            let mut total_amount = 0.0;
            let mut total_discount = 0.0;
            let mut total_gst = 0.0;
            let mut total_sgst = 0.0;
            let mut total_cgst = 0.0;

            for item in &req.items {
                total_amount += item.amount;
                total_discount += item.discount_1_amount + item.discount_2_amount;
                total_gst += item.gst_amount;
                total_sgst += item.sgst_amount;
                total_cgst += item.cgst_amount;
            }

            let subtotal_unrounded = total_amount - total_discount + total_gst;
            let grand_total = if req.round_off {
                subtotal_unrounded.round()
            } else {
                crate::types::round2(subtotal_unrounded)
            };
            let round_off = crate::types::round2(grand_total - subtotal_unrounded);
            let projected_due = crate::types::round2(req.previous_due + grand_total);

            let res = crate::finance::invoicing::bill::BillSummary {
                subtotal: crate::types::round2(subtotal_unrounded),
                total_amount: crate::types::round2(total_amount),
                total_discount: crate::types::round2(total_discount),
                total_gst: crate::types::round2(total_gst),
                total_sgst: crate::types::round2(total_sgst),
                total_cgst: crate::types::round2(total_cgst),
                round_off,
                grand_total,
                previous_due: crate::types::round2(req.previous_due),
                projected_due,
                discountTotal: crate::types::round2(total_discount),
                taxTotal: crate::types::round2(total_gst),
                grandTotal: grand_total,
                roundOff: round_off,
            };
            package_response(&res)
        }
        Err(e) => {
            #[derive(Serialize)]
            struct ErrResp {
                success: bool,
                error: String,
            }
            package_response(&ErrResp {
                success: false,
                error: e.to_string(),
            })
        }
    }
}

#[derive(Deserialize)]
struct DepleteInventoryRequest {
    requested_qty: f64,
    batches: Vec<crate::inventory::depletion::BatchStockItem>,
    #[serde(default)]
    options: crate::inventory::depletion::DepletionOptions,
}

#[no_mangle]
pub unsafe extern "C" fn suite_deplete_inventory(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<DepleteInventoryRequest>(slice) {
        Ok(req) => {
            let res = crate::inventory::depletion::deplete_inventory_batches(
                req.requested_qty,
                &req.batches,
                &req.options,
            );
            package_response(&res)
        }
        Err(e) => {
            #[derive(Serialize)]
            struct ErrResp {
                success: bool,
                error: String,
            }
            package_response(&ErrResp {
                success: false,
                error: e.to_string(),
            })
        }
    }
}

