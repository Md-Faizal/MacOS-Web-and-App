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

pub fn render_payment_voucher_pdf(data: &PaymentVoucherRenderData) -> Result<Vec<u8>, String> {
    let mut canvas = PdfCanvas::new_a4_portrait();
    let page_width = 595.28;
    let page_height = 841.89;

    let left_margin = 42.0;
    let right_margin = 42.0;
    let content_width = page_width - left_margin - right_margin;

    // 1. TOP BRAND HEADER
    let brand_top_y = page_height - 38.0;

    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    canvas.draw_string(
        PdfFont::HelveticaBold,
        14.0,
        left_margin,
        brand_top_y,
        "UTKAL CHEMICAL AUSHADHALAYA",
    );

    canvas.set_fill_color(PdfColor::hex("#475569"));
    canvas.draw_string(
        PdfFont::Helvetica,
        7.5,
        left_margin,
        brand_top_y - 13.0,
        "Fact Add: Binaba Marg, Aska, Ganjam, Odisha - 761110",
    );

    canvas.draw_string(
        PdfFont::Helvetica,
        7.5,
        left_margin,
        brand_top_y - 23.0,
        "Comp Add: D1, Basera Complex, Dumduma, BBSR - 751019",
    );

    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        left_margin,
        brand_top_y - 33.0,
        "Phone: 06822273304 / 943933330  |  GSTIN: 21BOCPM8229J2ZW  |  PAN: BOCPM8229J",
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

    let draw_key_value = |canvas: &mut PdfCanvas, x: f64, y: f64, key: &str, value: &str, is_bold: bool| {
        canvas.set_fill_color(PdfColor::hex("#64748b"));
        canvas.draw_string(PdfFont::HelveticaBold, 7.5, x, y, key);
        canvas.set_fill_color(PdfColor::hex("#0f172a"));
        let font = if is_bold { PdfFont::HelveticaBold } else { PdfFont::Helvetica };
        canvas.draw_string(font, 8.5, x + 76.0, y, value);
    };

    draw_key_value(
        &mut canvas,
        left_card_x + 12.0,
        row_y,
        "PARTY NAME",
        &truncate_text(&data.customer_name, 26),
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
    draw_key_value(&mut canvas, left_card_x + 12.0, row_y, "D.L. NUMBER", &truncate_text(dl_val, 25), false);

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
        &truncate_text(addr_val, 28),
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
            if let Some(amt) = data.linked_invoice_amount {
                format!("Bill #{inv} (Rs. {})", format_money(amt))
            } else {
                format!("Bill #{inv}")
            }
        }
        _ => "General Account Credit".to_string(),
    };
    draw_key_value(
        &mut canvas,
        right_card_x + 12.0,
        right_row_y,
        "ALLOCATION",
        &truncate_text(&linked_bill_val, 25),
        false,
    );

    right_row_y -= row_spacing;
    let (due_val, due_bold) = match data.current_outstanding_due {
        Some(due) => {
            let status_tag = data.account_status.as_deref().unwrap_or(if due > 0.0 { "DUE" } else { "SETTLED" });
            (format!("Rs. {} ({status_tag})", format_money(due)), true)
        }
        None => ("Current Record Settled".to_string(), false),
    };
    draw_key_value(
        &mut canvas,
        right_card_x + 12.0,
        right_row_y,
        "BALANCE DUE",
        &truncate_text(&due_val, 25),
        due_bold,
    );

    // Visual Due & Aging Severity Progress Bar
    let due_amt = data.current_outstanding_due.unwrap_or(0.0);
    let aging = data.aging_days.unwrap_or(0);

    let (severity_label, bar_color, track_color, fill_ratio) = if due_amt <= 0.001 {
        (
            "SETTLED  •  0 DAYS OVERDUE",
            PdfColor::hex("#10b981"), // Emerald
            PdfColor::hex("#ecfdf5"),
            1.0,
        )
    } else if aging <= 30 {
        let ratio = if let Some(p) = data.due_percentage {
            (p / 100.0).clamp(0.20, 0.45)
        } else {
            (aging.max(1) as f64 / 30.0 * 0.45).clamp(0.20, 0.45)
        };
        (
            if aging == 0 { "CURRENT ACCOUNT  •  LOW RISK" } else { "CURRENT  •  0-30 DAYS AGING" },
            PdfColor::hex("#3b82f6"), // Indigo / Blue
            PdfColor::hex("#eff6ff"),
            ratio,
        )
    } else if aging <= 60 {
        let ratio = (0.45 + (aging - 30) as f64 / 30.0 * 0.35).clamp(0.45, 0.80);
        (
            "MODERATE DUE  •  31-60 DAYS AGING",
            PdfColor::hex("#f59e0b"), // Amber Warning
            PdfColor::hex("#fffbeb"),
            ratio,
        )
    } else {
        let ratio = (0.80 + (aging - 60) as f64 / 30.0 * 0.20).clamp(0.80, 1.0);
        (
            "CRITICAL AGING  •  60+ DAYS OVERDUE",
            PdfColor::hex("#ef4444"), // Crimson Alert
            PdfColor::hex("#fef2f2"),
            ratio,
        )
    };

    let bar_box_y = right_row_y - 25.0;
    let bar_width = col_w - 24.0;
    let bar_height = 6.0;

    // Severity label
    canvas.set_fill_color(bar_color);
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        6.5,
        right_card_x + 12.0,
        bar_box_y + 10.0,
        severity_label,
        0.3,
    );

    // Track background
    canvas.set_fill_color(track_color);
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.5);
    canvas.round_rect(right_card_x + 12.0, bar_box_y, bar_width, bar_height, 3.0, true, true);

    // Active fill
    let active_w = (bar_width * fill_ratio).max(6.0);
    canvas.set_fill_color(bar_color);
    canvas.round_rect(right_card_x + 12.0, bar_box_y, active_w, bar_height, 3.0, false, true);

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

    // 6. ONLINE LEDGER STATEMENT QR CARD (Zero Fluff, purely functional)
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

    if let Some(url) = qr_link {
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
        canvas.draw_string(
            PdfFont::HelveticaBold,
            7.5,
            info_x,
            qr_card_y + 16.0,
            &truncate_text(&url, 75),
        );
    }

    // 7. SIGNATURES SECTION
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
        "FOR UTKAL CHEMICAL AUSHADHALAYA",
    );

    canvas.set_fill_color(PdfColor::hex("#64748b"));
    canvas.draw_right_string(
        PdfFont::Helvetica,
        7.0,
        right_sig_x + sig_line_w,
        sig_y - 23.0,
        "Authorised Signatory",
    );

    // 8. AUDIT FOOTER (Minimal hairline, zero MARG attribution)
    let footer_line_y = 48.0;
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.5);
    canvas.line(left_margin, footer_line_y, left_margin + content_width, footer_line_y);

    canvas.set_fill_color(PdfColor::hex("#94a3b8"));
    let audit_text = format!(
        "UTKAL CHEMICAL AUSHADHALAYA  •  AUDIT REF: {}  •  DATE: {}",
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
            remarks: Some("Part payment towards April invoices.".to_string()),
            customer_ledger_token: Some("token_123456789".to_string()),
            customer_id: Some(12),
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
}
