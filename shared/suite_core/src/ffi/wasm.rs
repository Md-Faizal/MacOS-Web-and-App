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
