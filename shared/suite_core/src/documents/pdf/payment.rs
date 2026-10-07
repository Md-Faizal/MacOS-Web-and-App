use super::writer::{PdfCanvas, PdfColor, PdfFont};
use crate::documents::words::amount_in_indian_words;
use qrcodegen::{QrCode, QrCodeEcc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VoucherType {
    PaymentReceipt,
    CreditNote,
    OpeningBalance,
}

impl Default for VoucherType {
    fn default() -> Self {
        VoucherType::PaymentReceipt
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DueBillItem {
    pub invoice_no: String,
    #[serde(default)]
    pub date: String,
    pub amount: f64,
    pub due_amount: f64,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub days_overdue: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentVoucherRenderData {
    #[serde(default)]
    pub voucher_type: VoucherType,
    pub reference_number: String,
    pub payment_date: String,

    // Customer & Tax Identifiers
    pub customer_name: String,
    #[serde(default)]
    pub customer_gstin: String,
    #[serde(default)]
    pub customer_licence_no: String,
    #[serde(default)]
    pub customer_pan: String,
    #[serde(default)]
    pub customer_phone: String,
    #[serde(default)]
    pub customer_address: String,

    // Monetary
    pub amount: f64,
    #[serde(default = "default_payment_method")]
    pub payment_method: String,

    // Allocation & Ledger Snapshot
    #[serde(default)]
    pub linked_invoice_no: Option<String>,
    #[serde(default)]
    pub linked_invoice_amount: Option<f64>,
    #[serde(default)]
    pub current_outstanding_due: Option<f64>,
    #[serde(default)]
    pub account_status: Option<String>,
    #[serde(default)]
    pub aging_days: Option<i64>,
    #[serde(default)]
    pub due_percentage: Option<f64>,
    #[serde(default)]
    pub settlement_percentage: Option<f64>,
    #[serde(default)]
    pub total_billed_amount: Option<f64>,
    #[serde(default)]
    pub total_settled_amount: Option<f64>,
    #[serde(default)]
    pub overdue_since_date: Option<String>,

    // Pending Dues & Bills Breakdown
    #[serde(default)]
    pub export_mode: bool,
    #[serde(default)]
    pub due_bills: Vec<DueBillItem>,

    // Operational Notes
    #[serde(default)]
    pub remarks: Option<String>,

    // Verification QR
    #[serde(default)]
    pub customer_ledger_token: Option<String>,
    #[serde(default)]
    pub customer_id: Option<i64>,
    #[serde(default)]
    pub app_settings: HashMap<String, String>,
}

fn default_payment_method() -> String {
    "Cash".to_string()
}

fn format_date(date_str: &str) -> String {
    let s = date_str.trim();
    if s.is_empty() {
        return String::new();
    }
    let date_part = if s.len() >= 10 { &s[..10] } else { s };
    let parts: Vec<&str> = date_part.split('-').collect();
    if parts.len() == 3 && parts[0].len() == 4 {
        format!("{}-{}-{}", parts[2], parts[1], parts[0])
    } else {
        date_part.to_string()
    }
}

fn format_money(value: f64) -> String {
    let formatted = format!("{:.2}", value.abs());
    let (whole, fraction) = formatted.split_once('.').unwrap_or((&formatted, "00"));
    let mut grouped = String::with_capacity(whole.len() + whole.len() / 3);
    for (index, digit) in whole.chars().enumerate() {
        if index > 0 && (whole.len() - index) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(digit);
    }
    format!(
        "{}{grouped}.{}",
        if value < 0.0 { "-" } else { "" },
        fraction
    )
}

fn draw_qr(canvas: &mut PdfCanvas, content: &str, x: f64, y: f64, side: f64) -> Result<(), String> {
    let code = QrCode::encode_text(content, QrCodeEcc::Medium)
        .map_err(|error| format!("Could not encode QR code: {error}"))?;
    let size = code.size();
    let quiet_modules = 4.0;
    let module = side / (size as f64 + quiet_modules * 2.0);
    canvas.set_fill_color(PdfColor::BLACK);
    for row in 0..size {
        for column in 0..size {
            if code.get_module(column, row) {
                let module_x = x + (column as f64 + quiet_modules) * module;
                let module_y = y + (size as f64 - row as f64 - 1.0 + quiet_modules) * module;
                canvas.rect(
                    module_x,
                    module_y,
                    module + 0.02,
                    module + 0.02,
                    false,
                    true,
                );
            }
        }
    }
    Ok(())
}

fn truncate_text(text: &str, max_len: usize) -> String {
    if text.chars().count() <= max_len {
        text.to_string()
    } else {
        let mut truncated: String = text.chars().take(max_len.saturating_sub(3)).collect();
        truncated.push_str("...");
        truncated
    }
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn make_payment_uri(data: &PaymentVoucherRenderData, due_amt: f64) -> String {
    let settings = &data.app_settings;
    let mut uri = settings
        .get("payment_upi_id")
        .cloned()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "7749089400@hdfc".to_string());
    let comp_name = settings
        .get("company_name")
        .map(String::as_str)
        .unwrap_or("Utkal Chemical Aushadhalaya");
    if !uri.starts_with("upi://") {
        uri = format!(
            "upi://pay?pa={}&pn={}",
            percent_encode(&uri),
            percent_encode(comp_name)
        );
    }
    if !uri.contains("?cu=") && !uri.contains("&cu=") {
        uri.push_str("&cu=INR");
    }
    if due_amt > 0.01 && !uri.contains("?am=") && !uri.contains("&am=") {
        uri.push_str(&format!("&am={:.2}", due_amt));
    }
    if !uri.contains("?tn=") && !uri.contains("&tn=") {
        let note = format!("Dues Settl: Ref {}", data.reference_number);
        let note: String = note.chars().take(50).collect();
        uri.push_str("&tn=");
        uri.push_str(&percent_encode(&note));
    }
    uri
}

pub fn render_payment_voucher_pdf(data: &PaymentVoucherRenderData) -> Result<Vec<u8>, String> {
    let mut canvas = PdfCanvas::new_a4_portrait();
    let page_width = 595.28;
    let page_height = 841.89;

    let left_margin = 42.0;
    let right_margin = 42.0;
    let content_width = page_width - left_margin - right_margin;

    // 1. TOP BRAND HEADER
    let brand_top_y = page_height - 38.0;

    let company_name = data
        .app_settings
        .get("company_name")
        .map(String::as_str)
        .unwrap_or("UTKAL CHEMICAL AUSHADHALAYA");
    let comp_fact_add = data
        .app_settings
        .get("company_address_factory")
        .map(String::as_str)
        .unwrap_or("Binaba Marg, Aska, Ganjam, Odisha - 761110");
    let comp_office_add = data
        .app_settings
        .get("company_address_office")
        .map(String::as_str)
        .unwrap_or("D1, Basera Complex, Dumduma, BBSR - 751019");
    let comp_phone = data
        .app_settings
        .get("company_phone")
        .map(String::as_str)
        .unwrap_or("06822273304 / 943933330");
    let comp_gstin = data
        .app_settings
        .get("company_gstin")
        .map(String::as_str)
        .unwrap_or("21AIDPF4446J1ZL");
    let comp_pan = data
        .app_settings
        .get("company_pan")
        .map(String::as_str)
        .unwrap_or("AIDPF4446J");

    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    canvas.draw_string(
        PdfFont::HelveticaBold,
        14.0,
        left_margin,
        brand_top_y,
        company_name,
    );

    canvas.set_fill_color(PdfColor::hex("#475569"));
    canvas.draw_string(
        PdfFont::Helvetica,
        7.5,
        left_margin,
        brand_top_y - 13.0,
        &format!("Fact Add: {}", comp_fact_add),
    );

    canvas.draw_string(
        PdfFont::Helvetica,
        7.5,
        left_margin,
        brand_top_y - 23.0,
        &format!("Comp Add: {}", comp_office_add),
    );

    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        left_margin,
        brand_top_y - 33.0,
        &format!("Phone: {}  |  GSTIN: {}  |  PAN: {}", comp_phone, comp_gstin, comp_pan),
    );

    // 2. DOCUMENT TYPE BADGE (Top Right Capsule)
    let (badge_title, bg_color, stroke_color, text_color) = match data.voucher_type {
        VoucherType::PaymentReceipt => (
            "PAYMENT RECEIPT",
            PdfColor::hex("#ecfdf5"),
            PdfColor::hex("#a7f3d0"),
            PdfColor::hex("#065f46"),
        ),
        VoucherType::CreditNote => (
            "CREDIT NOTE",
            PdfColor::hex("#eef2ff"),
            PdfColor::hex("#c7d2fe"),
            PdfColor::hex("#3730a3"),
        ),
        VoucherType::OpeningBalance => (
            "OPENING BALANCE",
            PdfColor::hex("#fffbeb"),
            PdfColor::hex("#fde68a"),
            PdfColor::hex("#92400e"),
        ),
    };

    let badge_width = 138.0;
    let badge_height = 24.0;
    let badge_x = left_margin + content_width - badge_width;
    let badge_y = brand_top_y - 23.0;

    canvas.set_fill_color(bg_color);
    canvas.set_stroke_color(stroke_color);
    canvas.set_line_width(0.75);
    canvas.round_rect(badge_x, badge_y, badge_width, badge_height, 4.0, true, true);

    canvas.set_fill_color(text_color);
    canvas.draw_centered_spaced_string(
        PdfFont::HelveticaBold,
        9.0,
        badge_x + badge_width / 2.0,
        badge_y + 7.5,
        badge_title,
        0.5,
    );

    // Top Hairline Divider
    let divider_y = brand_top_y - 44.0;
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.75);
    canvas.line(left_margin, divider_y, left_margin + content_width, divider_y);

    // 3. HERO AMOUNT CARD
    let hero_card_y = divider_y - 88.0;
    let hero_card_h = 78.0;

    canvas.set_fill_color(PdfColor::hex("#f8fafc"));
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.75);
    canvas.round_rect(left_margin, hero_card_y, content_width, hero_card_h, 6.0, true, true);

    let amount_label = match data.voucher_type {
        VoucherType::PaymentReceipt => "AMOUNT RECEIVED",
        VoucherType::CreditNote => "CREDIT AMOUNT",
        VoucherType::OpeningBalance => "OPENING BALANCE AMOUNT",
    };

    canvas.set_fill_color(PdfColor::hex("#64748b"));
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        7.5,
        left_margin + 16.0,
        hero_card_y + hero_card_h - 18.0,
        amount_label,
        0.5,
    );

    // Big Monetary Figure
    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    let money_str = format!("Rs. {}", format_money(data.amount));
    canvas.draw_string(
        PdfFont::HelveticaBold,
        21.0,
        left_margin + 16.0,
        hero_card_y + hero_card_h - 43.0,
        &money_str,
    );

    // Words
    canvas.set_fill_color(PdfColor::hex("#334155"));
    let words = amount_in_indian_words(data.amount);
    let words_str = format!("{} Only", words.trim_end_matches(" Only"));
    canvas.draw_string(
        PdfFont::Helvetica,
        8.5,
        left_margin + 16.0,
        hero_card_y + 13.0,
        &truncate_text(&words_str, 85),
    );

    // Hero Card Right: Status Capsule
    let (status_text, s_bg, s_fg) = match data.voucher_type {
        VoucherType::OpeningBalance => ("CARRYOVER", PdfColor::hex("#fef3c7"), PdfColor::hex("#92400e")),
        VoucherType::CreditNote => ("CREDIT RECORDED", PdfColor::hex("#e0e7ff"), PdfColor::hex("#3730a3")),
        VoucherType::PaymentReceipt => ("COMPLETED", PdfColor::hex("#d1fae5"), PdfColor::hex("#065f46")),
    };
    let s_pill_w = 96.0;
    let s_pill_h = 20.0;
    let s_pill_x = left_margin + content_width - s_pill_w - 16.0;
    let s_pill_y = hero_card_y + (hero_card_h - s_pill_h) / 2.0;

    canvas.set_fill_color(s_bg);
    canvas.round_rect(s_pill_x, s_pill_y, s_pill_w, s_pill_h, 4.0, false, true);
    canvas.set_fill_color(s_fg);
    canvas.draw_centered_spaced_string(
        PdfFont::HelveticaBold,
        7.5,
        s_pill_x + s_pill_w / 2.0,
        s_pill_y + 6.0,
        status_text,
        0.5,
    );

    // 4. TWO-COLUMN DATA GRID (Customer Information & Transaction Metrics)
    let card_gap = 14.0;
    let col_w = (content_width - card_gap) / 2.0;
    let grid_h = 196.0;
    let grid_y = hero_card_y - 14.0 - grid_h;

    // Left Card: Customer Details
    let left_card_x = left_margin;
    canvas.set_fill_color(PdfColor::WHITE);
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.75);
    canvas.round_rect(left_card_x, grid_y, col_w, grid_h, 6.0, true, true);

    // Left Header Strip
    canvas.set_fill_color(PdfColor::hex("#f8fafc"));
    canvas.round_rect(left_card_x, grid_y + grid_h - 26.0, col_w, 26.0, 6.0, false, true);
    canvas.rect(left_card_x, grid_y + grid_h - 26.0, col_w, 8.0, false, true);
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.line(left_card_x, grid_y + grid_h - 26.0, left_card_x + col_w, grid_y + grid_h - 26.0);

    canvas.set_fill_color(PdfColor::hex("#475569"));
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        8.0,
        left_card_x + 12.0,
        grid_y + grid_h - 17.0,
        "CUSTOMER INFORMATION",
        0.5,
    );

    // Left Card Content Rows
    let mut row_y = grid_y + grid_h - 44.0;
    let row_spacing = 24.0;

    let draw_key_value_colored = |canvas: &mut PdfCanvas, x: f64, y: f64, key: &str, value: &str, is_bold: bool, val_color: Option<PdfColor>| {
        canvas.set_fill_color(PdfColor::hex("#64748b"));
        canvas.draw_string(PdfFont::HelveticaBold, 7.0, x, y, key);
        canvas.set_fill_color(val_color.unwrap_or_else(|| PdfColor::hex("#0f172a")));
        let font = if is_bold { PdfFont::HelveticaBold } else { PdfFont::Helvetica };
        let char_len = value.chars().count();
        let (font_sz, offset_x) = if char_len > 40 {
            (6.5, 66.0)
        } else if char_len > 28 {
            (7.5, 68.0)
        } else {
            (8.5, 72.0)
        };
        let safe_val = if char_len > 55 {
            truncate_text(value, 55)
        } else {
            value.to_string()
        };
        canvas.draw_string(font, font_sz, x + offset_x, y, &safe_val);
    };

    let draw_key_value = |canvas: &mut PdfCanvas, x: f64, y: f64, key: &str, value: &str, is_bold: bool| {
        draw_key_value_colored(canvas, x, y, key, value, is_bold, None);
    };

    draw_key_value(
        &mut canvas,
        left_card_x + 12.0,
        row_y,
        "PARTY NAME",
        &truncate_text(&data.customer_name, 35),
        true,
    );

    row_y -= row_spacing;
    let gstin_val = if !data.customer_gstin.trim().is_empty() {
        data.customer_gstin.trim()
    } else {
        "Unregistered"
    };
    draw_key_value(&mut canvas, left_card_x + 12.0, row_y, "GSTIN", gstin_val, false);

    row_y -= row_spacing;
    let dl_val = if !data.customer_licence_no.trim().is_empty() {
        data.customer_licence_no.trim()
    } else {
        "N/A"
    };
    draw_key_value(&mut canvas, left_card_x + 12.0, row_y, "D.L. NUMBER", &truncate_text(dl_val, 32), false);

    row_y -= row_spacing;
    let phone_val = if !data.customer_phone.trim().is_empty() {
        data.customer_phone.trim()
    } else {
        "N/A"
    };
    draw_key_value(&mut canvas, left_card_x + 12.0, row_y, "CONTACT", phone_val, false);

    row_y -= row_spacing;
    let addr_val = if !data.customer_address.trim().is_empty() {
        data.customer_address.trim()
    } else {
        "Not Specified"
    };
    draw_key_value(
        &mut canvas,
        left_card_x + 12.0,
        row_y,
        "ADDRESS",
        &truncate_text(addr_val, 35),
        false,
    );

    // Right Card: Transaction Metrics
    let right_card_x = left_margin + col_w + card_gap;
    canvas.set_fill_color(PdfColor::WHITE);
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.75);
    canvas.round_rect(right_card_x, grid_y, col_w, grid_h, 6.0, true, true);

    // Right Header Strip
    canvas.set_fill_color(PdfColor::hex("#f8fafc"));
    canvas.round_rect(right_card_x, grid_y + grid_h - 26.0, col_w, 26.0, 6.0, false, true);
    canvas.rect(right_card_x, grid_y + grid_h - 26.0, col_w, 8.0, false, true);
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.line(right_card_x, grid_y + grid_h - 26.0, right_card_x + col_w, grid_y + grid_h - 26.0);

    canvas.set_fill_color(PdfColor::hex("#475569"));
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        8.0,
        right_card_x + 12.0,
        grid_y + grid_h - 17.0,
        "TRANSACTION METRICS",
        0.5,
    );

    // Right Card Content Rows
    let mut right_row_y = grid_y + grid_h - 44.0;

    draw_key_value(
        &mut canvas,
        right_card_x + 12.0,
        right_row_y,
        "VOUCHER REF",
        &data.reference_number,
        true,
    );

    right_row_y -= row_spacing;
    let formatted_date = format_date(&data.payment_date);
    draw_key_value(&mut canvas, right_card_x + 12.0, right_row_y, "DATE", &formatted_date, false);

    right_row_y -= row_spacing;
    draw_key_value(
        &mut canvas,
        right_card_x + 12.0,
        right_row_y,
        "PAYMENT MODE",
        &data.payment_method.to_ascii_uppercase(),
        false,
    );

    right_row_y -= row_spacing;
    let linked_bill_val = match &data.linked_invoice_no {
        Some(inv) if !inv.trim().is_empty() => {
            let inv_clean = inv.trim();
            if let Some(amt) = data.linked_invoice_amount {
                if inv_clean.to_ascii_uppercase().starts_with("BILL") {
                    format!("{inv_clean} (Rs. {})", format_money(amt))
                } else {
                    format!("Bill #{inv_clean} (Rs. {})", format_money(amt))
                }
            } else {
                if inv_clean.to_ascii_uppercase().starts_with("BILL") {
                    inv_clean.to_string()
                } else {
                    format!("Bill #{inv_clean}")
                }
            }
        }
        _ => "General Account Credit".to_string(),
    };
    draw_key_value(
        &mut canvas,
        right_card_x + 12.0,
        right_row_y,
        "ALLOCATION",
        &linked_bill_val,
        false,
    );

    let due_amt = data.current_outstanding_due.unwrap_or(0.0);
    let aging = data.aging_days.unwrap_or(0);

    // Aging severity color and actual date value (replaces arbitrary date range)
    let (due_color, aging_status_text) = if due_amt <= 0.001 {
        (PdfColor::hex("#10b981"), "SETTLED".to_string()) // Emerald Green
    } else {
        let color = if aging <= 30 {
            PdfColor::hex("#2563eb") // Indigo / Blue
        } else if aging <= 60 {
            PdfColor::hex("#d97706") // Amber Warning
        } else {
            PdfColor::hex("#dc2626") // Crimson Alert
        };

        // Determine actual date value for aging
        let date_val = data
            .overdue_since_date
            .as_deref()
            .or_else(|| data.due_bills.first().map(|b| b.date.as_str()))
            .filter(|d| !d.trim().is_empty());

        let text = match date_val {
            Some(d) => format!("SINCE {}", format_date(d)),
            None => {
                if aging == 0 {
                    "CURRENT".to_string()
                } else {
                    format!("{aging} DAYS OVERDUE")
                }
            }
        };
        (color, text)
    };

    right_row_y -= row_spacing;
    let (due_val, due_bold) = match data.current_outstanding_due {
        Some(due) if due > 0.001 => {
            let status_tag = data.account_status.as_deref().unwrap_or("DUE");
            (format!("Rs. {} ({} • {})", format_money(due), status_tag, aging_status_text), true)
        }
        Some(due) if due < -0.001 => {
            (format!("Rs. {} (ADVANCE)", format_money(due)), true)
        }
        _ => ("Rs. 0.00 (SETTLED)".to_string(), false),
    };
    draw_key_value_colored(
        &mut canvas,
        right_card_x + 12.0,
        right_row_y,
        "BALANCE DUE",
        &due_val,
        due_bold,
        Some(due_color),
    );

    // Amount Settlement in Progress Bar: show amounts (e.g. 990 out of 1000) instead of %
    let total_billed_amt = data.total_billed_amount.unwrap_or_else(|| {
        if let Some(alloc_amt) = data.linked_invoice_amount {
            alloc_amt
        } else if due_amt > 0.001 {
            due_amt + data.amount
        } else {
            data.amount
        }
    });

    let total_settled_amt = data.total_settled_amount.unwrap_or_else(|| {
        if due_amt <= 0.001 {
            total_billed_amt
        } else if total_billed_amt >= due_amt {
            total_billed_amt - due_amt
        } else if let Some(sp) = data.settlement_percentage {
            total_billed_amt * (sp / 100.0)
        } else {
            data.amount
        }
    });

    let fill_ratio = if total_billed_amt > 0.001 {
        (total_settled_amt / total_billed_amt).clamp(0.0, 1.0)
    } else if due_amt <= 0.001 {
        1.0
    } else {
        0.0
    };

    let (bar_color, track_color) = if fill_ratio >= 0.999 || due_amt <= 0.001 {
        (PdfColor::hex("#10b981"), PdfColor::hex("#ecfdf5")) // Emerald
    } else if aging <= 30 {
        (PdfColor::hex("#2563eb"), PdfColor::hex("#eff6ff")) // Indigo
    } else if aging <= 60 {
        (PdfColor::hex("#f59e0b"), PdfColor::hex("#fffbeb")) // Amber
    } else {
        (PdfColor::hex("#ef4444"), PdfColor::hex("#fef2f2")) // Crimson
    };

    let bar_box_y = right_row_y - 25.0;
    let bar_width = col_w - 24.0;
    let bar_height = 6.0;

    // Settlement label with active cycle gamification amounts
    let settlement_label = if due_amt <= 0.001 {
        format!(
            "CURRENT CYCLE: 100% CLEARED (Rs. {} / Rs. {})",
            format_money(total_settled_amt),
            format_money(total_billed_amt)
        )
    } else {
        format!(
            "ACTIVE DUES SETTLEMENT: Rs. {} OF Rs. {} (Rs. {} REMAINING)",
            format_money(total_settled_amt),
            format_money(total_billed_amt),
            format_money(due_amt)
        )
    };

    canvas.set_fill_color(bar_color);
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        6.5,
        right_card_x + 12.0,
        bar_box_y + 10.0,
        &settlement_label,
        0.3,
    );

    // Track background
    canvas.set_fill_color(track_color);
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.5);
    canvas.round_rect(right_card_x + 12.0, bar_box_y, bar_width, bar_height, 3.0, true, true);

    // Active fill
    let active_w = if fill_ratio > 0.0 { (bar_width * fill_ratio).max(4.0) } else { 0.0 };
    if active_w > 0.0 {
        canvas.set_fill_color(bar_color);
        canvas.round_rect(right_card_x + 12.0, bar_box_y, active_w, bar_height, 3.0, false, true);
    }

    let mut current_y = grid_y - 14.0;

    // 5. REMARKS / OPERATOR NOTES BLOCK (Clean, only when non-empty)
    if let Some(remarks) = &data.remarks {
        let remarks_clean = remarks.trim();
        if !remarks_clean.is_empty() {
            let remarks_card_h = 44.0;
            let remarks_card_y = current_y - remarks_card_h;

            canvas.set_fill_color(PdfColor::hex("#f8fafc"));
            canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
            canvas.set_line_width(0.75);
            canvas.round_rect(left_margin, remarks_card_y, content_width, remarks_card_h, 4.0, true, true);

            // Left accent bar
            canvas.set_fill_color(PdfColor::hex("#3b82f6"));
            canvas.round_rect(left_margin, remarks_card_y, 3.5, remarks_card_h, 1.5, false, true);

            canvas.set_fill_color(PdfColor::hex("#64748b"));
            canvas.draw_spaced_string(
                PdfFont::HelveticaBold,
                7.5,
                left_margin + 12.0,
                remarks_card_y + remarks_card_h - 15.0,
                "OPERATIONAL REMARKS",
                0.5,
            );

            canvas.set_fill_color(PdfColor::hex("#0f172a"));
            canvas.draw_string(
                PdfFont::Helvetica,
                8.5,
                left_margin + 12.0,
                remarks_card_y + 12.0,
                &truncate_text(remarks_clean, 95),
            );

            current_y = remarks_card_y - 14.0;
        }
    }

    // 6. ONLINE LEDGER STATEMENT & QUICK PAY UPI QR (Zero Fluff, purely functional)
    let outstanding_due = data.current_outstanding_due.unwrap_or(0.0);
    let has_dues = outstanding_due > 0.01 || !data.due_bills.is_empty();

    let portal_url = data
        .app_settings
        .get("portal_base_url")
        .cloned()
        .unwrap_or_else(|| "https://mac.faizal.uk".to_string());

    let qr_link = if let Some(token) = &data.customer_ledger_token {
        if !token.is_empty() {
            Some(format!("{}/ledger/{}", portal_url.trim_end_matches('/'), token))
        } else {
            None
        }
    } else if let Some(cust_id) = data.customer_id {
        Some(format!("{}/customer-ledger.html?id={cust_id}", portal_url.trim_end_matches('/')))
    } else {
        None
    };

    if has_dues {
        // A. PENDING INVOICES & OUTSTANDING DUES CARD
        let bills_to_show = if data.due_bills.is_empty() {
            1
        } else {
            data.due_bills.len().min(3)
        };
        let row_h = 14.0;
        let bills_card_h = 22.0 + 15.0 + (bills_to_show as f64 * row_h) + 6.0;
        let bills_card_y = current_y - bills_card_h;

        // Card frame
        canvas.set_fill_color(PdfColor::WHITE);
        canvas.set_stroke_color(PdfColor::hex("#cbd5e1"));
        canvas.set_line_width(0.75);
        canvas.round_rect(left_margin, bills_card_y, content_width, bills_card_h, 4.0, true, true);

        // Amber left indicator
        canvas.set_fill_color(PdfColor::hex("#f59e0b"));
        canvas.round_rect(left_margin, bills_card_y, 3.5, bills_card_h, 1.5, false, true);

        // Header Strip (amber tint)
        canvas.set_fill_color(PdfColor::hex("#fffbeb"));
        canvas.round_rect(left_margin, bills_card_y + bills_card_h - 22.0, content_width, 22.0, 4.0, false, true);
        canvas.rect(left_margin, bills_card_y + bills_card_h - 22.0, content_width, 6.0, false, true);
        canvas.set_stroke_color(PdfColor::hex("#fde68a"));
        canvas.line(left_margin, bills_card_y + bills_card_h - 22.0, left_margin + content_width, bills_card_y + bills_card_h - 22.0);

        canvas.set_fill_color(PdfColor::hex("#92400e"));
        canvas.draw_spaced_string(
            PdfFont::HelveticaBold,
            7.5,
            left_margin + 12.0,
            bills_card_y + bills_card_h - 14.5,
            "PENDING INVOICES & OUTSTANDING DUES BREAKDOWN",
            0.4,
        );

        let due_summary_tag = format!("TOTAL DUE: Rs. {}", format_money(outstanding_due));
        canvas.draw_right_string(
            PdfFont::HelveticaBold,
            7.5,
            left_margin + content_width - 12.0,
            bills_card_y + bills_card_h - 14.5,
            &due_summary_tag,
        );

        // Column Headers (including AGING with days passed)
        let col_y = bills_card_y + bills_card_h - 33.0;
        canvas.set_fill_color(PdfColor::hex("#64748b"));
        canvas.draw_string(PdfFont::HelveticaBold, 6.5, left_margin + 12.0, col_y, "INVOICE / BILL #");
        canvas.draw_string(PdfFont::HelveticaBold, 6.5, left_margin + 125.0, col_y, "DATE");
        canvas.draw_string(PdfFont::HelveticaBold, 6.5, left_margin + 195.0, col_y, "AGING");
        canvas.draw_string(PdfFont::HelveticaBold, 6.5, left_margin + 265.0, col_y, "BILL AMOUNT");
        canvas.draw_string(PdfFont::HelveticaBold, 6.5, left_margin + 355.0, col_y, "BALANCE DUE");
        canvas.draw_string(PdfFont::HelveticaBold, 6.5, left_margin + 440.0, col_y, "STATUS");

        // Subtle divider under col headers
        canvas.set_stroke_color(PdfColor::hex("#f1f5f9"));
        canvas.line(left_margin + 10.0, col_y - 3.0, left_margin + content_width - 10.0, col_y - 3.0);

        let mut item_y = col_y - 13.0;
        if data.due_bills.is_empty() {
            canvas.set_fill_color(PdfColor::hex("#0f172a"));
            canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin + 12.0, item_y, "Opening Balance / Ledger Carryover");
            canvas.set_fill_color(PdfColor::hex("#64748b"));
            canvas.draw_string(PdfFont::Helvetica, 7.0, left_margin + 125.0, item_y, "-");
            canvas.draw_string(PdfFont::Helvetica, 7.0, left_margin + 195.0, item_y, "-");
            canvas.draw_string(PdfFont::Helvetica, 7.0, left_margin + 265.0, item_y, &format!("Rs. {}", format_money(outstanding_due)));
            canvas.set_fill_color(PdfColor::hex("#b45309"));
            canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin + 355.0, item_y, &format!("Rs. {}", format_money(outstanding_due)));
            canvas.draw_string(PdfFont::HelveticaBold, 7.0, left_margin + 440.0, item_y, "DUE");
        } else {
            for bill in data.due_bills.iter().take(3) {
                canvas.set_fill_color(PdfColor::hex("#0f172a"));
                canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin + 12.0, item_y, &truncate_text(&bill.invoice_no, 18));
                canvas.set_fill_color(PdfColor::hex("#64748b"));
                let d_str = format_date(&bill.date);
                canvas.draw_string(PdfFont::Helvetica, 7.0, left_margin + 125.0, item_y, if d_str.is_empty() { "-" } else { &d_str });

                // Days passed since bill date with aging severity color
                let days_passed = bill.days_overdue.unwrap_or(0);
                let aging_color = if days_passed <= 30 {
                    PdfColor::hex("#2563eb") // Indigo / Blue (0-30 days)
                } else if days_passed <= 60 {
                    PdfColor::hex("#d97706") // Amber Warning (31-60 days)
                } else {
                    PdfColor::hex("#dc2626") // Crimson Alert (>60 days)
                };
                let aging_str = format!("{days_passed} DAYS");
                canvas.set_fill_color(aging_color);
                canvas.draw_string(PdfFont::HelveticaBold, 7.0, left_margin + 195.0, item_y, &aging_str);

                canvas.set_fill_color(PdfColor::hex("#64748b"));
                canvas.draw_string(PdfFont::Helvetica, 7.0, left_margin + 265.0, item_y, &format!("Rs. {}", format_money(bill.amount)));
                canvas.set_fill_color(PdfColor::hex("#b45309"));
                canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin + 355.0, item_y, &format!("Rs. {}", format_money(bill.due_amount)));
                let st = bill.status.as_deref().unwrap_or("PENDING");
                let st_color = if st.eq_ignore_ascii_case("PARTIAL") { PdfColor::hex("#2563eb") } else { PdfColor::hex("#d97706") };
                canvas.set_fill_color(st_color);
                canvas.draw_string(PdfFont::HelveticaBold, 7.0, left_margin + 440.0, item_y, st);

                item_y -= row_h;
            }
        }

        current_y = bills_card_y - 10.0;

        // B. DUAL ACTION ROW: LEDGER PORTAL (LEFT) + QUICK UPI PAYMENT (RIGHT)
        let dual_card_h = 70.0;
        let dual_card_y = current_y - dual_card_h;
        let col_gap = 10.0;
        let half_w = (content_width - col_gap) / 2.0;

        // B1. LEFT CARD: Customer Ledger Portal
        canvas.set_fill_color(PdfColor::hex("#f8fafc"));
        canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
        canvas.set_line_width(0.75);
        canvas.round_rect(left_margin, dual_card_y, half_w, dual_card_h, 4.0, true, true);

        // Blue accent bar
        canvas.set_fill_color(PdfColor::hex("#3b82f6"));
        canvas.round_rect(left_margin, dual_card_y, 3.0, dual_card_h, 1.5, false, true);

        let qr_sz = 48.0;
        let l_qr_x = left_margin + 9.0;
        let l_qr_y = dual_card_y + (dual_card_h - qr_sz) / 2.0;
        let portal_display_url = qr_link.clone().unwrap_or_else(|| portal_url.clone());
        let _ = draw_qr(&mut canvas, &portal_display_url, l_qr_x, l_qr_y, qr_sz);

        let l_text_x = l_qr_x + qr_sz + 10.0;
        canvas.set_fill_color(PdfColor::hex("#0f172a"));
        canvas.draw_string(PdfFont::HelveticaBold, 8.0, l_text_x, dual_card_y + dual_card_h - 18.0, "ONLINE CUSTOMER LEDGER");
        canvas.set_fill_color(PdfColor::hex("#64748b"));
        canvas.draw_string(PdfFont::Helvetica, 6.5, l_text_x, dual_card_y + dual_card_h - 30.0, "Scan to verify & view complete running");
        canvas.draw_string(PdfFont::Helvetica, 6.5, l_text_x, dual_card_y + dual_card_h - 40.0, "balance statement and payment history.");
        canvas.set_fill_color(PdfColor::hex("#2563eb"));
        let url_chars = portal_display_url.chars().count();
        let url_font_sz = if url_chars > 75 {
            4.4
        } else if url_chars > 60 {
            5.0
        } else if url_chars > 45 {
            5.6
        } else if url_chars > 32 {
            6.2
        } else {
            6.8
        };
        canvas.draw_string(PdfFont::HelveticaBold, url_font_sz, l_text_x, dual_card_y + 12.0, &portal_display_url);

        // B2. RIGHT CARD: Quick Pay via UPI
        let r_card_x = left_margin + half_w + col_gap;
        canvas.set_fill_color(PdfColor::hex("#f8fafc"));
        canvas.set_stroke_color(PdfColor::hex("#cbd5e1"));
        canvas.set_line_width(0.75);
        canvas.round_rect(r_card_x, dual_card_y, half_w, dual_card_h, 4.0, true, true);

        // Emerald accent bar
        canvas.set_fill_color(PdfColor::hex("#10b981"));
        canvas.round_rect(r_card_x, dual_card_y, 3.0, dual_card_h, 1.5, false, true);

        let r_qr_x = r_card_x + 9.0;
        let r_qr_y = dual_card_y + (dual_card_h - qr_sz) / 2.0;
        let pay_uri = make_payment_uri(data, outstanding_due);
        let _ = draw_qr(&mut canvas, &pay_uri, r_qr_x, r_qr_y, qr_sz);

        let r_text_x = r_qr_x + qr_sz + 10.0;
        canvas.set_fill_color(PdfColor::hex("#065f46"));
        canvas.draw_spaced_string(PdfFont::HelveticaBold, 7.5, r_text_x, dual_card_y + dual_card_h - 17.0, "QUICK SETTLEMENT (UPI)", 0.3);
        canvas.set_fill_color(PdfColor::hex("#0f172a"));
        canvas.draw_string(PdfFont::HelveticaBold, 8.5, r_text_x, dual_card_y + dual_card_h - 30.0, &format!("Pay Due: Rs. {}", format_money(outstanding_due)));

        if data.export_mode {
            let btn_w = 92.0;
            let btn_h = 13.0;
            let btn_y = dual_card_y + 10.0;
            canvas.set_fill_color(PdfColor::hex("#0f172a"));
            canvas.round_rect(r_text_x, btn_y, btn_w, btn_h, 3.0, false, true);
            canvas.set_fill_color(PdfColor::WHITE);
            canvas.draw_centered_string(PdfFont::HelveticaBold, 6.5, r_text_x + btn_w / 2.0, btn_y + 3.5, "⚡ PAY VIA UPI APP");
        } else {
            canvas.set_fill_color(PdfColor::hex("#475569"));
            canvas.draw_string(PdfFont::Helvetica, 6.5, r_text_x, dual_card_y + 12.0, "Scan with GPay / PhonePe / Paytm");
        }

        let _ = dual_card_y;
    } else if let Some(url) = qr_link {
        let qr_card_h = 76.0;
        let qr_card_y = current_y - qr_card_h;

        canvas.set_fill_color(PdfColor::hex("#f8fafc"));
        canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
        canvas.set_line_width(0.75);
        canvas.round_rect(left_margin, qr_card_y, content_width, qr_card_h, 6.0, true, true);

        // QR code on the left of the card
        let qr_size = 56.0;
        let qr_x = left_margin + 12.0;
        let qr_y = qr_card_y + (qr_card_h - qr_size) / 2.0;
        draw_qr(&mut canvas, &url, qr_x, qr_y, qr_size)?;

        // Informational labels on the right
        let info_x = qr_x + qr_size + 16.0;
        canvas.set_fill_color(PdfColor::hex("#0f172a"));
        canvas.draw_string(
            PdfFont::HelveticaBold,
            9.0,
            info_x,
            qr_card_y + qr_card_h - 22.0,
            "REAL-TIME CUSTOMER LEDGER PORTAL",
        );

        canvas.set_fill_color(PdfColor::hex("#475569"));
        canvas.draw_string(
            PdfFont::Helvetica,
            7.5,
            info_x,
            qr_card_y + qr_card_h - 37.0,
            "Scan this QR code from any camera to verify this voucher and view the updated balance statement.",
        );

        canvas.set_fill_color(PdfColor::hex("#2563eb"));
        let url_chars = url.chars().count();
        let url_font_sz = if url_chars > 100 {
            5.5
        } else if url_chars > 80 {
            6.5
        } else {
            7.5
        };
        canvas.draw_string(
            PdfFont::HelveticaBold,
            url_font_sz,
            info_x,
            qr_card_y + 16.0,
            &url,
        );
    }

    // 7. SIGNATURES / AUTOGENERATED AUTHENTICATION NOTICE
    let auto_sign = data
        .app_settings
        .get("invoice_auto_sign_disclaimer")
        .map(|v| v == "true" || v == "1" || v == "yes")
        .unwrap_or(false);

    if auto_sign {
        let auth_box_h = 36.0;
        let auth_box_y = 75.0;

        canvas.set_fill_color(PdfColor::hex("#f8fafc"));
        canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
        canvas.set_line_width(0.75);
        canvas.round_rect(left_margin, auth_box_y, content_width, auth_box_h, 4.0, true, true);

        // Green accent left bar
        canvas.set_fill_color(PdfColor::hex("#10b981"));
        canvas.round_rect(left_margin, auth_box_y, 3.5, auth_box_h, 1.5, false, true);

        canvas.set_fill_color(PdfColor::hex("#065f46"));
        canvas.draw_spaced_string(
            PdfFont::HelveticaBold,
            7.5,
            left_margin + 12.0,
            auth_box_y + auth_box_h - 13.0,
            "AUTHENTICATED DIGITAL VOUCHER  •  NO PHYSICAL SIGNATURE REQUIRED",
            0.5,
        );

        canvas.set_fill_color(PdfColor::hex("#64748b"));
        canvas.draw_string(
            PdfFont::Helvetica,
            7.0,
            left_margin + 12.0,
            auth_box_y + 10.0,
            &format!(
                "Computer-generated voucher issued by {} under CGST Rule 46 Proviso & Information Technology Act, 2000.",
                company_name
            ),
        );
    } else {
        let sig_y = 100.0;
        let sig_line_w = 175.0;

        // Left Signature: Receiver / Customer
        canvas.set_stroke_color(PdfColor::hex("#cbd5e1"));
        canvas.set_line_width(0.75);
        canvas.line(left_margin, sig_y, left_margin + sig_line_w, sig_y);

        canvas.set_fill_color(PdfColor::hex("#475569"));
        canvas.draw_string(
            PdfFont::HelveticaBold,
            7.5,
            left_margin,
            sig_y - 12.0,
            "CUSTOMER / RECEIVER SIGNATURE",
        );

        // Right Signature: Company Authority
        let right_sig_x = left_margin + content_width - sig_line_w;
        canvas.set_stroke_color(PdfColor::hex("#cbd5e1"));
        canvas.line(right_sig_x, sig_y, right_sig_x + sig_line_w, sig_y);

        canvas.set_fill_color(PdfColor::hex("#475569"));
        canvas.draw_right_string(
            PdfFont::HelveticaBold,
            7.5,
            right_sig_x + sig_line_w,
            sig_y - 12.0,
            &format!("FOR {}", company_name.to_ascii_uppercase()),
        );

        canvas.set_fill_color(PdfColor::hex("#64748b"));
        canvas.draw_right_string(
            PdfFont::Helvetica,
            7.0,
            right_sig_x + sig_line_w,
            sig_y - 23.0,
            "Authorised Signatory",
        );
    }

    // 8. AUDIT FOOTER & APPRECIATION NOTE
    let footer_line_y = 48.0;

    // 7b. COURTESY & APPRECIATION NOTE
    let thank_you_text = match data.voucher_type {
        VoucherType::CreditNote => {
            "We value your business. This credit adjustment has been credited to your running account."
        }
        _ if due_amt <= 0.001 => {
            "Thank you for your business! Your account is fully settled and in excellent standing."
        }
        _ => {
            "Thank you for your prompt payment! We look forward to serving you again."
        }
    };
    canvas.set_fill_color(PdfColor::hex("#475569"));
    canvas.draw_centered_spaced_string(
        PdfFont::HelveticaBold,
        7.5,
        page_width / 2.0,
        footer_line_y + 14.0,
        thank_you_text,
        0.2,
    );

    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.5);
    canvas.line(left_margin, footer_line_y, left_margin + content_width, footer_line_y);

    canvas.set_fill_color(PdfColor::hex("#94a3b8"));
    let audit_text = format!(
        "{}  •  AUDIT REF: {}  •  DATE: {}",
        company_name.to_ascii_uppercase(),
        data.reference_number,
        format_date(&data.payment_date)
    );
    canvas.draw_centered_spaced_string(
        PdfFont::Helvetica,
        6.5,
        page_width / 2.0,
        footer_line_y - 12.0,
        &audit_text,
        0.4,
    );

    Ok(canvas.build_pdf())
}

#[cfg(test)]
pub mod tests {
    use super::*;

    #[test]
    fn test_render_payment_receipt_minimal() {
        let data = PaymentVoucherRenderData {
            voucher_type: VoucherType::PaymentReceipt,
            reference_number: "PAY-260014".to_string(),
            payment_date: "2026-10-07".to_string(),
            customer_name: "Maa Tarini Medical Hall".to_string(),
            customer_gstin: "21ABCDE1234F1Z5".to_string(),
            customer_licence_no: "20B/1234, 21B/5678".to_string(),
            customer_pan: "ABCDE1234F".to_string(),
            customer_phone: "+91 9876543210".to_string(),
            customer_address: "Main Road, Bhanjanagar, Ganjam".to_string(),
            amount: 14500.0,
            payment_method: "UPI".to_string(),
            linked_invoice_no: Some("GST-260008".to_string()),
            linked_invoice_amount: Some(14500.0),
            current_outstanding_due: Some(3450.0),
            account_status: Some("DUE".to_string()),
            aging_days: Some(15),
            due_percentage: Some(23.8),
            settlement_percentage: Some(76.2),
            total_billed_amount: None,
            total_settled_amount: None,
            overdue_since_date: None,
            remarks: Some("Part payment towards April invoices.".to_string()),
            customer_ledger_token: Some("token_123456789".to_string()),
            customer_id: Some(12),
            export_mode: false,
            due_bills: Vec::new(),
            app_settings: HashMap::new(),
        };

        let pdf_bytes = render_payment_voucher_pdf(&data).expect("Must render payment PDF");
        assert!(pdf_bytes.starts_with(b"%PDF-1.4"));
        let pdf_str = String::from_utf8_lossy(&pdf_bytes);

        // Verify key elements
        assert!(pdf_str.contains("UTKAL CHEMICAL AUSHADHALAYA"));
        assert!(pdf_str.contains("PAYMENT RECEIPT"));
        assert!(pdf_str.contains("Rs. 14,500.00"));
        assert!(pdf_str.contains("Maa Tarini Medical Hall"));
        assert!(pdf_str.contains("PAY-260014"));
        assert!(pdf_str.contains("21ABCDE1234F1Z5"));

        // Strictly verify MARG attribution is NOT in the PDF
        assert!(!pdf_str.contains("MARG"));
        assert!(!pdf_str.contains("9437026823"));
        assert!(!pdf_str.contains("This represents the opening balance"));
    }

    #[test]
    fn test_render_credit_note_and_opening_balance() {
        let cn_data = PaymentVoucherRenderData {
            voucher_type: VoucherType::CreditNote,
            reference_number: "CREDIT-260003".to_string(),
            payment_date: "2026-10-07".to_string(),
            customer_name: "Binayak Medicine Store".to_string(),
            customer_gstin: String::new(),
            customer_licence_no: String::new(),
            customer_pan: String::new(),
            customer_phone: String::new(),
            customer_address: String::new(),
            amount: 520.0,
            payment_method: "Credit Adjustment".to_string(),
            linked_invoice_no: None,
            linked_invoice_amount: None,
            current_outstanding_due: None,
            account_status: None,
            aging_days: None,
            due_percentage: None,
            settlement_percentage: None,
            total_billed_amount: None,
            total_settled_amount: None,
            overdue_since_date: None,
            export_mode: false,
            due_bills: Vec::new(),
            remarks: None,
            customer_ledger_token: None,
            customer_id: None,
            app_settings: HashMap::new(),
        };

        let cn_bytes = render_payment_voucher_pdf(&cn_data).expect("Must render credit note PDF");
        let cn_str = String::from_utf8_lossy(&cn_bytes);
        assert!(cn_str.contains("CREDIT NOTE"));
        assert!(cn_str.contains("Rs. 520.00"));

        let ob_data = PaymentVoucherRenderData {
            voucher_type: VoucherType::OpeningBalance,
            reference_number: "OPENING-BAL".to_string(),
            payment_date: "2026-04-01".to_string(),
            customer_name: "Jagannath Pharmacy".to_string(),
            customer_gstin: String::new(),
            customer_licence_no: String::new(),
            customer_pan: String::new(),
            customer_phone: String::new(),
            customer_address: String::new(),
            amount: 12000.0,
            payment_method: "Carryover Balance".to_string(),
            linked_invoice_no: None,
            linked_invoice_amount: None,
            current_outstanding_due: None,
            account_status: None,
            aging_days: None,
            due_percentage: None,
            settlement_percentage: None,
            total_billed_amount: None,
            total_settled_amount: None,
            overdue_since_date: None,
            export_mode: false,
            due_bills: Vec::new(),
            remarks: None,
            customer_ledger_token: None,
            customer_id: None,
            app_settings: HashMap::new(),
        };

        let ob_bytes = render_payment_voucher_pdf(&ob_data).expect("Must render opening balance PDF");
        let ob_str = String::from_utf8_lossy(&ob_bytes);
        assert!(ob_str.contains("OPENING BALANCE"));
        assert!(ob_str.contains("Rs. 12,000.00"));
    }

    #[test]
    fn test_payment_dynamic_tax_and_auto_sign() {
        let mut app_settings = HashMap::new();
        app_settings.insert("company_gstin".to_string(), "21AIDPF4446J1ZL".to_string());
        app_settings.insert("company_pan".to_string(), "AIDPF4446J".to_string());
        app_settings.insert("invoice_auto_sign_disclaimer".to_string(), "true".to_string());

        let data = PaymentVoucherRenderData {
            voucher_type: VoucherType::PaymentReceipt,
            reference_number: "PAY-2026-008".to_string(),
            payment_date: "2026-10-07".to_string(),
            customer_name: "MAA TARINI PHARMA".to_string(),
            customer_gstin: "21AABCM1234D1Z5".to_string(),
            customer_licence_no: "DL-8899".to_string(),
            customer_pan: "AABCM1234D".to_string(),
            customer_phone: "9876543210".to_string(),
            customer_address: "MAIN ROAD, BERHAMPUR".to_string(),
            amount: 7500.0,
            payment_method: "UPI".to_string(),
            linked_invoice_no: Some("GST-260012".to_string()),
            linked_invoice_amount: Some(7500.0),
            current_outstanding_due: Some(0.0),
            account_status: Some("SETTLED".to_string()),
            aging_days: Some(0),
            due_percentage: Some(0.0),
            settlement_percentage: Some(100.0),
            total_billed_amount: None,
            total_settled_amount: None,
            overdue_since_date: None,
            export_mode: false,
            due_bills: Vec::new(),
            remarks: Some("Settlement of bill".to_string()),
            customer_ledger_token: None,
            customer_id: Some(15),
            app_settings,
        };

        let bytes = render_payment_voucher_pdf(&data).expect("Must render payment PDF");
        let pdf_str = String::from_utf8_lossy(&bytes);

        // Header dynamic GST and PAN
        assert!(pdf_str.contains("GSTIN: 21AIDPF4446J1ZL  |  PAN: AIDPF4446J"));

        // Autogenerated digital voucher disclaimer
        assert!(pdf_str.contains("AUTHENTICATED DIGITAL VOUCHER  •  NO PHYSICAL SIGNATURE REQUIRED"));
        assert!(pdf_str.contains("CGST Rule 46 Proviso & Information Technology Act, 2000"));
    }

    #[test]
    fn test_payment_untruncated_allocation_and_due_bills_qr() {
        let mut app_settings = HashMap::new();
        app_settings.insert("payment_upi_id".to_string(), "7749089400@hdfc".to_string());
        app_settings.insert("portal_base_url".to_string(), "https://mac.faizal.uk".to_string());

        let due_bills = vec![
            DueBillItem {
                invoice_no: "GST-2026-00042".to_string(),
                date: "2026-09-15".to_string(),
                amount: 4500.0,
                due_amount: 1490.0,
                status: Some("PARTIAL".to_string()),
                days_overdue: Some(22),
            },
            DueBillItem {
                invoice_no: "GST-2026-00055".to_string(),
                date: "2026-09-28".to_string(),
                amount: 3200.0,
                due_amount: 3200.0,
                status: Some("PENDING".to_string()),
                days_overdue: Some(9),
            },
        ];

        let data = PaymentVoucherRenderData {
            voucher_type: VoucherType::PaymentReceipt,
            reference_number: "PAY-2026-0099".to_string(),
            payment_date: "2026-10-07".to_string(),
            customer_name: "SHREE GANESH PHARMACEUTICALS".to_string(),
            customer_gstin: "21ABCDE1234F1Z5".to_string(),
            customer_licence_no: "DL-112233".to_string(),
            customer_pan: "ABCDE1234F".to_string(),
            customer_phone: "9988776655".to_string(),
            customer_address: "STATION ROAD, BERHAMPUR".to_string(),
            amount: 5000.0,
            payment_method: "IMPS / Online Transfer".to_string(),
            // Test long allocation string - must NOT be truncated to 25 chars
            linked_invoice_no: Some("GST-2026-00042".to_string()),
            linked_invoice_amount: Some(4500.0),
            current_outstanding_due: Some(4690.0),
            account_status: Some("DUE".to_string()),
            aging_days: Some(22),
            due_percentage: Some(60.9),
            settlement_percentage: Some(39.1),
            total_billed_amount: Some(10000.0),
            total_settled_amount: Some(5310.0),
            overdue_since_date: Some("2026-09-15".to_string()),
            export_mode: true,
            due_bills,
            remarks: Some("Payment towards pending invoices".to_string()),
            customer_ledger_token: Some("sec_ledger_token_88".to_string()),
            customer_id: Some(42),
            app_settings,
        };

        let bytes = render_payment_voucher_pdf(&data).expect("Must render payment PDF with dues");
        let pdf_str = String::from_utf8_lossy(&bytes);

        // Verification of untruncated allocation
        assert!(pdf_str.contains("Bill #GST-2026-00042 \\(Rs. 4,500.00\\)"));

        // Verification of pending bills table and dues
        assert!(pdf_str.contains("PENDING INVOICES & OUTSTANDING DUES BREAKDOWN"));
        assert!(pdf_str.contains("GST-2026-00042"));
        assert!(pdf_str.contains("GST-2026-00055"));
        assert!(pdf_str.contains("Rs. 1,490.00"));
        assert!(pdf_str.contains("Rs. 3,200.00"));
        assert!(pdf_str.contains("TOTAL DUE: Rs. 4,690.00"));

        // Verification of dual QR (Ledger portal & Quick Pay UPI QR)
        assert!(pdf_str.contains("ONLINE CUSTOMER LEDGER"));
        assert!(pdf_str.contains("QUICK SETTLEMENT \\(UPI\\)"));
        assert!(pdf_str.contains("Pay Due: Rs. 4,690.00"));
        assert!(pdf_str.contains("⚡ PAY VIA UPI APP"));

        // Verification of amount settlement progress bar with active cycle gamification
        assert!(pdf_str.contains("ACTIVE DUES SETTLEMENT: Rs. 5,310.00 OF Rs. 10,000.00 \\(Rs. 4,690.00 REMAINING\\)"));

        // Verification of courteous customer appreciation note
        assert!(pdf_str.contains("Thank you for your prompt payment! We look forward to serving you again."));

        // Verification of untruncated ledger link
        assert!(pdf_str.contains("https://mac.faizal.uk/ledger/sec_ledger_token_88"));

        // Verification of balance due with actual date value
        assert!(pdf_str.contains("Rs. 4,690.00 \\(DUE • SINCE 15-09-2026\\)"));

        // Verification of AGING column in pending invoices table with days passed
        assert!(pdf_str.contains("AGING"));
        assert!(pdf_str.contains("22 DAYS"));
        assert!(pdf_str.contains("9 DAYS"));
    }
}
