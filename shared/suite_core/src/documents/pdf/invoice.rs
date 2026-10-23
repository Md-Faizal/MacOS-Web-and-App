use super::writer::{PdfCanvas, PdfColor, PdfFont};
use crate::documents::words::amount_in_indian_words;
use qrcodegen::{QrCode, QrCodeEcc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[inline]
fn mm_to_pt(mm: f64) -> f64 {
    mm * 2.834645669291339
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

fn de_bool_flexible<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum AnyBool {
        Bool(bool),
        Int(i64),
        String(String),
    }

    match AnyBool::deserialize(deserializer)? {
        AnyBool::Bool(b) => Ok(b),
        AnyBool::Int(i) => Ok(i != 0),
        AnyBool::String(s) => Ok(matches!(
            s.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        )),
    }
}

fn default_duplex() -> bool {
    true
}

fn default_upi_id() -> String {
    "7749089400@hdfc".to_string()
}

fn default_portal_url() -> String {
    "https://mac.faizal.uk".to_string()
}

fn bool_from_settings(settings: &HashMap<String, String>, key: &str, default: bool) -> bool {
    settings
        .get(key)
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "true" | "1" | "yes"
            )
        })
        .unwrap_or(default)
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

fn make_payment_uri(data: &InvoiceRenderData) -> String {
    let settings = &data.app_settings;
    let mut uri = settings
        .get("payment_upi_id")
        .cloned()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(default_upi_id);
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
    let due = data.grand_total + data.previous_due;
    if due > 0.01 && !uri.contains("?am=") && !uri.contains("&am=") {
        uri.push_str(&format!("&am={:.2}", due));
    }
    if !data.invoice_no.is_empty() && !uri.contains("?tn=") && !uri.contains("&tn=") {
        let due = data.grand_total + data.previous_due;
        let note = format!(
            "Inv:{} (Bill:{:.0}|Due:{:.0})",
            data.invoice_no, data.grand_total, due
        );
        let note: String = note.chars().take(52).collect();
        uri.push_str("&tn=");
        uri.push_str(&percent_encode(&note));
    }
    uri
}

fn make_portal_uri(data: &InvoiceRenderData) -> String {
    let settings = &data.app_settings;
    let base = settings
        .get("portal_base_url")
        .filter(|value| !value.is_empty())
        .cloned()
        .unwrap_or_else(default_portal_url)
        .trim_end_matches('/')
        .to_string();
    let mut uri = if let Some(token) = data
        .customer_ledger_token
        .as_deref()
        .filter(|token| !token.is_empty())
    {
        format!("{base}/ledger/{token}")
    } else {
        let customer_id = data.customer_id.or(data.i_customer_id).unwrap_or(3);
        format!("{base}/customer-ledger.html?id={customer_id}")
    };
    if let Some(reference) = data
        .invoice_ledger_ref
        .as_deref()
        .filter(|reference| !reference.is_empty())
    {
        uri.push_str(if uri.contains('?') { "&r=" } else { "?r=" });
        uri.push_str(&percent_encode(reference));
    }
    uri
}

fn draw_qr(canvas: &mut PdfCanvas, content: &str, x: f64, y: f64, side: f64) -> Result<(), String> {
    let code = QrCode::encode_text(content, QrCodeEcc::Medium)
        .map_err(|error| format!("Could not encode invoice QR code: {error}"))?;
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

fn render_duplex_back_page(canvas: &mut PdfCanvas, data: &InvoiceRenderData) -> Result<(), String> {
    let page_width = 595.28;
    let page_height = 841.89;
    canvas.new_page_with_size(page_width, page_height);

    let sidebar_width = mm_to_pt(75.0);
    // 1. LEFT SIDEBAR (width 75mm, height 297mm)
    canvas.set_fill_color(PdfColor::hex("#f3f4f6"));
    canvas.rect(0.0, 0.0, sidebar_width, page_height, false, true);

    // Sidebar Background SVGs — subtle slate watermark curves and dots
    canvas.save_state();
    // Path 1
    canvas.set_stroke_color(PdfColor::hex("#94a3b8"));
    canvas.set_line_width(1.2);
    canvas.set_alpha(0.12);
    canvas.move_to(-53.15, page_height - 52.62);
    canvas.curve_to(
        159.45,
        page_height - 210.47,
        -53.15,
        page_height - 368.33,
        159.45,
        page_height - 526.18,
    );
    canvas.curve_to(
        372.05,
        page_height - 684.04,
        -53.15,
        page_height - 841.89,
        159.45,
        page_height - 999.74,
    );
    canvas.stroke();

    // Path 2
    canvas.set_line_width(0.8);
    canvas.set_alpha(0.09);
    canvas.move_to(265.75, page_height + 52.62);
    canvas.curve_to(
        53.15,
        page_height - 105.24,
        318.90,
        page_height - 263.09,
        106.30,
        page_height - 420.94,
    );
    canvas.curve_to(
        -106.30,
        page_height - 578.80,
        318.90,
        page_height - 736.65,
        53.15,
        page_height - 894.51,
    );
    canvas.stroke();

    // Circles — subtle slate dots
    canvas.set_fill_color(PdfColor::hex("#94a3b8"));
    canvas.set_alpha(0.15);
    canvas.circle(31.89, page_height - 157.85, 3.19, false, true);
    canvas.set_alpha(0.18);
    canvas.circle(180.71, page_height - 473.56, 4.25, false, true);
    canvas.set_alpha(0.15);
    canvas.circle(53.15, page_height - 684.04, 2.66, false, true);
    canvas.set_alpha(0.12);
    canvas.circle(170.08, page_height - 210.47, 2.13, false, true);
    canvas.restore_state();

    // Top Chevron Logo Icon
    let logo_x = sidebar_width / 2.0;
    let logo_y = page_height - mm_to_pt(25.0) - 15.0;
    canvas.save_state();
    canvas.set_stroke_color(PdfColor::hex("#334155"));
    canvas.set_line_width(2.0);
    // Diamond top
    canvas.move_to(logo_x, logo_y + 12.5);
    canvas.line_to(logo_x - 12.5, logo_y + 6.25);
    canvas.line_to(logo_x, logo_y);
    canvas.line_to(logo_x + 12.5, logo_y + 6.25);
    canvas.close_path();
    // Angle bottom
    canvas.move_to(logo_x - 12.5, logo_y - 6.25);
    canvas.line_to(logo_x, logo_y - 12.5);
    canvas.line_to(logo_x + 12.5, logo_y - 6.25);
    // Angle middle
    canvas.move_to(logo_x - 12.5, logo_y);
    canvas.line_to(logo_x, logo_y - 6.25);
    canvas.line_to(logo_x + 12.5, logo_y);
    canvas.stroke();
    canvas.restore_state();

    // Sidebar QR Container 1: PAYMENT QR
    let payment_title_y = page_height - mm_to_pt(59.0);
    canvas.set_fill_color(PdfColor::hex("#1e293b"));
    canvas.draw_centered_spaced_string(
        PdfFont::HelveticaBold,
        8.5,
        logo_x,
        payment_title_y,
        "PAYMENT QR",
        2.0,
    );

    let qr_box_size = mm_to_pt(42.0) + 16.0;
    let qr_x = (sidebar_width - qr_box_size) / 2.0;
    let payment_box_y = payment_title_y - 12.0 - qr_box_size;
    let qr_inner_size = mm_to_pt(42.0);

    canvas.set_fill_color(PdfColor::WHITE);
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.75);
    canvas.round_rect(qr_x, payment_box_y, qr_box_size, qr_box_size, 10.0, true, true);

    let payment_uri = make_payment_uri(data);
    draw_qr(
        canvas,
        &payment_uri,
        qr_x + 8.0,
        payment_box_y + 8.0,
        qr_inner_size,
    )?;

    let display_upi = data
        .app_settings
        .get("payment_upi_id")
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .split("?pa=")
                .nth(1)
                .and_then(|query| query.split('&').next())
                .unwrap_or(value)
                .to_string()
        })
        .unwrap_or_else(default_upi_id);

    canvas.set_fill_color(PdfColor::hex("#475569"));
    canvas.draw_centered_spaced_string(
        PdfFont::HelveticaBold,
        8.0,
        logo_x,
        payment_box_y - 18.0,
        &format!("UPI: {display_upi}"),
        0.5,
    );
    canvas.draw_centered_string(
        PdfFont::Helvetica,
        7.5,
        logo_x,
        payment_box_y - 30.0,
        &format!("Bill Amt: Rs. {}", format_money(data.grand_total)),
    );
    canvas.draw_centered_string(
        PdfFont::Helvetica,
        7.5,
        logo_x,
        payment_box_y - 41.0,
        &format!("Prev Due: Rs. {}", format_money(data.previous_due)),
    );
    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    canvas.draw_centered_string(
        PdfFont::HelveticaBold,
        8.5,
        logo_x,
        payment_box_y - 54.0,
        &format!(
            "TOTAL DUE: Rs. {}",
            format_money(data.grand_total + data.previous_due)
        ),
    );

    // Digital clickable "PAY VIA UPI APP" button if mode is export
    if data.export_mode {
        canvas.save_state();
        canvas.set_fill_color(PdfColor::hex("#1e293b"));
        let btn_w = 85.0;
        let btn_h = 16.0;
        let btn_x = logo_x - (btn_w / 2.0);
        let btn_y = (payment_box_y - 78.0) - (btn_h / 2.0);
        canvas.round_rect(btn_x, btn_y, btn_w, btn_h, 4.0, false, true);
        canvas.set_fill_color(PdfColor::WHITE);
        canvas.draw_centered_string(
            PdfFont::HelveticaBold,
            7.0,
            logo_x,
            btn_y + 4.5,
            "PAY VIA UPI APP",
        );
        canvas.restore_state();
        canvas.add_link_annotation(btn_x, btn_y, btn_w, btn_h, &payment_uri);
        canvas.add_link_annotation(qr_x, payment_box_y, qr_box_size, qr_box_size, &payment_uri);
    }

    // Sidebar QR Container 2: PORTAL ACCESS
    let portal_title_y = payment_box_y - 18.0 - mm_to_pt(35.0);
    canvas.set_fill_color(PdfColor::hex("#1e293b"));
    canvas.draw_centered_spaced_string(
        PdfFont::HelveticaBold,
        8.5,
        logo_x,
        portal_title_y,
        "PORTAL ACCESS",
        2.0,
    );
    let portal_box_y = portal_title_y - 12.0 - qr_box_size;
    canvas.set_fill_color(PdfColor::WHITE);
    canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
    canvas.set_line_width(0.75);
    canvas.round_rect(qr_x, portal_box_y, qr_box_size, qr_box_size, 10.0, true, true);

    let portal_uri = make_portal_uri(data);
    draw_qr(
        canvas,
        &portal_uri,
        qr_x + 8.0,
        portal_box_y + 8.0,
        qr_inner_size,
    )?;
    canvas.set_fill_color(PdfColor::hex("#475569"));
    canvas.draw_centered_spaced_string(
        PdfFont::HelveticaBold,
        8.0,
        logo_x,
        portal_box_y - 18.0,
        "SCAN TO OPEN",
        0.5,
    );
    if data.export_mode {
        canvas.add_link_annotation(qr_x, portal_box_y, qr_box_size, qr_box_size, &portal_uri);
    }

    // 2. MAIN CONTENT (left 75mm, width 135mm, height 297mm)
    let main_left = sidebar_width;
    let main_width = page_width - sidebar_width;
    canvas.set_fill_color(PdfColor::WHITE);
    canvas.rect(main_left, 0.0, main_width, page_height, false, true);

    // Main Background SVGs
    // Top accent polygon
    canvas.save_state();
    canvas.move_to(main_left + 400.0 * 0.7654, page_height);
    canvas.line_to(main_left + 500.0 * 0.7654, page_height);
    canvas.line_to(main_left + 500.0 * 0.7654, page_height - 100.0 * 1.0524);
    canvas.close_path();
    canvas.set_fill_color(PdfColor::hex("#94a3b8"));
    canvas.set_alpha(0.08);
    canvas.fill();

    // Decorative flower group: transform="translate(480, 780) scale(4)" opacity="0.04"
    let gx = main_left + 367.37;
    let gy = 21.05;
    let sx = 3.0614;
    let sy = 4.2094;
    let svg_to_pt = |x: f64, y: f64| -> (f64, f64) {
        (gx + sx * x, gy - sy * y)
    };
    let draw_quad_to = |canvas: &mut PdfCanvas, x0: f64, y0: f64, xc: f64, yc: f64, x2: f64, y2: f64| {
        let (rx0, ry0) = svg_to_pt(x0, y0);
        let (rxc, ryc) = svg_to_pt(xc, yc);
        let (rx2, ry2) = svg_to_pt(x2, y2);
        let c1x = rx0 + (2.0 / 3.0) * (rxc - rx0);
        let c1y = ry0 + (2.0 / 3.0) * (ryc - ry0);
        let c2x = rx2 + (2.0 / 3.0) * (rxc - rx2);
        let c2y = ry2 + (2.0 / 3.0) * (ryc - ry2);
        canvas.curve_to(c1x, c1y, c2x, c2y, rx2, ry2);
    };

    canvas.set_stroke_color(PdfColor::hex("#94a3b8"));
    canvas.set_fill_color(PdfColor::hex("#94a3b8"));
    canvas.set_line_width(3.65);
    canvas.set_alpha(0.04);

    let (p0x, p0y) = svg_to_pt(0.0, 0.0);

    // Petal 1
    canvas.move_to(p0x, p0y);
    draw_quad_to(canvas, 0.0, 0.0, -20.0, -40.0, 0.0, -80.0);
    draw_quad_to(canvas, 0.0, -80.0, 20.0, -40.0, 0.0, 0.0);
    canvas.close_path();
    canvas.fill_and_stroke();

    // Petal 2
    canvas.move_to(p0x, p0y);
    draw_quad_to(canvas, 0.0, 0.0, -40.0, -30.0, -60.0, -60.0);
    draw_quad_to(canvas, -60.0, -60.0, -20.0, -10.0, 0.0, 0.0);
    canvas.close_path();
    canvas.fill_and_stroke();

    // Petal 3
    canvas.move_to(p0x, p0y);
    draw_quad_to(canvas, 0.0, 0.0, 40.0, -30.0, 60.0, -60.0);
    draw_quad_to(canvas, 60.0, -60.0, 20.0, -10.0, 0.0, 0.0);
    canvas.close_path();
    canvas.fill_and_stroke();

    // Petal 4
    canvas.move_to(p0x, p0y);
    draw_quad_to(canvas, 0.0, 0.0, -60.0, 0.0, -80.0, -20.0);
    draw_quad_to(canvas, -80.0, -20.0, -30.0, 10.0, 0.0, 0.0);
    canvas.close_path();
    canvas.stroke();

    // Petal 5
    canvas.move_to(p0x, p0y);
    draw_quad_to(canvas, 0.0, 0.0, 60.0, 0.0, 80.0, -20.0);
    draw_quad_to(canvas, 80.0, -20.0, 30.0, 10.0, 0.0, 0.0);
    canvas.close_path();
    canvas.stroke();

    canvas.restore_state();

    let main_padding = main_left + mm_to_pt(12.0);
    let content_width = main_width - mm_to_pt(24.0);
    let mut cur_main_y = page_height - mm_to_pt(18.0);

    // Header Block
    cur_main_y -= 26.0;
    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        26.0,
        main_padding,
        cur_main_y,
        "UTKAL CHEMICAL",
        1.0,
    );

    cur_main_y -= 24.0;
    canvas.set_fill_color(PdfColor::hex("#660033"));
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        19.0,
        main_padding,
        cur_main_y,
        "AUSHADHALAYA",
        3.0,
    );

    cur_main_y -= 22.0;
    canvas.set_stroke_color(PdfColor::hex("#660033"));
    canvas.set_line_width(3.0);
    canvas.line(main_padding, cur_main_y - 12.0, main_padding, cur_main_y + 11.0);

    canvas.set_fill_color(PdfColor::hex("#475569"));
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        9.0,
        main_padding + 10.0,
        cur_main_y + 1.0,
        "PAYMENT QR CODE, BANK ACCOUNT",
        0.5,
    );
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        9.0,
        main_padding + 10.0,
        cur_main_y - 11.6,
        "DETAILS & DIGITAL LEDGER PORTAL",
        0.5,
    );

    // Meta Bar
    cur_main_y -= 26.6;
    canvas.set_stroke_color(PdfColor::hex("#eaeaea"));
    canvas.set_line_width(1.0);
    canvas.line(main_padding, cur_main_y, main_padding + content_width, cur_main_y);

    cur_main_y -= 17.5;
    canvas.set_fill_color(PdfColor::hex("#888888"));
    canvas.draw_string(PdfFont::Helvetica, 8.5, main_padding, cur_main_y, "INVOICE NO: ");
    let w_inv = canvas.string_width(PdfFont::Helvetica, 8.5, "INVOICE NO: ");
    canvas.set_fill_color(PdfColor::hex("#111111"));
    canvas.draw_string(
        PdfFont::HelveticaBold,
        8.5,
        main_padding + w_inv,
        cur_main_y,
        &data.invoice_no,
    );

    let date_str = format_date(data.invoice_date.as_deref().unwrap_or(""));
    let date_lbl = "DATE: ";
    let w_d_val = canvas.string_width(PdfFont::HelveticaBold, 8.5, &date_str);
    let w_d_lbl = canvas.string_width(PdfFont::Helvetica, 8.5, date_lbl);
    let rx = main_padding + content_width - w_d_val - w_d_lbl;
    canvas.set_fill_color(PdfColor::hex("#888888"));
    canvas.draw_string(PdfFont::Helvetica, 8.5, rx, cur_main_y, date_lbl);
    canvas.set_fill_color(PdfColor::hex("#111111"));
    canvas.draw_string(PdfFont::HelveticaBold, 8.5, rx + w_d_lbl, cur_main_y, &date_str);

    // Section 1: BANK TRANSFER DETAILS
    cur_main_y -= mm_to_pt(22.0);

    // Watermark "01"
    canvas.save_state();
    canvas.set_fill_color(PdfColor::hex("#660033"));
    canvas.set_alpha(0.12);
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        45.0,
        main_padding - 7.5,
        cur_main_y - 11.0,
        "01",
        -1.5,
    );
    canvas.restore_state();

    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    let title_s1 = "BANK TRANSFER DETAILS";
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        13.0,
        main_padding,
        cur_main_y,
        title_s1,
        1.0,
    );
    let w_ts1 = canvas.string_width_spaced(PdfFont::HelveticaBold, 13.0, title_s1, 1.0);
    canvas.set_stroke_color(PdfColor::hex("#660033"));
    canvas.set_line_width(2.0);
    canvas.line(main_padding, cur_main_y - 3.75, main_padding + w_ts1, cur_main_y - 3.75);

    cur_main_y -= 3.75 + 11.25 + 12.0;

    let account_holder = data
        .app_settings
        .get("bank_account_holder")
        .map(String::as_str)
        .or(data.bank_account_holder.as_deref())
        .unwrap_or("MD FAIZAL");
    let account_number = data
        .app_settings
        .get("bank_account_number")
        .map(String::as_str)
        .or(data.bank_account_number.as_deref())
        .unwrap_or("50100673684509");
    let ifsc_code = data
        .app_settings
        .get("bank_ifsc")
        .map(String::as_str)
        .or(data.bank_ifsc.as_deref())
        .unwrap_or("HDFC0000236");
    let branch = data
        .app_settings
        .get("bank_branch")
        .map(String::as_str)
        .or(data.bank_branch.as_deref())
        .unwrap_or("CUTTACK - ODISHA");

    let mut bank_fields: Vec<(&str, &str)> = vec![
        ("Account Holder", account_holder),
        ("Account Number", account_number),
        ("IFSC Code", ifsc_code),
        ("Branch", branch),
    ];
    let show_mmid = bool_from_settings(&data.app_settings, "bank_show_mmid", true);
    let mmid_val = data
        .app_settings
        .get("bank_mmid")
        .map(String::as_str)
        .unwrap_or("9240072");
    if show_mmid && !mmid_val.is_empty() {
        bank_fields.push(("MMID", mmid_val));
    }
    let account_type = data
        .app_settings
        .get("bank_account_type")
        .map(String::as_str)
        .unwrap_or("Savings Account");
    if !account_type.is_empty() {
        bank_fields.push(("Account Type", account_type));
    }

    for (i, (label, val)) in bank_fields.iter().enumerate() {
        canvas.set_fill_color(PdfColor::hex("#777777"));
        canvas.draw_string(PdfFont::Helvetica, 10.5, main_padding, cur_main_y, label);
        canvas.set_fill_color(PdfColor::hex("#111111"));
        canvas.draw_string(
            PdfFont::HelveticaBold,
            10.5,
            main_padding + content_width * 0.42,
            cur_main_y,
            val,
        );
        if i < bank_fields.len() - 1 {
            canvas.set_stroke_color(PdfColor::hex("#f0f0f0"));
            canvas.set_line_width(1.0);
            canvas.line(main_padding, cur_main_y - 9.0, main_padding + content_width, cur_main_y - 9.0);
            cur_main_y -= 28.5;
        } else {
            cur_main_y -= 9.0;
        }
    }

    // Section 2: CUSTOMER PORTAL
    cur_main_y -= mm_to_pt(25.0);

    // Watermark "02"
    canvas.save_state();
    canvas.set_fill_color(PdfColor::hex("#660033"));
    canvas.set_alpha(0.12);
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        45.0,
        main_padding - 7.5,
        cur_main_y - 11.0,
        "02",
        -1.5,
    );
    canvas.restore_state();

    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    let title_s2 = "CUSTOMER PORTAL";
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        13.0,
        main_padding,
        cur_main_y,
        title_s2,
        1.0,
    );
    let w_ts2 = canvas.string_width_spaced(PdfFont::HelveticaBold, 13.0, title_s2, 1.0);
    canvas.set_stroke_color(PdfColor::hex("#660033"));
    canvas.set_line_width(2.0);
    canvas.line(main_padding, cur_main_y - 3.75, main_padding + w_ts2, cur_main_y - 3.75);

    cur_main_y -= 3.75 + 11.25 + 10.5;
    canvas.set_fill_color(PdfColor::hex("#222222"));
    canvas.draw_string(
        PdfFont::HelveticaBold,
        10.5,
        main_padding,
        cur_main_y,
        "24/7 Online Ledger & Portal Benefits:",
    );

    cur_main_y -= 9.0 + 10.0;
    let bullets = [
        "View real-time account ledger balances",
        "Download copies of previous invoices and receipts",
        "Track pending dues and payment history instantly",
        "Verify transactions and reconcile statements anytime",
    ];
    for b in bullets {
        canvas.save_state();
        canvas.set_fill_color(PdfColor::hex("#444444"));
        canvas.circle(main_padding + 5.0, cur_main_y + 3.5, 2.0, false, true);
        canvas.restore_state();
        canvas.set_fill_color(PdfColor::hex("#444444"));
        canvas.draw_string(PdfFont::Helvetica, 10.0, main_padding + 14.0, cur_main_y, b);
        cur_main_y -= 19.0;
    }

    cur_main_y -= 15.0;
    let box_h = 45.0;
    let box_y = cur_main_y - box_h;
    canvas.set_fill_color(PdfColor::hex("#f8fafc"));
    canvas.rect(main_padding, box_y, content_width, box_h, false, true);
    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    canvas.rect(main_padding, box_y, 4.0, box_h, false, true);

    canvas.set_fill_color(PdfColor::hex("#666666"));
    canvas.draw_spaced_string(
        PdfFont::HelveticaBold,
        8.0,
        main_padding + 14.0,
        box_y + 28.0,
        "DIRECT WEB LINK",
        1.0,
    );

    let portal_link = make_portal_uri(data);
    let mut font_size = 9.5;
    while canvas.string_width(PdfFont::HelveticaBold, font_size, &portal_link) > content_width - 24.0
        && font_size > 5.0
    {
        font_size -= 0.5;
    }
    canvas.set_fill_color(PdfColor::hex("#111111"));
    canvas.draw_string(
        PdfFont::HelveticaBold,
        font_size,
        main_padding + 14.0,
        box_y + 12.0,
        &portal_link,
    );

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceProductItem {
    pub name: String,
    #[serde(default = "default_hsn")]
    pub hsn: String,
    #[serde(default)]
    pub mfg: String,
    #[serde(default)]
    pub pack: String,
    pub batch_no: String,
    #[serde(default)]
    pub exp_date: Option<String>,
    pub qty: f64,
    #[serde(default)]
    pub free: f64,
    pub mrp: f64,
    pub rate: f64,
    pub amount: f64,
    #[serde(default)]
    pub dis1: f64,
    #[serde(default)]
    pub dis2: f64,
    #[serde(default)]
    pub sgst_per: f64,
    #[serde(default)]
    pub sgst_val: f64,
    #[serde(default)]
    pub cgst_per: f64,
    #[serde(default)]
    pub cgst_val: f64,
    pub final_amt: f64,
    #[serde(default, deserialize_with = "de_bool_flexible")]
    pub is_gold: bool,
}

fn default_hsn() -> String {
    "30049011".to_string()
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceRenderData {
    pub invoice_no: String,
    pub invoice_date: Option<String>,
    pub due_date: Option<String>,
    pub lr_no: Option<String>,
    pub lr_date: Option<String>,
    pub party_name: String,
    #[serde(default)]
    pub address: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub licence_no: String,
    #[serde(default)]
    pub pan: String,
    #[serde(default)]
    pub gstin: String,
    #[serde(default)]
    pub total_amount: f64,
    #[serde(default)]
    pub total_discount: f64,
    #[serde(default)]
    pub total_sgst: f64,
    #[serde(default)]
    pub total_cgst: f64,
    #[serde(default)]
    pub round_off: f64,
    #[serde(default)]
    pub grand_total: f64,
    #[serde(default)]
    pub previous_due: f64,
    #[serde(default)]
    pub products: Vec<InvoiceProductItem>,
    #[serde(default = "default_duplex", deserialize_with = "de_bool_flexible")]
    pub duplex_print: bool,
    #[serde(default)]
    pub export_mode: bool,
    #[serde(default)]
    pub app_settings: HashMap<String, String>,
    #[serde(default)]
    pub customer_ledger_token: Option<String>,
    #[serde(default)]
    pub invoice_ledger_ref: Option<String>,
    #[serde(default)]
    pub customer_id: Option<i64>,
    #[serde(default)]
    pub i_customer_id: Option<i64>,
    #[serde(default)]
    pub bank_account_holder: Option<String>,
    #[serde(default)]
    pub bank_account_number: Option<String>,
    #[serde(default)]
    pub bank_ifsc: Option<String>,
    #[serde(default)]
    pub bank_branch: Option<String>,
}

const PAGE_ITEM_LIMIT: usize = 29;

fn render_invoice_sheet(
    canvas: &mut PdfCanvas,
    data: &InvoiceRenderData,
    page_products: &[InvoiceProductItem],
    cumulative_products: &[InvoiceProductItem],
    start_item_index: usize,
    page_num: usize,
    total_pages: usize,
) {
    let is_final_page = page_num == total_pages;
    let left_margin = mm_to_pt(5.0);
    let right_margin = mm_to_pt(5.0);
    let bottom_margin = mm_to_pt(5.0);
    let width = canvas.width;
    let height = canvas.height;
    let table_width = width - left_margin - right_margin;

    // Precise column widths (19 columns) matching ReportLab
    let column_widths: [f64; 19] = [
        14.91, 37.69, 26.50, 159.03, 33.96, 64.19, 30.23, 37.69, 30.23, 45.56, 40.17, 46.38, 30.23,
        26.92, 30.23, 41.41, 30.23, 41.83, 45.14,
    ];

    // Outer Border
    canvas.set_stroke_color(PdfColor::BLACK);
    canvas.set_line_width(1.0);
    canvas.rect(
        left_margin,
        bottom_margin,
        table_width,
        height - mm_to_pt(10.0),
        true,
        false,
    );

    // --- Header Section Setup ---
    let header_top = height - mm_to_pt(5.0);
    let header_height = mm_to_pt(32.0);
    let left_w = mm_to_pt(98.0);
    let center_w = mm_to_pt(120.0);
    let right_x = left_margin + left_w + center_w;
    let right_w = width - left_margin - right_margin - (left_w + center_w);
    let header_y = header_top - header_height;

    // 3 Header Boxes
    canvas.rect(left_margin, header_y, left_w, header_height, true, false);
    canvas.rect(
        left_margin + left_w,
        header_y,
        center_w,
        header_height,
        true,
        false,
    );
    canvas.rect(right_x, header_y, right_w, header_height, true, false);

    // Left: Company Info
    let company_name = data
        .app_settings
        .get("company_name")
        .map(String::as_str)
        .unwrap_or("UTKAL CHEMICAL AUSHADHALAYA");
    let comp_fact_add = data
        .app_settings
        .get("company_address_factory")
        .map(String::as_str)
        .unwrap_or("Binaba Marg, Aska, Ganjam, Pin.761110");
    let comp_office_add = data
        .app_settings
        .get("company_address_office")
        .map(String::as_str)
        .unwrap_or("D1, Basera Comple,Dumduma,BBSR");
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

    canvas.set_fill_color(PdfColor::NAVY_BLUE);
    canvas.draw_string(
        PdfFont::HelveticaBold,
        13.0,
        left_margin + mm_to_pt(2.0),
        header_y + header_height - mm_to_pt(5.0),
        company_name,
    );
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.draw_string(
        PdfFont::Helvetica,
        7.5,
        left_margin + mm_to_pt(2.0),
        header_y + header_height - mm_to_pt(11.0),
        &format!("FACT ADD::{}", comp_fact_add),
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        7.5,
        left_margin + mm_to_pt(2.0),
        header_y + header_height - mm_to_pt(15.0),
        &format!("COMP ADD::{}", comp_office_add),
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        7.5,
        left_margin + mm_to_pt(2.0),
        header_y + header_height - mm_to_pt(19.0),
        &format!("Phone : {}", comp_phone),
    );
    canvas.set_fill_color(PdfColor::NAVY_BLUE);
    canvas.draw_string(
        PdfFont::Helvetica,
        7.5,
        left_margin + mm_to_pt(2.0),
        header_y + header_height - mm_to_pt(23.0),
        &format!("GSTIN : {}     PAN : {}", comp_gstin, comp_pan),
    );

    // Center: Title
    canvas.draw_centered_string(
        PdfFont::HelveticaBold,
        15.0,
        left_margin + left_w + center_w / 2.0,
        header_y + header_height - mm_to_pt(8.0),
        "GST INVOICE",
    );
    canvas.draw_centered_string(
        PdfFont::HelveticaBold,
        10.0,
        left_margin + left_w + center_w / 2.0,
        header_y + header_height - mm_to_pt(15.0),
        "CREDIT",
    );
    canvas.set_fill_color(PdfColor::BLACK);

    // Center: Invoice Info Sub-grid
    let table_x = left_margin + left_w;
    let table_y = header_y + header_height - mm_to_pt(18.0) - mm_to_pt(14.0);
    let table_w = center_w;
    let table_h = mm_to_pt(14.0);
    canvas.rect(table_x, table_y, table_w, table_h, true, false);
    for i in 1..4 {
        let x = table_x + (i as f64) * (table_w / 4.0);
        canvas.line(x, table_y, x, table_y + table_h);
    }
    canvas.line(
        table_x,
        table_y + table_h / 2.0,
        table_x + table_w,
        table_y + table_h / 2.0,
    );

    let cell_w = table_w / 4.0;
    let cell_h = table_h / 2.0;
    let pad_x = mm_to_pt(1.5);
    let row0_y = table_y + cell_h + cell_h / 2.0 - 3.5;
    let row1_y = table_y + cell_h / 2.0 - 3.5;

    // Row 0
    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        table_x + pad_x,
        row0_y + 3.0,
        "Invoice No",
    );
    canvas.draw_string(
        PdfFont::HelveticaBold,
        7.0,
        table_x + cell_w + pad_x,
        row0_y + 3.0,
        &data.invoice_no,
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        table_x + 2.0 * cell_w + pad_x,
        row0_y + 6.0,
        "Order No.",
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        table_x + 2.0 * cell_w + pad_x,
        row0_y - 2.0,
        "Order Date",
    );
    canvas.draw_string(
        PdfFont::HelveticaBold,
        7.0,
        table_x + 3.0 * cell_w + pad_x,
        row0_y + 3.0,
        "Cases   0",
    );

    // Row 1
    canvas.draw_string(
        PdfFont::HelveticaBold,
        7.0,
        table_x + pad_x,
        row1_y + 6.0,
        "Invoice Date",
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        table_x + pad_x,
        row1_y - 2.0,
        "Due Date",
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        table_x + cell_w + pad_x,
        row1_y + 6.0,
        &format_date(data.invoice_date.as_deref().unwrap_or("")),
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        table_x + cell_w + pad_x,
        row1_y - 2.0,
        &format_date(data.due_date.as_deref().unwrap_or("")),
    );
    canvas.draw_string(
        PdfFont::HelveticaBold,
        7.0,
        table_x + 2.0 * cell_w + pad_x,
        row1_y + 6.0,
        "L.R. No.",
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        7.0,
        table_x + 2.0 * cell_w + pad_x,
        row1_y - 2.0,
        &format!(
            "L.R. Date {}",
            format_date(data.lr_date.as_deref().unwrap_or(""))
        ),
    );
    canvas.draw_string(
        PdfFont::HelveticaBold,
        7.0,
        table_x + 3.0 * cell_w + pad_x,
        row1_y + 3.0,
        "Transport",
    );

    // Right: Customer Info
    let party_x = right_x + mm_to_pt(2.0);
    let party_y = header_y + header_height - mm_to_pt(5.0);
    canvas.draw_string(PdfFont::Helvetica, 8.0, party_x, party_y, "Party Name :");
    let label_w = canvas.string_width(PdfFont::Helvetica, 8.0, "Party Name :");
    let mut party_font_size = 8.5;
    let max_party_w = right_w - label_w - 12.0;
    while canvas.string_width(PdfFont::HelveticaBold, party_font_size, &data.party_name)
        > max_party_w
        && party_font_size > 4.0
    {
        party_font_size -= 0.1;
    }
    canvas.draw_string(
        PdfFont::HelveticaBold,
        party_font_size,
        party_x + label_w + 4.0,
        party_y,
        &data.party_name,
    );

    let address_line = if data.address.len() > 60 {
        &data.address[..60]
    } else {
        &data.address
    };
    canvas.draw_string(
        PdfFont::Helvetica,
        8.0,
        party_x,
        header_y + header_height - mm_to_pt(10.0),
        address_line,
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        8.0,
        party_x,
        header_y + header_height - mm_to_pt(14.0),
        &format!("PHONE : {}", data.phone),
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        8.0,
        party_x,
        header_y + header_height - mm_to_pt(18.0),
        &format!("Licence No. : {}", data.licence_no),
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        8.0,
        party_x,
        header_y + header_height - mm_to_pt(22.0),
        &format!("PAN : {}", data.pan),
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        8.0,
        party_x,
        header_y + header_height - mm_to_pt(26.0),
        &format!("GSTIN : {}", data.gstin),
    );

    // Horizontal separator line under header
    canvas.line(left_margin, table_y, width - right_margin, table_y);

    // --- Footer Grid Setup ---
    let y1 = bottom_margin + 174.0;
    let y2 = bottom_margin + 162.0;
    let y3 = bottom_margin + 112.0;
    let y4 = bottom_margin + 100.0;
    let y5 = bottom_margin + 70.0;

    let vertical_x = left_margin + left_w + center_w;
    let vertical_x2 = width - right_margin - 340.0;

    // Horizontal Grid Lines
    canvas.line(left_margin, y1, width - right_margin, y1);
    canvas.line(left_margin, y2, width - right_margin, y2);
    canvas.line(left_margin, y3, vertical_x, y3);
    canvas.line(left_margin, y4, vertical_x, y4);
    canvas.line(left_margin, y5, width - right_margin, y5);

    // Vertical Grid Lines
    canvas.line(vertical_x, y1, vertical_x, y5);
    canvas.line(vertical_x2, y1, vertical_x2, y4);

    let x_gap = (vertical_x2 - left_margin) / 7.0;
    let equi_xs: Vec<f64> = (1..7).map(|i| left_margin + (i as f64) * x_gap).collect();
    for &x in &equi_xs {
        canvas.line(x, y1, x, y4);
    }

    // --- Table Column Headers ---
    let header_bottom_line_y = header_y - 12.0;
    canvas.set_fill_color(PdfColor::GRAY_BAR);
    canvas.rect(
        left_margin,
        header_bottom_line_y,
        table_width,
        12.0,
        false,
        true,
    );
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.line(
        left_margin,
        header_bottom_line_y,
        left_margin + table_width,
        header_bottom_line_y,
    );

    let table_header_y = header_y - (header_y - header_bottom_line_y) / 2.0 - 4.0;
    let col_titles = [
        "SL",
        "HSN",
        "MFG",
        "PRODUCT NAME",
        "PACK",
        "BATCH NO.",
        "EXP",
        "QTY.",
        "FREE",
        "M.R.P",
        "RATE",
        "AMOUNT",
        "DIS1",
        "DIS2",
        "SGST",
        "Value",
        "CGST",
        "Value",
        "FINAL AMT",
    ];

    let mut x_curr = left_margin;
    canvas.line(left_margin, header_y, left_margin, y1);
    for (i, &w) in column_widths.iter().enumerate() {
        if i < col_titles.len() {
            if matches!(i, 0 | 1 | 2 | 5 | 7 | 8 | 12 | 13 | 14 | 15 | 16 | 17) {
                canvas.draw_centered_string(
                    PdfFont::HelveticaBold,
                    8.0,
                    x_curr + w / 2.0,
                    table_header_y,
                    col_titles[i],
                );
            } else {
                canvas.draw_string(
                    PdfFont::HelveticaBold,
                    8.0,
                    x_curr + 2.0,
                    table_header_y,
                    col_titles[i],
                );
            }
        }
        x_curr += w;
        if i < column_widths.len() - 1 {
            canvas.line(x_curr, header_y, x_curr, y1);
        }
    }

    // --- Product Rows ---
    let product_table_top = header_bottom_line_y;
    let product_row_height = 10.0;

    for (row_idx, prod) in page_products.iter().enumerate() {
        let y = product_table_top - 12.0 - ((row_idx as f64) * product_row_height) + 3.0;
        let exp_str = prod.exp_date.as_deref().unwrap_or("--");
        let name_str = if prod.is_gold {
            format!("{} (G)", prod.name)
        } else {
            prod.name.clone()
        };

        let row_values = [
            format!("{}", start_item_index + row_idx + 1),
            "30049011".to_string(),
            "FINI".to_string(),
            name_str,
            prod.pack.clone(),
            prod.batch_no.clone(),
            exp_str.to_string(),
            format!("{:.0}", prod.qty),
            format!("{:.0}", prod.free),
            format!("{:.2}", prod.mrp),
            format!("{:.2}", prod.rate),
            format!("{:.2}", prod.amount),
            format!("{:.2}%", prod.dis1),
            format!("{:.2}%", prod.dis2),
            format!("{:.2}%", prod.sgst_per),
            format!("{:.2}", prod.sgst_val),
            format!("{:.2}%", prod.cgst_per),
            format!("{:.2}", prod.cgst_val),
            format!("{:.2}", prod.final_amt),
        ];

        let mut x_col = left_margin;
        for (col_idx, val) in row_values.iter().enumerate() {
            let col_w = column_widths[col_idx];
            if col_idx == 3 {
                let mut font_size = 8.0;
                let max_w = col_w - 3.0;
                while canvas.string_width(PdfFont::Helvetica, font_size, val) > max_w
                    && font_size > 4.0
                {
                    font_size -= 0.1;
                }
                canvas.draw_string(PdfFont::Helvetica, font_size, x_col + 2.0, y, val);
            } else if matches!(
                col_idx,
                0 | 1 | 2 | 5 | 6 | 7 | 8 | 12 | 13 | 14 | 15 | 16 | 17
            ) {
                canvas.draw_centered_string(PdfFont::Helvetica, 8.0, x_col + col_w / 2.0, y, val);
            } else if matches!(col_idx, 4 | 9 | 10 | 11 | 18) {
                canvas.draw_right_string(PdfFont::Helvetica, 8.0, x_col + col_w - 2.0, y, val);
            } else {
                canvas.draw_string(PdfFont::Helvetica, 8.0, x_col + 2.0, y, val);
            }
            x_col += col_w;
        }
    }

    // --- Footer: Calculations based on cumulative products ---
    let cumulative_total_amount: f64 = cumulative_products.iter().map(|p| p.amount).sum();
    let cumulative_sgst: f64 = cumulative_products.iter().map(|p| p.sgst_val).sum();
    let cumulative_cgst: f64 = cumulative_products.iter().map(|p| p.cgst_val).sum();

    let cumulative_discount: f64 = if is_final_page {
        data.total_discount
    } else {
        cumulative_products
            .iter()
            .map(|p| {
                let diff = p.amount + p.sgst_val + p.cgst_val - p.final_amt;
                if diff.abs() > 0.001 && diff > 0.0 {
                    diff
                } else {
                    let d1 = p.amount * (p.dis1 / 100.0);
                    let d2 = (p.amount - d1) * (p.dis2 / 100.0);
                    d1 + d2
                }
            })
            .sum()
    };
    let cumulative_total_gst = cumulative_sgst + cumulative_cgst;

    let (grand_total, round_off) = if is_final_page {
        (data.grand_total, data.round_off)
    } else {
        let unrounded = cumulative_total_amount - cumulative_discount + cumulative_total_gst;
        let rounded = unrounded.round();
        let ro = rounded - unrounded;
        (rounded, ro)
    };

    let col_headers = [
        "CLASS",
        "TOTAL",
        "SCHEME",
        "DISCOUNT",
        "SGST",
        "CGST",
        "TOTAL GST",
    ];
    let class_col_widths = [90.0, 60.0, 60.0, 88.0, 66.0, 44.0, 146.0];
    let mut header_x = left_margin + 15.0;
    for (j, header) in col_headers.iter().enumerate() {
        canvas.draw_string(
            PdfFont::HelveticaBold,
            7.0,
            header_x + 2.0,
            y2 + 2.0,
            header,
        );
        header_x += class_col_widths[j];
    }

    let gst_labels = ["GST 5.00%", "GST 12.00%", "GST 18.00%", "GST 28.00%"];
    let num_gst_rows = 4;
    let row_height = (y2 - y3 - 20.0) / (num_gst_rows as f64);
    let extra_space = 4.0;
    let gst_col_xs = vec![
        equi_xs[1],
        equi_xs[2],
        equi_xs[3],
        equi_xs[4],
        equi_xs[5],
        vertical_x2,
    ];

    for i in 0..num_gst_rows {
        let y = y2 - 10.0 - ((i as f64) + 0.5) * row_height - (i as f64) * extra_space;
        canvas.draw_string(
            PdfFont::HelveticaBold,
            8.0,
            left_margin + 5.0,
            y,
            gst_labels[i],
        );

        for (j, &gx) in gst_col_xs.iter().enumerate() {
            let val_str = if i == 0 {
                match j {
                    0 => format_money(cumulative_total_amount),
                    1 => "0.00".to_string(),
                    2 => format_money(cumulative_discount),
                    3 => format_money(cumulative_sgst),
                    4 => format_money(cumulative_cgst),
                    5 => format_money(cumulative_total_gst),
                    _ => "0.00".to_string(),
                }
            } else {
                "0.00".to_string()
            };
            canvas.draw_right_string(PdfFont::HelveticaBold, 9.0, gx - 7.0, y, &val_str);
        }
    }

    let total_row_y = y2
        - 10.0
        - ((num_gst_rows as f64) + 0.5) * row_height
        - (num_gst_rows as f64) * extra_space;
    let total_row_values = [
        format_money(cumulative_total_amount),
        "0.00".to_string(),
        format_money(cumulative_discount),
        format_money(cumulative_sgst),
        format_money(cumulative_cgst),
        format_money(cumulative_total_gst),
    ];
    for (value, &gx) in total_row_values.iter().zip(&gst_col_xs) {
        canvas.draw_right_string(PdfFont::HelveticaBold, 9.0, gx - 7.0, total_row_y, value);
    }

    let dis_amt_y = (y1 + y2) / 2.0 - 3.5;
    canvas.draw_string(
        PdfFont::Helvetica,
        10.0,
        vertical_x2 + 40.0,
        dis_amt_y,
        &format_money(cumulative_discount),
    );
    canvas.draw_string(
        PdfFont::Helvetica,
        10.0,
        vertical_x2 + 100.0,
        dis_amt_y,
        "0.00",
    );

    // Amount in Words
    canvas.draw_string(
        PdfFont::HelveticaBold,
        9.0,
        left_margin + 15.0,
        y4 + 1.5,
        "TOTAL",
    );
    let amount_words = format!("Rs. {}", amount_in_indian_words(grand_total));
    canvas.draw_string(
        PdfFont::HelveticaBold,
        8.5,
        left_margin + 15.0,
        y4 + (y5 - y4) / 2.0 - 4.5,
        &amount_words,
    );

    // Right Side Summary
    let items_x = vertical_x2 + 10.0;
    let items_y = y3 + (y2 - y3) / 2.0;
    canvas.draw_string(
        PdfFont::Helvetica,
        9.0,
        items_x,
        items_y + 6.0,
        &format!("Total Items :-     {}", cumulative_products.len()),
    );
    let total_qty: f64 = cumulative_products.iter().map(|p| p.qty + p.free).sum();
    canvas.draw_string(
        PdfFont::Helvetica,
        9.0,
        items_x,
        items_y - 6.0,
        &format!("Total Qty  :-     {:.2}", total_qty),
    );
    canvas.draw_string(
        PdfFont::HelveticaBold,
        9.0,
        items_x,
        y4 + (y5 - y4) / 2.0,
        &format!("Previous Due: Rs. {}", format_money(data.previous_due)),
    );

    let right_labels = [
        ("DIS AMT.", format!("{:.2}", cumulative_discount)),
        ("SGST PAYBLE", format!("{:.2}", cumulative_sgst)),
        ("CGST PAYBLE", format!("{:.2}", cumulative_cgst)),
        ("CR/DR NOTE", "0.00".to_string()),
        ("ROUND OFF", format!("{:.2}", round_off)),
    ];
    let label_x = vertical_x + 10.0;
    let value_x = width - right_margin - 10.0;
    for (i, (label, value)) in right_labels.iter().enumerate() {
        let y = y2 - 15.0 - (i as f64 * 12.0);
        canvas.draw_string(PdfFont::HelveticaBold, 8.0, label_x, y, label);
        canvas.draw_right_string(PdfFont::HelveticaBold, 8.5, value_x, y, value);
    }

    canvas.draw_string(
        PdfFont::HelveticaBold,
        14.0,
        label_x,
        y5 + 15.0,
        "Grand Total",
    );
    canvas.draw_right_string(
        PdfFont::HelveticaBold,
        13.0,
        value_x,
        y5 + 15.0,
        &format_money(grand_total),
    );

    let total_label_y = (y1 + y2) / 2.0 - 3.5;
    canvas.draw_string(
        PdfFont::HelveticaBold,
        10.0,
        label_x,
        total_label_y,
        "TOTAL:",
    );
    canvas.draw_right_string(
        PdfFont::HelveticaBold,
        10.0,
        value_x,
        total_label_y,
        &format_money(cumulative_total_amount),
    );

    let note_y = y5 - 10.0;
    let notes = [
        "Note:Goods once sold will not be taken back or exchanged.",
        "Bills not paid due date will attract 24% interest.",
        "All disputes subject to BHUBANESWAR Jurisdiction only.",
        "Prescribed Sales Tax declaration will be given.",
    ];
    let mut max_note_width: f64 = 0.0;
    for (i, note) in notes.iter().enumerate() {
        canvas.draw_string(
            PdfFont::HelveticaBold,
            9.0,
            left_margin + 10.0,
            note_y - (i as f64 * 13.0),
            note,
        );
        max_note_width = max_note_width.max(canvas.string_width(PdfFont::HelveticaBold, 9.0, note));
    }
    let dash_y = note_y - (notes.len() as f64 * 13.0) - 2.0;
    let dash_start = left_margin + 10.0;
    let mut dash_x = dash_start;
    while dash_x < dash_start + max_note_width {
        let dash_end = (dash_x + 2.0).min(dash_start + max_note_width);
        canvas.line(dash_x, dash_y, dash_end, dash_y);
        dash_x += 4.0;
    }

    // Toggle for invoice only: classic authority signature and no payment QR
    let invoice_classic_mode = bool_from_settings(&data.app_settings, "invoice_authority_sign_no_qr", false)
        || bool_from_settings(&data.app_settings, "invoice_classic_signature_mode", false)
        || data.app_settings.get("invoice_signature_layout").map(|v| v == "classic" || v == "usual").unwrap_or(false);

    // Pending Dues & Quick Pay Widget (rendered if customer has previous unpaid dues and not in classic mode)
    let show_dues_widget = !invoice_classic_mode && bool_from_settings(&data.app_settings, "invoice_show_dues_widget", true);
    if is_final_page && show_dues_widget && data.previous_due > 0.01 {
        let total_due = data.grand_total + data.previous_due;
        let widget_x = left_margin + 10.0 + max_note_width + 12.0;
        let widget_y = bottom_margin + 4.0;
        let widget_w = 265.0;
        let widget_h = (y5 - bottom_margin - 8.0).max(56.0);

        // Subtle background card
        canvas.set_fill_color(PdfColor::hex("#f8fafc"));
        canvas.set_stroke_color(PdfColor::hex("#cbd5e1"));
        canvas.set_line_width(0.75);
        canvas.round_rect(widget_x, widget_y, widget_w, widget_h, 4.0, true, true);

        // Amber accent vertical indicator on the left
        canvas.set_fill_color(PdfColor::hex("#f59e0b"));
        canvas.round_rect(widget_x, widget_y, 3.5, widget_h, 1.5, false, true);

        // Dynamic UPI QR Code
        let qr_size = 46.0;
        let qr_x = widget_x + 9.0;
        let qr_y = widget_y + (widget_h - qr_size) / 2.0;
        let pay_uri = make_payment_uri(data);
        let _ = draw_qr(canvas, &pay_uri, qr_x, qr_y, qr_size);

        // Information text beside QR
        let text_x = qr_x + qr_size + 10.0;
        canvas.set_fill_color(PdfColor::hex("#b45309"));
        canvas.draw_spaced_string(
            PdfFont::HelveticaBold,
            7.0,
            text_x,
            widget_y + widget_h - 13.0,
            "OUTSTANDING DUES & QUICK PAY",
            0.3,
        );

        canvas.set_fill_color(PdfColor::hex("#64748b"));
        canvas.draw_string(
            PdfFont::Helvetica,
            7.0,
            text_x,
            widget_y + widget_h - 24.0,
            &format!(
                "Prev Due: Rs. {}  |  Bill: Rs. {}",
                format_money(data.previous_due),
                format_money(data.grand_total)
            ),
        );

        canvas.set_fill_color(PdfColor::hex("#0f172a"));
        canvas.draw_string(
            PdfFont::HelveticaBold,
            8.5,
            text_x,
            widget_y + widget_h - 37.0,
            &format!("Total Due: Rs. {}", format_money(total_due)),
        );
        if data.export_mode {
            let portal_url = make_portal_uri(data);
            canvas.add_link_annotation(text_x, widget_y + widget_h - 38.0, 150.0, 26.0, &portal_url);
        }

        // Export mode: clickable app button vs Print mode: scan instruction
        if data.export_mode {
            let btn_w = 88.0;
            let btn_h = 13.0;
            let btn_y = widget_y + 5.0;
            canvas.set_fill_color(PdfColor::hex("#0f172a"));
            canvas.round_rect(text_x, btn_y, btn_w, btn_h, 3.0, false, true);
            canvas.set_fill_color(PdfColor::WHITE);
            canvas.draw_centered_string(
                PdfFont::HelveticaBold,
                6.5,
                text_x + btn_w / 2.0,
                btn_y + 3.5,
                "⚡ PAY VIA UPI APP",
            );
            canvas.add_link_annotation(text_x, btn_y, btn_w, btn_h, &pay_uri);
            canvas.add_link_annotation(qr_x, qr_y, qr_size, qr_size, &pay_uri);
        } else {
            canvas.set_fill_color(PdfColor::hex("#475569"));
            canvas.draw_string(
                PdfFont::Helvetica,
                6.5,
                text_x,
                widget_y + 6.0,
                "Scan with GPay / PhonePe / Paytm",
            );
        }
    }

    // Bottom-right: Signature vs Continuation vs Autogenerated Disclaimer
    let auto_sign = !invoice_classic_mode && bool_from_settings(&data.app_settings, "invoice_auto_sign_disclaimer", false);
    let comp_sign_name = data
        .app_settings
        .get("company_name")
        .map(String::as_str)
        .unwrap_or("UTKAL CHEMICAL AUSHADHALAYA");

    if is_final_page {
        if auto_sign {
            canvas.draw_right_string(
                PdfFont::HelveticaBold,
                8.5,
                width - right_margin - 10.0,
                y5 - 15.0,
                &format!("FOR  {}", comp_sign_name.to_ascii_uppercase()),
            );
            canvas.draw_right_string(
                PdfFont::HelveticaBold,
                7.5,
                width - right_margin - 10.0,
                y5 - 28.0,
                "COMPUTER GENERATED TAX INVOICE",
            );
            canvas.draw_right_string(
                PdfFont::Helvetica,
                7.0,
                width - right_margin - 10.0,
                y5 - 39.0,
                "Authenticated Document • No Signature Required",
            );
            canvas.draw_right_string(
                PdfFont::Helvetica,
                6.0,
                width - right_margin - 10.0,
                y5 - 49.0,
                "(CGST Rule 46 Proviso & Information Technology Act)",
            );
        } else {
            canvas.draw_right_string(
                PdfFont::HelveticaBold,
                9.0,
                width - right_margin - 10.0,
                y5 - 15.0,
                &format!("FOR  {}", comp_sign_name.to_ascii_uppercase()),
            );
            canvas.draw_right_string(
                PdfFont::HelveticaBold,
                9.0,
                width - right_margin - 10.0,
                bottom_margin + 10.0,
                "Authorised Signatory",
            );
        }
    } else {
        canvas.draw_right_string(
            PdfFont::HelveticaBold,
            9.0,
            width - right_margin - 10.0,
            y5 - 15.0,
            &format!("CONTINUED ON PAGE: {}", page_num + 1),
        );
    }

    // Software credit
    canvas.draw_centered_string(
        PdfFont::Helvetica,
        7.0,
        width / 2.0,
        bottom_margin / 2.0,
        "DIGITALLY GENERATED INVOICE",
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTIMATE / QUOTATION PDF RENDERER
// Reuses InvoiceProductItem, all helpers, and the duplex back page concept.
// Visual differences vs invoice:
//   • Amber (#d97706) header text instead of navy
//   • "ESTIMATE / QUOTATION" title instead of "GST INVOICE"
//   • "Estimate No." / "Valid Until" labels
//   • Diagonal watermark "ESTIMATE" at 8% opacity
//   • GST totals labelled "(Indicative)" in grey
//   • Footer: "Not a tax document. Valid until: {date}"
//   • Duplex back: portal QR omitted for walk-in customers (no ledger_token)
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EstimateRenderData {
    /// Estimate reference number (e.g. "EST-260001")
    pub estimate_no: String,
    /// ISO date string of the estimate creation date
    pub estimate_date: Option<String>,
    /// ISO date string until which the estimate is valid
    pub valid_until: Option<String>,
    /// Optional "RE:" subject line displayed in the header
    #[serde(default)]
    pub subject: String,

    // ── Customer / Party ──────────────────────────────────────────────────────
    pub party_name: String,
    #[serde(default)] pub address: String,
    #[serde(default)] pub phone: String,
    #[serde(default)] pub licence_no: String,
    #[serde(default)] pub pan: String,
    #[serde(default)] pub gstin: String,

    // ── Products ──────────────────────────────────────────────────────────────
    #[serde(default)]
    pub products: Vec<InvoiceProductItem>,

    // ── Totals (pre-calculated by frontend BillCalculator) ───────────────────
    #[serde(default)] pub total_amount: f64,
    #[serde(default)] pub total_discount: f64,
    #[serde(default)] pub total_sgst: f64,
    #[serde(default)] pub total_cgst: f64,
    #[serde(default)] pub round_off: f64,
    #[serde(default)] pub grand_total: f64,

    // ── Terms & Conditions lines ──────────────────────────────────────────────
    #[serde(default)]
    pub terms: Vec<String>,

    // ── Print flags ──────────────────────────────────────────────────────────
    #[serde(default = "default_duplex", deserialize_with = "de_bool_flexible")]
    pub duplex_print: bool,
    #[serde(default)] pub export_mode: bool,

    // ── Customer portal (only present for registered customers) ──────────────
    #[serde(default)] pub customer_id: Option<i64>,
    #[serde(default)] pub customer_ledger_token: Option<String>,

    // ── App settings (company info, bank, UPI — injected by backend) ─────────
    #[serde(default)]
    pub app_settings: std::collections::HashMap<String, String>,
}

/// Colour constant for estimate amber accent
const ESTIMATE_AMBER: &str = "#d97706";

fn render_estimate_sheet(
    canvas: &mut PdfCanvas,
    data: &EstimateRenderData,
    page_products: &[InvoiceProductItem],
    cumulative_products: &[InvoiceProductItem],
    start_item_index: usize,
    page_num: usize,
    total_pages: usize,
) {
    let is_final_page = page_num == total_pages;
    let left_margin = mm_to_pt(5.0);
    let right_margin = mm_to_pt(5.0);
    let bottom_margin = mm_to_pt(5.0);
    let width = canvas.width;
    let height = canvas.height;
    let table_width = width - left_margin - right_margin;

    let column_widths: [f64; 12] = [
        22.0, 155.0, 46.0, 50.0, 70.0, 48.0, 40.0, 60.0, 62.0, 65.0, 60.0, 126.0,
    ];

    // ── Outer border ─────────────────────────────────────────────────────────
    canvas.set_stroke_color(PdfColor::BLACK);
    canvas.set_line_width(1.0);
    canvas.rect(left_margin, bottom_margin, table_width, height - mm_to_pt(10.0), true, false);

    // ── Subtle estimate watermark ────────────────────────────────────────────
    canvas.save_state();
    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.set_alpha(0.035);
    canvas.draw_centered_string(PdfFont::HelveticaBold, 44.0, width * 0.50, height * 0.50, "ESTIMATE");
    canvas.restore_state();

    // ── Header section ────────────────────────────────────────────────────────
    let header_top = height - mm_to_pt(5.0);
    let header_height = mm_to_pt(32.0);
    let left_w = mm_to_pt(98.0);
    let center_w = mm_to_pt(120.0);
    let right_x = left_margin + left_w + center_w;
    let right_w = width - left_margin - right_margin - (left_w + center_w);
    let header_y = header_top - header_height;

    // 3 header boxes
    canvas.rect(left_margin, header_y, left_w, header_height, true, false);
    canvas.rect(left_margin + left_w, header_y, center_w, header_height, true, false);
    canvas.rect(right_x, header_y, right_w, header_height, true, false);

    // Left: Company info
    let company_name = data.app_settings.get("company_name").map(String::as_str).unwrap_or("UTKAL CHEMICAL AUSHADHALAYA");
    let comp_fact_add = data.app_settings.get("company_address_factory").map(String::as_str).unwrap_or("Binaba Marg, Aska, Ganjam, Pin.761110");
    let comp_office_add = data.app_settings.get("company_address_office").map(String::as_str).unwrap_or("D1, Basera Comple,Dumduma,BBSR");
    let comp_phone = data.app_settings.get("company_phone").map(String::as_str).unwrap_or("06822273304 / 943933330");
    let comp_gstin = data.app_settings.get("company_gstin").map(String::as_str).unwrap_or("21AIDPF4446J1ZL");
    let comp_pan = data.app_settings.get("company_pan").map(String::as_str).unwrap_or("AIDPF4446J");

    canvas.set_fill_color(PdfColor::NAVY_BLUE);
    canvas.draw_string(PdfFont::HelveticaBold, 13.0, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(5.0), company_name);
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(11.0), &format!("Factory: {}", comp_fact_add));
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(15.0), &format!("Office: {}", comp_office_add));
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(19.0), &format!("Phone : {}", comp_phone));
    canvas.set_fill_color(PdfColor::NAVY_BLUE);
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(23.0), &format!("GSTIN : {}     PAN : {}", comp_gstin, comp_pan));

    // Centre: ESTIMATE / QUOTATION title (amber)
    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.draw_centered_string(PdfFont::HelveticaBold, 14.0, left_margin + left_w + center_w / 2.0, header_y + header_height - mm_to_pt(8.0), "ESTIMATE / QUOTATION");
    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.draw_centered_string(PdfFont::HelveticaBold, 9.0, left_margin + left_w + center_w / 2.0, header_y + header_height - mm_to_pt(14.0), "NOT A TAX INVOICE");
    canvas.set_fill_color(PdfColor::BLACK);

    // Centre: reference, issue date and validity in a compact three-column grid.
    let table_x = left_margin + left_w;
    let table_y = header_y + mm_to_pt(2.0);
    let table_w = center_w;
    let table_h = mm_to_pt(14.0);
    canvas.rect(table_x, table_y, table_w, table_h, true, false);
    for i in 1..3 {
        let x = table_x + (i as f64) * (table_w / 3.0);
        canvas.line(x, table_y, x, table_y + table_h);
    }
    let cell_w = table_w / 3.0;
    let pad_x = mm_to_pt(1.5);
    let estimate_date = format_date(data.estimate_date.as_deref().unwrap_or(""));
    let valid_until = format_date(data.valid_until.as_deref().unwrap_or(""));
    let meta = [
        ("ESTIMATE NO.", data.estimate_no.as_str()),
        ("ISSUED", estimate_date.as_str()),
        ("VALID UNTIL", valid_until.as_str()),
    ];
    for (index, (label, value)) in meta.iter().enumerate() {
        let cell_x = table_x + index as f64 * cell_w;
        canvas.set_fill_color(PdfColor::hex("#64748b"));
        canvas.draw_string(PdfFont::HelveticaBold, 6.0, cell_x + pad_x, table_y + table_h - mm_to_pt(4.0), label);
        canvas.set_fill_color(if index == 2 { PdfColor::hex(ESTIMATE_AMBER) } else { PdfColor::BLACK });
        canvas.draw_string(PdfFont::HelveticaBold, 7.5, cell_x + pad_x, table_y + mm_to_pt(2.5), value);
    }
    canvas.set_fill_color(PdfColor::BLACK);

    if !data.subject.trim().is_empty() {
        let subject = data.subject.chars().take(48).collect::<String>();
        canvas.draw_centered_string(PdfFont::Helvetica, 7.0, table_x + center_w / 2.0, header_y + header_height - mm_to_pt(20.0), &format!("Subject: {subject}"));
    }

    // Right: customer details
    let party_x = right_x + mm_to_pt(2.0);
    let party_y = header_y + header_height - mm_to_pt(5.0);
    canvas.set_fill_color(PdfColor::hex("#64748b"));
    canvas.draw_string(PdfFont::HelveticaBold, 7.0, party_x, party_y, "CUSTOMER");
    let label_w = canvas.string_width(PdfFont::HelveticaBold, 7.0, "CUSTOMER");
    let mut party_font_size = 8.5;
    let max_party_w = right_w - label_w - 12.0;
    while canvas.string_width(PdfFont::HelveticaBold, party_font_size, &data.party_name) > max_party_w && party_font_size > 4.0 {
        party_font_size -= 0.1;
    }
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.draw_string(PdfFont::HelveticaBold, party_font_size, party_x + label_w + 4.0, party_y, &data.party_name);
    let address_line = data.address.chars().take(55).collect::<String>();
    canvas.draw_string(PdfFont::Helvetica, 7.5, party_x, header_y + header_height - mm_to_pt(11.0), &address_line);
    canvas.draw_string(PdfFont::Helvetica, 7.5, party_x, header_y + header_height - mm_to_pt(16.0), &format!("Phone: {}", data.phone));
    canvas.draw_string(PdfFont::Helvetica, 7.5, party_x, header_y + header_height - mm_to_pt(21.0), &format!("GSTIN: {}", data.gstin));
    let licence_pan = [data.licence_no.as_str(), data.pan.as_str()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("  |  ");
    canvas.draw_string(PdfFont::Helvetica, 7.5, party_x, header_y + header_height - mm_to_pt(26.0), &licence_pan);

    // Separator under header
    canvas.line(left_margin, table_y, width - right_margin, table_y);

    // ── Footer grid setup (identical to invoice) ──────────────────────────────
    let y1 = bottom_margin + 174.0;
    let y2 = bottom_margin + 162.0;
    let y3 = bottom_margin + 112.0;
    let y4 = bottom_margin + 100.0;
    let y5 = bottom_margin + 70.0;

    let vertical_x = left_margin + left_w + center_w;
    let vertical_x2 = width - right_margin - 340.0;

    canvas.line(left_margin, y1, width - right_margin, y1);
    canvas.line(left_margin, y2, width - right_margin, y2);
    canvas.line(left_margin, y3, vertical_x, y3);
    canvas.line(left_margin, y4, vertical_x, y4);
    canvas.line(left_margin, y5, width - right_margin, y5);
    canvas.line(vertical_x, y1, vertical_x, y5);
    canvas.line(vertical_x2, y1, vertical_x2, y4);

    let x_gap = (vertical_x2 - left_margin) / 7.0;
    let equi_xs: Vec<f64> = (1..7).map(|i| left_margin + (i as f64) * x_gap).collect();
    for &x in &equi_xs {
        canvas.line(x, y1, x, y4);
    }

    // ── Column headers ────────────────────────────────────────────────────────
    let header_bottom_line_y = header_y - 12.0;
    canvas.set_fill_color(PdfColor::GRAY_BAR);
    canvas.rect(left_margin, header_bottom_line_y, table_width, 12.0, false, true);
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.line(left_margin, header_bottom_line_y, left_margin + table_width, header_bottom_line_y);

    let table_header_y = header_y - (header_y - header_bottom_line_y) / 2.0 - 4.0;
    let col_titles = [
        "NO.", "PRODUCT", "HSN", "PACK", "BATCH", "EXPIRY",
        "QTY", "MRP", "RATE", "DISCOUNT", "GST", "AMOUNT",
    ];

    let mut x_curr = left_margin;
    canvas.line(left_margin, header_y, left_margin, y1);
    for (i, &w) in column_widths.iter().enumerate() {
        if i < col_titles.len() {
            if i == 1 {
                canvas.draw_string(PdfFont::HelveticaBold, 7.5, x_curr + 3.0, table_header_y, col_titles[i]);
            } else {
                canvas.draw_centered_string(PdfFont::HelveticaBold, 8.0, x_curr + w / 2.0, table_header_y, col_titles[i]);
            }
        }
        x_curr += w;
        if i < column_widths.len() - 1 {
            canvas.line(x_curr, header_y, x_curr, y1);
        }
    }

    // ── Product rows ──────────────────────────────────────────────────────────
    let product_table_top = header_bottom_line_y;
    let product_row_height = 10.0;

    for (row_idx, prod) in page_products.iter().enumerate() {
        let row_bottom = product_table_top - 12.0 - ((row_idx as f64) + 1.0) * product_row_height;
        let y = row_bottom + 3.0;
        if row_idx % 2 == 1 {
            canvas.set_fill_color(PdfColor::hex("#f8fafc"));
            canvas.rect(left_margin, row_bottom, table_width, product_row_height, false, true);
            canvas.set_fill_color(PdfColor::BLACK);
        }
        canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
        canvas.set_line_width(0.35);
        canvas.line(left_margin, row_bottom, left_margin + table_width, row_bottom);
        let exp_str = prod.exp_date.as_deref().unwrap_or("—");
        let name_str = if prod.is_gold { format!("{} (G)", prod.name) } else { prod.name.clone() };
        let discount = (prod.amount + prod.sgst_val + prod.cgst_val - prod.final_amt).max(0.0);
        let tax = prod.sgst_val + prod.cgst_val;

        let row_values = [
            format!("{}", start_item_index + row_idx + 1),
            name_str,
            prod.hsn.clone(),
            prod.pack.clone(),
            prod.batch_no.clone(),
            exp_str.to_string(),
            format!("{:.0}", prod.qty + prod.free),
            format!("{:.2}", prod.mrp),
            format!("{:.2}", prod.rate),
            format!("{:.2}", discount),
            format!("{:.2}", tax),
            format!("{:.2}", prod.final_amt),
        ];

        let mut x_col = left_margin;
        for (col_idx, val) in row_values.iter().enumerate() {
            let col_w = column_widths[col_idx];
            if col_idx == 1 {
                let mut font_size = 8.5;
                let max_w = col_w - 3.0;
                while canvas.string_width(PdfFont::Helvetica, font_size, val) > max_w && font_size > 4.0 {
                    font_size -= 0.1;
                }
                canvas.draw_string(PdfFont::Helvetica, font_size, x_col + 3.0, y, val);
            } else if col_idx <= 6 {
                canvas.draw_centered_string(PdfFont::Helvetica, 7.5, x_col + col_w / 2.0, y, val);
            } else {
                canvas.draw_right_string(PdfFont::Helvetica, 7.5, x_col + col_w - 3.0, y, val);
            }
            x_col += col_w;
        }
    }

    // ── Cumulative footer ─────────────────────────────────────────────────────
    let cumulative_total_amount: f64 = cumulative_products.iter().map(|p| p.amount).sum();
    let cumulative_sgst: f64 = cumulative_products.iter().map(|p| p.sgst_val).sum();
    let cumulative_cgst: f64 = cumulative_products.iter().map(|p| p.cgst_val).sum();
    let cumulative_discount: f64 = if is_final_page {
        data.total_discount
    } else {
        cumulative_products.iter().map(|p| {
            let diff = p.amount + p.sgst_val + p.cgst_val - p.final_amt;
            if diff.abs() > 0.001 && diff > 0.0 { diff }
            else { let d1 = p.amount * (p.dis1 / 100.0); let d2 = (p.amount - d1) * (p.dis2 / 100.0); d1 + d2 }
        }).sum()
    };
    let cumulative_total_gst = cumulative_sgst + cumulative_cgst;
    let (grand_total, round_off) = if is_final_page {
        (data.grand_total, data.round_off)
    } else {
        let unrounded = cumulative_total_amount - cumulative_discount + cumulative_total_gst;
        let rounded = unrounded.round();
        (rounded, rounded - unrounded)
    };

    let col_headers = ["GROSS", "DISCOUNT", "TAXABLE", "SGST", "CGST", "TOTAL TAX"];
    let class_col_widths = [45.0; 6];
    let mut header_x = left_margin + 15.0;
    for (j, header) in col_headers.iter().enumerate() {
        canvas.draw_string(PdfFont::HelveticaBold, 6.5, header_x + 2.0, y2 + 2.0, header);
        header_x += class_col_widths[j];
    }
    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.draw_string(PdfFont::Helvetica, 6.5, left_margin + 15.0, y2 + 10.0, "Tax amounts are estimates and may change on invoicing.");
    canvas.set_fill_color(PdfColor::BLACK);

    let mut tax_groups: Vec<(f64, f64, f64, f64, f64)> = Vec::new();
    for product in cumulative_products {
        let rate = (product.sgst_per + product.cgst_per).round();
        let discount = (product.amount + product.sgst_val + product.cgst_val - product.final_amt).max(0.0);
        let group = tax_groups.iter_mut().find(|group| (group.0 - rate).abs() < 0.01);
        if let Some(group) = group {
            group.1 += product.amount;
            group.2 += discount;
            group.3 += product.sgst_val;
            group.4 += product.cgst_val;
        } else {
            tax_groups.push((rate, product.amount, discount, product.sgst_val, product.cgst_val));
        }
    }
    tax_groups.sort_by(|a, b| a.0.total_cmp(&b.0));
    if tax_groups.len() > 5 {
        let additional = tax_groups.split_off(4);
        let gross = additional.iter().map(|group| group.1).sum();
        let discount = additional.iter().map(|group| group.2).sum();
        let sgst = additional.iter().map(|group| group.3).sum();
        let cgst = additional.iter().map(|group| group.4).sum();
        tax_groups.push((-1.0, gross, discount, sgst, cgst));
    }
    let gst_col_xs = vec![equi_xs[1], equi_xs[2], equi_xs[3], equi_xs[4], equi_xs[5], vertical_x2];
    let row_count = tax_groups.len().max(1);
    let row_height = (y2 - y3 - 20.0) / row_count as f64;
    for (index, group) in tax_groups.iter().enumerate() {
        let y = y2 - 10.0 - (index as f64 + 0.5) * row_height;
        let label = if group.0 < 0.0 { "OTHER GST".to_string() } else { format!("GST {:.0}%", group.0) };
        canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin + 5.0, y, &label);
        let taxable = group.1 - group.2;
        let values = [group.1, group.2, taxable, group.3, group.4, group.3 + group.4];
        for (value, &x) in values.iter().zip(&gst_col_xs) {
            canvas.draw_right_string(PdfFont::Helvetica, 7.5, x - 4.0, y, &format_money(*value));
        }
    }

    let total_row_y = y3 + 5.0;
    let total_row_values = [
        cumulative_total_amount,
        cumulative_discount,
        cumulative_total_amount - cumulative_discount,
        cumulative_sgst,
        cumulative_cgst,
        cumulative_total_gst,
    ];
    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin + 5.0, total_row_y, "TOTAL");
    for (value, &gx) in total_row_values.iter().zip(&gst_col_xs) {
        canvas.draw_right_string(PdfFont::HelveticaBold, 7.5, gx - 4.0, total_row_y, &format_money(*value));
    }
    canvas.set_fill_color(PdfColor::BLACK);

    let dis_amt_y = (y1 + y2) / 2.0 - 3.5;
    canvas.draw_string(PdfFont::Helvetica, 10.0, vertical_x2 + 40.0, dis_amt_y, &format_money(cumulative_discount));
    canvas.draw_string(PdfFont::Helvetica, 10.0, vertical_x2 + 100.0, dis_amt_y, "0.00");

    // Amount in words
    canvas.draw_string(PdfFont::HelveticaBold, 9.0, left_margin + 15.0, y4 + 1.5, "TOTAL");
    let amount_words = format!("Rs. {}", amount_in_indian_words(grand_total));
    canvas.draw_string(PdfFont::HelveticaBold, 8.5, left_margin + 15.0, y4 + (y5 - y4) / 2.0 - 4.5, &amount_words);

    // Right summary
    let items_x = vertical_x2 + 10.0;
    let items_y = y3 + (y2 - y3) / 2.0;
    canvas.draw_string(PdfFont::Helvetica, 9.0, items_x, items_y + 6.0, &format!("Total Items :-     {}", cumulative_products.len()));
    let total_qty: f64 = cumulative_products.iter().map(|p| p.qty + p.free).sum();
    canvas.draw_string(PdfFont::Helvetica, 9.0, items_x, items_y - 6.0, &format!("Total Qty  :-     {:.2}", total_qty));

    let right_labels = [
        ("DIS AMT.", format!("{:.2}", cumulative_discount)),
        ("SGST", format!("{:.2}", cumulative_sgst)),
        ("CGST", format!("{:.2}", cumulative_cgst)),
        ("CR/DR NOTE", "0.00".to_string()),
        ("ROUND OFF", format!("{:.2}", round_off)),
    ];
    let label_x = vertical_x + 10.0;
    let value_x = width - right_margin - 10.0;
    for (i, (label, value)) in right_labels.iter().enumerate() {
        let y = y2 - 15.0 - (i as f64 * 12.0);
        canvas.draw_string(PdfFont::HelveticaBold, 8.0, label_x, y, label);
        canvas.draw_right_string(PdfFont::HelveticaBold, 8.5, value_x, y, value);
    }

    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.draw_string(PdfFont::HelveticaBold, 14.0, label_x, y5 + 15.0, "Estimated Total");
    canvas.draw_right_string(PdfFont::HelveticaBold, 13.0, value_x, y5 + 15.0, &format_money(grand_total));
    canvas.set_fill_color(PdfColor::BLACK);

    let total_label_y = (y1 + y2) / 2.0 - 3.5;
    canvas.draw_string(PdfFont::HelveticaBold, 10.0, label_x, total_label_y, "TOTAL:");
    canvas.draw_right_string(PdfFont::HelveticaBold, 10.0, value_x, total_label_y, &format_money(cumulative_total_amount));

    // ── Footer notes / terms ──────────────────────────────────────────────────
    let note_y = y5 - 10.0;
    // Keep the legal status in the header; terms here describe the quote itself.
    let default_notes = [
        "Prices and availability are subject to confirmation.",
        "Orders are binding only after written acceptance.",
    ];
    // Use custom terms if provided, else use defaults
    let notes_to_show: Vec<&str> = if data.terms.is_empty() {
        default_notes.iter().map(|s| *s).collect()
    } else {
        data.terms.iter().map(|s| s.as_str()).collect()
    };

    for (i, note) in notes_to_show.iter().enumerate() {
        canvas.draw_string(PdfFont::Helvetica, 8.0, left_margin + 10.0, note_y - (i as f64 * 11.0), note);
    }

    // Valid-until amber notice box
    if is_final_page {
        let valid_str = format_date(data.valid_until.as_deref().unwrap_or(""));
        let notice = if valid_str.is_empty() {
            "This estimate does not have a specified validity date.".to_string()
        } else {
            format!("Valid Until: {} — Subject to availability & price change.", valid_str)
        };
        let notice_y = note_y - (notes_to_show.len() as f64 * 11.0) - 14.0;
        canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
        canvas.set_alpha(0.12);
        canvas.round_rect(left_margin + 8.0, notice_y - 4.0, mm_to_pt(92.0), 14.0, 3.0, false, true);
        canvas.set_alpha(1.0);
        canvas.set_fill_color(PdfColor::hex("#92400e"));
        canvas.draw_string(PdfFont::HelveticaBold, 8.0, left_margin + 14.0, notice_y, &notice);
        canvas.set_fill_color(PdfColor::BLACK);
    }

    // Bottom-right: Signature area / continuation
    let comp_sign_name = data.app_settings.get("company_name").map(String::as_str).unwrap_or("UTKAL CHEMICAL AUSHADHALAYA");
    if is_final_page {
        canvas.draw_right_string(PdfFont::HelveticaBold, 9.0, width - right_margin - 10.0, y5 - 15.0, &format!("FOR  {}", comp_sign_name.to_ascii_uppercase()));
        canvas.draw_right_string(PdfFont::HelveticaBold, 9.0, width - right_margin - 10.0, bottom_margin + 10.0, "Authorised Signatory");
    } else {
        canvas.draw_right_string(PdfFont::HelveticaBold, 9.0, width - right_margin - 10.0, y5 - 15.0, &format!("CONTINUED ON PAGE: {}", page_num + 1));
    }

    canvas.draw_centered_string(PdfFont::Helvetica, 7.0, width / 2.0, bottom_margin / 2.0, "ESTIMATE / QUOTATION");
}

/// Duplex back page for estimate (portrait A4).
/// For registered customers: shows payment QR + portal QR (same as invoice).
/// For walk-in customers (no ledger_token): shows company contact info only.
fn render_estimate_back_page(canvas: &mut PdfCanvas, data: &EstimateRenderData) -> Result<(), String> {
    let page_width = 595.28;
    let page_height = 841.89;
    canvas.new_page_with_size(page_width, page_height);

    let is_registered = data.customer_ledger_token.as_deref().filter(|t| !t.is_empty()).is_some();

    let sidebar_width = mm_to_pt(75.0);
    // Sidebar background
    canvas.set_fill_color(PdfColor::hex("#f3f4f6"));
    canvas.rect(0.0, 0.0, sidebar_width, page_height, false, true);

    // Subtle amber accent curves in sidebar (estimate branding)
    canvas.save_state();
    canvas.set_stroke_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.set_line_width(1.2);
    canvas.set_alpha(0.10);
    canvas.move_to(-53.15, page_height - 52.62);
    canvas.curve_to(159.45, page_height - 210.47, -53.15, page_height - 368.33, 159.45, page_height - 526.18);
    canvas.curve_to(372.05, page_height - 684.04, -53.15, page_height - 841.89, 159.45, page_height - 999.74);
    canvas.stroke();
    canvas.set_line_width(0.8);
    canvas.set_alpha(0.07);
    canvas.move_to(265.75, page_height + 52.62);
    canvas.curve_to(53.15, page_height - 105.24, 318.90, page_height - 263.09, 106.30, page_height - 420.94);
    canvas.curve_to(-106.30, page_height - 578.80, 318.90, page_height - 736.65, 53.15, page_height - 894.51);
    canvas.stroke();
    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.set_alpha(0.12);
    canvas.circle(31.89, page_height - 157.85, 3.19, false, true);
    canvas.set_alpha(0.15);
    canvas.circle(180.71, page_height - 473.56, 4.25, false, true);
    canvas.set_alpha(0.10);
    canvas.circle(53.15, page_height - 684.04, 2.66, false, true);
    canvas.restore_state();

    let logo_x = sidebar_width / 2.0;
    let logo_y = page_height - mm_to_pt(25.0) - 15.0;

    // Amber chevron logo
    canvas.save_state();
    canvas.set_stroke_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.set_line_width(2.0);
    canvas.move_to(logo_x, logo_y + 12.5);
    canvas.line_to(logo_x - 12.5, logo_y + 6.25);
    canvas.line_to(logo_x, logo_y);
    canvas.line_to(logo_x + 12.5, logo_y + 6.25);
    canvas.close_path();
    canvas.move_to(logo_x - 12.5, logo_y - 6.25);
    canvas.line_to(logo_x, logo_y - 12.5);
    canvas.line_to(logo_x + 12.5, logo_y - 6.25);
    canvas.move_to(logo_x - 12.5, logo_y);
    canvas.line_to(logo_x, logo_y - 6.25);
    canvas.line_to(logo_x + 12.5, logo_y);
    canvas.stroke();
    canvas.restore_state();

    let qr_box_size = mm_to_pt(42.0) + 16.0;
    let qr_x = (sidebar_width - qr_box_size) / 2.0;
    let qr_inner_size = mm_to_pt(42.0);

    if is_registered {
        // ── Payment QR ───────────────────────────────────────────────────────
        let payment_title_y = page_height - mm_to_pt(59.0);
        canvas.set_fill_color(PdfColor::hex("#1e293b"));
        canvas.draw_centered_spaced_string(PdfFont::HelveticaBold, 8.5, logo_x, payment_title_y, "PAYMENT QR", 2.0);

        let payment_box_y = payment_title_y - 12.0 - qr_box_size;
        canvas.set_fill_color(PdfColor::WHITE);
        canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
        canvas.set_line_width(0.75);
        canvas.round_rect(qr_x, payment_box_y, qr_box_size, qr_box_size, 10.0, true, true);

        // Build minimal payment URI for estimate (no invoice number in note)
        let upi_id = data.app_settings.get("payment_upi_id").cloned()
            .filter(|v| !v.is_empty()).unwrap_or_else(default_upi_id);
        let comp_name = data.app_settings.get("company_name").map(String::as_str).unwrap_or("Utkal Chemical Aushadhalaya");
        let payment_uri = if upi_id.starts_with("upi://") {
            upi_id.clone()
        } else {
            format!("upi://pay?pa={}&pn={}&cu=INR&am={:.2}&tn={}",
                percent_encode(&upi_id),
                percent_encode(comp_name),
                data.grand_total,
                percent_encode(&format!("Est:{}", data.estimate_no))
            )
        };
        draw_qr(canvas, &payment_uri, qr_x + 8.0, payment_box_y + 8.0, qr_inner_size)?;

        let display_upi = upi_id.split("?pa=").nth(1)
            .and_then(|q| q.split('&').next())
            .unwrap_or(&upi_id).to_string();
        canvas.set_fill_color(PdfColor::hex("#475569"));
        canvas.draw_centered_spaced_string(PdfFont::HelveticaBold, 8.0, logo_x, payment_box_y - 18.0, &format!("UPI: {}", display_upi), 0.5);
        canvas.draw_centered_string(PdfFont::Helvetica, 7.5, logo_x, payment_box_y - 30.0, &format!("Estimate Amt: Rs. {}", format_money(data.grand_total)));

        if data.export_mode {
            let btn_w = 85.0; let btn_h = 16.0;
            let btn_x = logo_x - (btn_w / 2.0);
            let btn_y = (payment_box_y - 78.0) - (btn_h / 2.0);
            canvas.save_state();
            canvas.set_fill_color(PdfColor::hex("#1e293b"));
            canvas.round_rect(btn_x, btn_y, btn_w, btn_h, 4.0, false, true);
            canvas.set_fill_color(PdfColor::WHITE);
            canvas.draw_centered_string(PdfFont::HelveticaBold, 7.0, logo_x, btn_y + 4.5, "PAY VIA UPI APP");
            canvas.restore_state();
            canvas.add_link_annotation(btn_x, btn_y, btn_w, btn_h, &payment_uri);
            canvas.add_link_annotation(qr_x, payment_box_y, qr_box_size, qr_box_size, &payment_uri);
        }

        // ── Portal QR ────────────────────────────────────────────────────────
        let portal_title_y = payment_box_y - 18.0 - mm_to_pt(35.0);
        canvas.set_fill_color(PdfColor::hex("#1e293b"));
        canvas.draw_centered_spaced_string(PdfFont::HelveticaBold, 8.5, logo_x, portal_title_y, "PORTAL ACCESS", 2.0);
        let portal_box_y = portal_title_y - 12.0 - qr_box_size;
        canvas.set_fill_color(PdfColor::WHITE);
        canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
        canvas.set_line_width(0.75);
        canvas.round_rect(qr_x, portal_box_y, qr_box_size, qr_box_size, 10.0, true, true);

        let portal_base = data.app_settings.get("portal_base_url").filter(|v| !v.is_empty()).cloned().unwrap_or_else(default_portal_url);
        let portal_uri = if let Some(token) = data.customer_ledger_token.as_deref().filter(|t| !t.is_empty()) {
            format!("{}/ledger/{}", portal_base.trim_end_matches('/'), token)
        } else if let Some(id) = data.customer_id {
            format!("{}/customer-ledger.html?id={}", portal_base.trim_end_matches('/'), id)
        } else {
            portal_base.clone()
        };
        draw_qr(canvas, &portal_uri, qr_x + 8.0, portal_box_y + 8.0, qr_inner_size)?;
        canvas.set_fill_color(PdfColor::hex("#475569"));
        canvas.draw_centered_spaced_string(PdfFont::HelveticaBold, 8.0, logo_x, portal_box_y - 18.0, "SCAN TO OPEN", 0.5);
        if data.export_mode {
            canvas.add_link_annotation(qr_x, portal_box_y, qr_box_size, qr_box_size, &portal_uri);
        }
    } else {
        // ── Walk-in: Company contact info instead of QR codes ────────────────
        let info_y = page_height - mm_to_pt(55.0);
        canvas.set_fill_color(PdfColor::hex("#1e293b"));
        canvas.draw_centered_spaced_string(PdfFont::HelveticaBold, 8.5, logo_x, info_y, "CONTACT US", 2.0);

        let comp_name = data.app_settings.get("company_name").map(String::as_str).unwrap_or("UTKAL CHEMICAL AUSHADHALAYA");
        let comp_phone = data.app_settings.get("company_phone").map(String::as_str).unwrap_or("");
        let comp_gstin = data.app_settings.get("company_gstin").map(String::as_str).unwrap_or("");

        let contact_lines = [
            comp_name,
            comp_phone,
            comp_gstin,
            "To place an order or confirm this",
            "estimate, contact us directly.",
        ];
        let mut cy = info_y - 18.0;
        for line in &contact_lines {
            if !line.is_empty() {
                canvas.set_fill_color(PdfColor::hex("#334155"));
                canvas.draw_centered_string(PdfFont::Helvetica, 8.0, logo_x, cy, line);
                cy -= 14.0;
            }
        }
    }

    // ── Main content area (right panel) ──────────────────────────────────────
    let main_left = sidebar_width;
    let main_width = page_width - sidebar_width;
    canvas.set_fill_color(PdfColor::WHITE);
    canvas.rect(main_left, 0.0, main_width, page_height, false, true);

    let main_padding = main_left + mm_to_pt(12.0);
    let content_width = main_width - mm_to_pt(24.0);
    let mut cur_main_y = page_height - mm_to_pt(18.0);

    // Header block
    cur_main_y -= 26.0;
    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.draw_spaced_string(PdfFont::HelveticaBold, 26.0, main_padding, cur_main_y, "ESTIMATE", 4.0);
    cur_main_y -= 10.0;
    canvas.set_fill_color(PdfColor::hex("#334155"));
    canvas.draw_spaced_string(PdfFont::Helvetica, 9.0, main_padding, cur_main_y, "QUOTATION DETAILS", 2.0);

    // Estimate No + Valid Until
    cur_main_y -= 20.0;
    let w_est = canvas.string_width(PdfFont::Helvetica, 8.5, "ESTIMATE NO.: ");
    canvas.set_fill_color(PdfColor::hex("#888888"));
    canvas.draw_string(PdfFont::Helvetica, 8.5, main_padding, cur_main_y, "ESTIMATE NO.: ");
    canvas.set_fill_color(PdfColor::hex("#111111"));
    canvas.draw_string(PdfFont::HelveticaBold, 8.5, main_padding + w_est, cur_main_y, &data.estimate_no);

    let valid_str = format_date(data.valid_until.as_deref().unwrap_or(""));
    if !valid_str.is_empty() {
        let date_lbl = "VALID UNTIL: ";
        let w_d_val = canvas.string_width(PdfFont::HelveticaBold, 8.5, &valid_str);
        let w_d_lbl = canvas.string_width(PdfFont::Helvetica, 8.5, date_lbl);
        let rx = main_padding + content_width - w_d_val - w_d_lbl;
        canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
        canvas.draw_string(PdfFont::Helvetica, 8.5, rx, cur_main_y, date_lbl);
        canvas.set_fill_color(PdfColor::hex("#111111"));
        canvas.draw_string(PdfFont::HelveticaBold, 8.5, rx + w_d_lbl, cur_main_y, &valid_str);
    }

    // Section 1: Terms summary or default terms on back page
    cur_main_y -= mm_to_pt(22.0);
    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    let title_s1 = "TERMS & CONDITIONS";
    canvas.draw_spaced_string(PdfFont::HelveticaBold, 13.0, main_padding, cur_main_y, title_s1, 1.0);
    let w_ts1 = canvas.string_width_spaced(PdfFont::HelveticaBold, 13.0, title_s1, 1.0);
    canvas.set_stroke_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.set_line_width(2.0);
    canvas.line(main_padding, cur_main_y - 3.75, main_padding + w_ts1, cur_main_y - 3.75);

    cur_main_y -= 3.75 + 11.25 + 10.0;
    let terms_to_show: Vec<&str> = if data.terms.is_empty() {
        vec![
            "1. Prices are indicative and subject to change without notice.",
            "2. GST charges will be applied as per prevailing rates at time of billing.",
            "3. This estimate is valid for the period mentioned above.",
            "4. Delivery timelines are subject to stock availability.",
            "5. Payment terms as per mutual agreement.",
        ]
    } else {
        data.terms.iter().map(|s| s.as_str()).collect()
    };

    for term in &terms_to_show {
        canvas.set_fill_color(PdfColor::hex("#444444"));
        canvas.draw_string(PdfFont::Helvetica, 9.5, main_padding, cur_main_y, term);
        cur_main_y -= 16.0;
    }

    // Section 2: Not a tax invoice disclaimer
    cur_main_y -= mm_to_pt(15.0);
    canvas.set_fill_color(PdfColor::hex("#0f172a"));
    let title_s2 = "IMPORTANT NOTICE";
    canvas.draw_spaced_string(PdfFont::HelveticaBold, 13.0, main_padding, cur_main_y, title_s2, 1.0);
    let w_ts2 = canvas.string_width_spaced(PdfFont::HelveticaBold, 13.0, title_s2, 1.0);
    canvas.set_stroke_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.set_line_width(2.0);
    canvas.line(main_padding, cur_main_y - 3.75, main_padding + w_ts2, cur_main_y - 3.75);

    cur_main_y -= 3.75 + 11.25 + 10.0;
    let box_h = 50.0;
    let box_y = cur_main_y - box_h;
    canvas.set_fill_color(PdfColor::hex("#fffbeb"));
    canvas.rect(main_padding, box_y, content_width, box_h, false, true);
    canvas.set_fill_color(PdfColor::hex(ESTIMATE_AMBER));
    canvas.rect(main_padding, box_y, 4.0, box_h, false, true);
    canvas.set_fill_color(PdfColor::hex("#92400e"));
    canvas.draw_string(PdfFont::HelveticaBold, 9.5, main_padding + 12.0, box_y + 36.0, "This document is an ESTIMATE / QUOTATION only.");
    canvas.set_fill_color(PdfColor::hex("#444444"));
    canvas.draw_string(PdfFont::Helvetica, 8.5, main_padding + 12.0, box_y + 22.0, "It does NOT constitute a Tax Invoice under the GST Act.");
    canvas.draw_string(PdfFont::Helvetica, 8.5, main_padding + 12.0, box_y + 10.0, "A GST Tax Invoice will be issued at the time of actual supply.");

    Ok(())
}

/// Render an Estimate/Quotation PDF (A4-landscape sheets + optional portrait duplex page).
pub fn render_estimate_pdf(data: &EstimateRenderData) -> Result<Vec<u8>, String> {
    let mut canvas = PdfCanvas::new_a4_landscape();

    let total_items = data.products.len();
    let total_pages = if total_items == 0 { 1 } else { total_items.div_ceil(PAGE_ITEM_LIMIT) };

    for page_idx in 0..total_pages {
        let page_num = page_idx + 1;
        if page_idx > 0 { canvas.new_page(); }
        let start_idx = page_idx * PAGE_ITEM_LIMIT;
        let end_idx = (start_idx + PAGE_ITEM_LIMIT).min(total_items);
        let page_products = &data.products[start_idx..end_idx];
        let cumulative_products = &data.products[0..end_idx];
        render_estimate_sheet(&mut canvas, data, page_products, cumulative_products, start_idx, page_num, total_pages);
    }

    if data.duplex_print {
        render_estimate_back_page(&mut canvas, data)?;
    }

    Ok(canvas.build_pdf())
}

/// Render an invoice and optional duplex page into standard PDF 1.4 bytes.
pub fn render_invoice_pdf(data: &InvoiceRenderData) -> Result<Vec<u8>, String> {
    let mut canvas = PdfCanvas::new_a4_landscape();

    let total_items = data.products.len();
    let total_pages = if total_items == 0 {
        1
    } else {
        total_items.div_ceil(PAGE_ITEM_LIMIT)
    };

    for page_idx in 0..total_pages {
        let page_num = page_idx + 1;
        if page_idx > 0 {
            canvas.new_page();
        }
        let start_idx = page_idx * PAGE_ITEM_LIMIT;
        let end_idx = (start_idx + PAGE_ITEM_LIMIT).min(total_items);
        let page_products = &data.products[start_idx..end_idx];
        let cumulative_products = &data.products[0..end_idx];

        render_invoice_sheet(
            &mut canvas,
            data,
            page_products,
            cumulative_products,
            start_idx,
            page_num,
            total_pages,
        );
    }

    if data.duplex_print {
        render_duplex_back_page(&mut canvas, data)?;
    }

    Ok(canvas.build_pdf())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_sample_item(index: usize, amount: f64) -> InvoiceProductItem {
        InvoiceProductItem {
            name: format!("PRODUCT ITEM {index}"),
            hsn: "30049011".to_string(),
            mfg: "FINI".to_string(),
            pack: "10 TAB".to_string(),
            batch_no: format!("B-{:04}", index),
            exp_date: Some("2028-12-31".to_string()),
            qty: 10.0,
            free: 0.0,
            mrp: amount / 10.0 + 2.0,
            rate: amount / 10.0,
            amount,
            dis1: 5.0,
            dis2: 0.0,
            sgst_per: 6.0,
            sgst_val: amount * 0.057,
            cgst_per: 6.0,
            cgst_val: amount * 0.057,
            final_amt: amount * 0.95 + amount * 0.114,
            is_gold: false,
        }
    }

    #[test]
    fn test_multipage_cumulative_and_continuation_flow() {
        let mut products = Vec::new();
        // 60 items -> Page 1 (29), Page 2 (29), Page 3 (2)
        for i in 1..=60 {
            products.push(create_sample_item(i, 100.0));
        }

        let total_amt: f64 = products.iter().map(|p| p.amount).sum();
        let total_sgst: f64 = products.iter().map(|p| p.sgst_val).sum();
        let total_cgst: f64 = products.iter().map(|p| p.cgst_val).sum();
        let total_disc: f64 = products
            .iter()
            .map(|p| p.amount + p.sgst_val + p.cgst_val - p.final_amt)
            .sum();
        let grand = total_amt - total_disc + total_sgst + total_cgst;

        let invoice_data = InvoiceRenderData {
            invoice_no: "INV-MULTI-001".to_string(),
            invoice_date: Some("2026-10-07".to_string()),
            due_date: Some("2026-11-07".to_string()),
            lr_no: None,
            lr_date: None,
            party_name: "TEST MEDICAL STORE".to_string(),
            address: "BHUBANESWAR ODISHA".to_string(),
            phone: "9988776655".to_string(),
            licence_no: "LIC-123".to_string(),
            pan: "PAN123".to_string(),
            gstin: "21GSTIN123".to_string(),
            total_amount: total_amt,
            total_discount: total_disc,
            total_sgst,
            total_cgst,
            round_off: 0.0,
            grand_total: grand.round(),
            previous_due: 500.0,
            products,
            duplex_print: true,
            export_mode: true,
            app_settings: HashMap::new(),
            customer_ledger_token: None,
            invoice_ledger_ref: None,
            customer_id: Some(10),
            i_customer_id: None,
            bank_account_holder: None,
            bank_account_number: None,
            bank_ifsc: None,
            bank_branch: None,
        };

        let pdf = render_invoice_pdf(&invoice_data).expect("Should render multipage invoice");
        let pdf_str = String::from_utf8_lossy(&pdf);

        // 3 landscape pages + 1 portrait duplex = 4 pages
        assert_eq!(pdf_str.matches("/Type /Page ").count(), 4);
        assert_eq!(pdf_str.matches("/MediaBox [0 0 841.89 595.28]").count(), 3);
        assert_eq!(pdf_str.matches("/MediaBox [0 0 595.28 841.89]").count(), 1);

        // Page 1 and 2 continuation notices replacing signature
        assert!(pdf_str.contains("CONTINUED ON PAGE: 2"));
        assert!(pdf_str.contains("CONTINUED ON PAGE: 3"));
        assert!(!pdf_str.contains("CONTINUED ON PAGE: 4"));

        // Last invoice page has authority signature
        assert!(pdf_str.contains("FOR  UTKAL CHEMICAL AUSHADHALAYA"));
        assert!(pdf_str.contains("Authorised Signatory"));

        // Cumulative values:
        // Page 1 (29 items x 100 = 2,900.00)
        assert!(pdf_str.contains("2,900.00"));
        // Page 2 (58 items x 100 = 5,800.00)
        assert!(pdf_str.contains("5,800.00"));
        // Page 3 (60 items x 100 = 6,000.00)
        assert!(pdf_str.contains("6,000.00"));

        // Duplex elements
        assert!(pdf_str.contains("BANK TRANSFER DETAILS"));
        assert!(pdf_str.contains("CUSTOMER PORTAL"));
        assert!(pdf_str.contains("(01) Tj"));
        assert!(pdf_str.contains("(02) Tj"));
        assert!(pdf_str.contains("PAY VIA UPI APP"));
    }

    #[test]
    fn test_invoice_with_dues_widget_and_auto_sign_disclaimer() {
        let mut app_settings = HashMap::new();
        app_settings.insert("company_gstin".to_string(), "21AIDPF4446J1ZL".to_string());
        app_settings.insert("company_pan".to_string(), "AIDPF4446J".to_string());
        app_settings.insert("invoice_show_dues_widget".to_string(), "true".to_string());
        app_settings.insert("invoice_auto_sign_disclaimer".to_string(), "true".to_string());

        let invoice_data = InvoiceRenderData {
            invoice_no: "GST-2026-99".to_string(),
            invoice_date: Some("2026-10-07".to_string()),
            due_date: None,
            lr_no: None,
            lr_date: None,
            party_name: "SHREE GANESH PHARMA".to_string(),
            address: "CUTTACK ROAD, BBSR".to_string(),
            phone: "9439123456".to_string(),
            licence_no: "DL-1234".to_string(),
            pan: "BCDEF2345G".to_string(),
            gstin: "21BCDEF2345G1Z9".to_string(),
            total_amount: 1500.0,
            total_discount: 50.0,
            total_sgst: 87.0,
            total_cgst: 87.0,
            round_off: 0.0,
            grand_total: 1624.0,
            previous_due: 4500.0,
            products: vec![create_sample_item(1, 1500.0)],
            duplex_print: false,
            export_mode: true,
            app_settings,
            customer_ledger_token: None,
            invoice_ledger_ref: None,
            customer_id: Some(42),
            i_customer_id: None,
            bank_account_holder: None,
            bank_account_number: None,
            bank_ifsc: None,
            bank_branch: None,
        };

        let pdf = render_invoice_pdf(&invoice_data).expect("Must render invoice with dues widget");
        let pdf_str = String::from_utf8_lossy(&pdf);

        // Dynamic GST and PAN
        assert!(pdf_str.contains("GSTIN : 21AIDPF4446J1ZL     PAN : AIDPF4446J"));

        // Dues widget with quick pay QR & app button
        assert!(pdf_str.contains("OUTSTANDING DUES & QUICK PAY"));
        assert!(pdf_str.contains("Total Due: Rs. 6,124.00"));
        assert!(pdf_str.contains("PAY VIA UPI APP"));

        // Computer generated document disclaimer
        assert!(pdf_str.contains("COMPUTER GENERATED TAX INVOICE"));
        assert!(pdf_str.contains("Authenticated Document • No Signature Required"));
        assert!(pdf_str.contains("CGST Rule 46 Proviso & Information Technology Act"));
        assert!(pdf_str.contains("DIGITALLY GENERATED INVOICE"));
        assert!(!pdf_str.contains("MARG"));
    }

    #[test]
    fn test_invoice_classic_signature_and_no_qr_mode() {
        let mut app_settings = HashMap::new();
        app_settings.insert("invoice_authority_sign_no_qr".to_string(), "true".to_string());
        app_settings.insert("invoice_auto_sign_disclaimer".to_string(), "true".to_string());
        app_settings.insert("invoice_show_dues_widget".to_string(), "true".to_string());

        let invoice_data = InvoiceRenderData {
            invoice_no: "GST-2026-101".to_string(),
            invoice_date: Some("2026-10-07".to_string()),
            due_date: None,
            lr_no: None,
            lr_date: None,
            party_name: "MAHAVIR MEDICAL STORE".to_string(),
            address: "MAIN ROAD, ASKA".to_string(),
            phone: "9876543210".to_string(),
            licence_no: "DL-5566".to_string(),
            pan: "BCDEF2345G".to_string(),
            gstin: "21BCDEF2345G1Z9".to_string(),
            total_amount: 2500.0,
            total_discount: 0.0,
            total_sgst: 150.0,
            total_cgst: 150.0,
            round_off: 0.0,
            grand_total: 2800.0,
            previous_due: 3500.0,
            products: vec![create_sample_item(1, 2500.0)],
            duplex_print: false,
            export_mode: false,
            app_settings,
            customer_ledger_token: None,
            invoice_ledger_ref: None,
            customer_id: Some(15),
            i_customer_id: None,
            bank_account_holder: None,
            bank_account_number: None,
            bank_ifsc: None,
            bank_branch: None,
        };

        let pdf = render_invoice_pdf(&invoice_data).expect("Must render invoice in classic mode");
        let pdf_str = String::from_utf8_lossy(&pdf);

        // Usual authority signature MUST be present
        assert!(pdf_str.contains("Authorised Signatory"));
        assert!(pdf_str.contains("FOR  UTKAL CHEMICAL AUSHADHALAYA"));

        // Dues widget and payment QR MUST NOT be present
        assert!(!pdf_str.contains("OUTSTANDING DUES & QUICK PAY"));
        assert!(!pdf_str.contains("PAY VIA UPI APP"));

        // Auto-sign notice MUST NOT be present
        assert!(!pdf_str.contains("COMPUTER GENERATED TAX INVOICE"));
        assert!(!pdf_str.contains("Authenticated Document • No Signature Required"));
    }

    #[test]
    fn test_estimate_pdf_uses_quote_layout_and_groups_actual_tax_rates() {
        let mut five_percent = create_sample_item(1, 100.0);
        five_percent.sgst_per = 2.5;
        five_percent.cgst_per = 2.5;
        five_percent.sgst_val = 2.5;
        five_percent.cgst_val = 2.5;
        five_percent.final_amt = 104.0;

        let mut eighteen_percent = create_sample_item(2, 100.0);
        eighteen_percent.dis1 = 0.0;
        eighteen_percent.sgst_per = 9.0;
        eighteen_percent.cgst_per = 9.0;
        eighteen_percent.sgst_val = 9.0;
        eighteen_percent.cgst_val = 9.0;
        eighteen_percent.final_amt = 118.0;

        let estimate = EstimateRenderData {
            estimate_no: "EST-260042".to_string(),
            estimate_date: Some("2026-10-23".to_string()),
            valid_until: Some("2026-11-22".to_string()),
            subject: "Supply quotation".to_string(),
            party_name: "TEST CUSTOMER".to_string(),
            address: "1 SAMPLE STREET".to_string(),
            phone: "9000000000".to_string(),
            licence_no: "DL-123".to_string(),
            pan: "ABCDE1234F".to_string(),
            gstin: "21ABCDE1234F1Z5".to_string(),
            products: vec![five_percent, eighteen_percent],
            total_amount: 200.0,
            total_discount: 1.0,
            total_sgst: 11.5,
            total_cgst: 11.5,
            round_off: 0.0,
            grand_total: 222.0,
            terms: Vec::new(),
            duplex_print: false,
            export_mode: false,
            customer_id: Some(7),
            customer_ledger_token: None,
            app_settings: HashMap::new(),
        };

        let pdf = render_estimate_pdf(&estimate).expect("Estimate PDF should render");
        let pdf_text = String::from_utf8_lossy(&pdf);
        assert_eq!(pdf_text.matches("/Type /Page ").count(), 1);
        assert!(pdf_text.contains("ESTIMATE / QUOTATION"));
        assert!(pdf_text.contains("EST-260042"));
        assert!(pdf_text.contains("GST 5%"));
        assert!(pdf_text.contains("GST 18%"));
        assert!(pdf_text.contains("Prices and availability are subject to confirmation."));
        assert!(!pdf_text.contains("Indicative — GST values for reference only"));
        assert!(!pdf_text.contains("MFG"));
    }
}
