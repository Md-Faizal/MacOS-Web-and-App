use crate::analytics::aging::{calculate_customer_aging, calculate_receivables_aging, UnpaidBillItem};
use crate::catalog::search::{search_catalog, match_query_against_target, SearchCatalogItem, SearchOptions, SearchResultItem};
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

#[derive(Deserialize)]
#[serde(untagged)]
enum AuditInvoiceNumberingPayload {
    Object { invoice_numbers: Vec<String> },
    List(Vec<String>),
}

#[no_mangle]
pub unsafe extern "C" fn suite_audit_invoice_numbering(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<AuditInvoiceNumberingPayload>(slice) {
        Ok(payload) => {
            let numbers = match payload {
                AuditInvoiceNumberingPayload::Object { invoice_numbers } => invoice_numbers,
                AuditInvoiceNumberingPayload::List(list) => list,
            };
            let res = crate::finance::ledger::sequencing::audit_invoice_numbering(&numbers);
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
struct VerifyLedgerChainRequest {
    entries: Vec<crate::finance::ledger::sequencing::LedgerAuditEntry>,
    #[serde(default)]
    genesis_hash: Option<String>,
}

#[no_mangle]
pub unsafe extern "C" fn suite_verify_ledger_chain(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<VerifyLedgerChainRequest>(slice) {
        Ok(req) => {
            let res = crate::finance::ledger::sequencing::verify_ledger_chain(
                &req.entries,
                req.genesis_hash.as_deref(),
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

fn bytes_to_base64(data: &[u8]) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        out.push(CHARSET[(b0 >> 2) as usize] as char);
        out.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(b2 & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[no_mangle]
pub unsafe extern "C" fn suite_render_invoice_pdf(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<crate::documents::pdf::InvoiceRenderData>(slice) {
        Ok(data) => {
            let pdf_bytes = crate::documents::pdf::render_invoice_pdf(&data);
            let b64 = bytes_to_base64(&pdf_bytes);
            #[derive(Serialize)]
            struct PdfResp {
                success: bool,
                pdf_base64: String,
                byte_count: usize,
            }
            package_response(&PdfResp {
                success: true,
                pdf_base64: b64,
                byte_count: pdf_bytes.len(),
            })
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

#[no_mangle]
pub unsafe extern "C" fn suite_inspect_image(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    let meta = crate::storage::dimensions::inspect_image_metadata(slice);
    package_response(&meta)
}

#[no_mangle]
pub unsafe extern "C" fn suite_scan_wallpaper(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    let res = crate::storage::wallpaper::scan_wallpaper_asset(slice);
    package_response(&res)
}

#[derive(Deserialize)]
struct FitDimensionsRequest {
    orig_w: u32,
    orig_h: u32,
    max_w: u32,
    max_h: u32,
    #[serde(default = "default_cover")]
    mode: String,
}

fn default_cover() -> String {
    "cover".to_string()
}

#[no_mangle]
pub unsafe extern "C" fn suite_calculate_fit_dimensions(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<FitDimensionsRequest>(slice) {
        Ok(req) => {
            let mode = if req.mode.to_lowercase() == "contain" {
                crate::storage::wallpaper::FitMode::Contain
            } else {
                crate::storage::wallpaper::FitMode::Cover
            };
            let res = crate::storage::wallpaper::calculate_fit_dimensions(
                req.orig_w,
                req.orig_h,
                req.max_w,
                req.max_h,
                mode,
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
struct SearchCatalogRequest {
    query: String,
    catalog: Vec<SearchCatalogItem>,
    #[serde(default)]
    options: Option<SearchOptions>,
}

#[derive(Serialize)]
struct SearchCatalogResponse {
    success: bool,
    query: String,
    total_matches: usize,
    results: Vec<SearchResultItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[no_mangle]
pub unsafe extern "C" fn suite_search_catalog(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<SearchCatalogRequest>(slice) {
        Ok(req) => {
            let options = req.options.unwrap_or_default();
            let matches = search_catalog(&req.query, &req.catalog, &options);
            let resp = SearchCatalogResponse {
                success: true,
                query: req.query,
                total_matches: matches.len(),
                results: matches,
                error: None,
            };
            package_response(&resp)
        }
        Err(e) => {
            let resp = SearchCatalogResponse {
                success: false,
                query: String::new(),
                total_matches: 0,
                results: Vec::new(),
                error: Some(e.to_string()),
            };
            package_response(&resp)
        }
    }
}

#[derive(Deserialize)]
struct FuzzyScoreRequest {
    query: String,
    target: String,
}

#[derive(Serialize)]
struct FuzzyScoreResponse {
    score: f64,
    is_exact: bool,
}

#[no_mangle]
pub unsafe extern "C" fn suite_fuzzy_match_score(ptr: *const u8, len: usize) -> *mut u8 {
    let slice = std::slice::from_raw_parts(ptr, len);
    match serde_json::from_slice::<FuzzyScoreRequest>(slice) {
        Ok(req) => {
            let (score, is_exact) = match_query_against_target(&req.query, &req.target);
            package_response(&FuzzyScoreResponse { score, is_exact })
        }
        Err(_) => {
            package_response(&FuzzyScoreResponse {
                score: 0.0,
                is_exact: false,
            })
        }
    }
}




