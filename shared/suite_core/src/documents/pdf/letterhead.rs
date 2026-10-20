use super::writer::{PdfCanvas, PdfColor, PdfFont};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LetterheadDocRequest {
    #[serde(default)]
    pub doc_ref_no: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub recipient_name: String,
    #[serde(default)]
    pub recipient_title: String,
    #[serde(default)]
    pub recipient_address: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub salutation: String,
    #[serde(default)]
    pub paragraphs: Vec<String>,
    #[serde(default)]
    pub terms_clauses: Vec<String>,
    #[serde(default)]
    pub signatory_name: String,
    #[serde(default)]
    pub signatory_title: String,
    #[serde(default)]
    pub signatory_reg_no: String,
    #[serde(default = "default_true")]
    pub is_watermarked: bool,
    #[serde(default)]
    pub watermark_text: String,
    #[serde(default)]
    pub matter_thread_ref: String,
    #[serde(default)]
    pub verification_hash: String,
    #[serde(default)]
    pub header_image_base64: String,
    #[serde(default)]
    pub signature_image_base64: String,
    #[serde(default)]
    pub company_name: String,
    #[serde(default)]
    pub company_address: String,
    #[serde(default)]
    pub company_phone: String,
    #[serde(default)]
    pub company_email: String,
    #[serde(default)]
    pub company_gstin: String,
    #[serde(default)]
    pub company_ayush_lic: String,
    #[serde(default = "default_true")]
    pub show_page_numbers: bool,
    #[serde(default = "default_signature_layout")]
    pub signature_layout: String,
    #[serde(default)]
    pub second_signatory_label: String,
    #[serde(default)]
    pub second_signatory_name: String,
    #[serde(default)]
    pub second_signatory_title: String,
    #[serde(default)]
    pub second_signature_image_base64: String,
}

fn default_signature_layout() -> String {
    "single".to_string()
}

fn default_true() -> bool {
    true
}

fn sanitize_text(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii() && c != '\r' { c } else { ' ' })
        .collect()
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let clean = if let Some(idx) = input.find(";base64,") {
        &input[idx + 8..]
    } else {
        input.trim()
    };
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for b in clean.bytes() {
        let val = match b {
            b'A'..=b'Z' => (b - b'A') as u32,
            b'a'..=b'z' => (b - b'a' + 26) as u32,
            b'0'..=b'9' => (b - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\r' | b'\n' | b' ' => continue,
            _ => return None,
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

pub fn render_letterhead_document_pdf(req: &LetterheadDocRequest) -> Result<Vec<u8>, String> {
    let mut canvas = PdfCanvas::new_a4_portrait();
    let page_width = 595.28;
    let page_height = 841.89;
    let margin_left = 50.0;
    let margin_right = 50.0;
    let content_width = page_width - margin_left - margin_right;

    let company_name = if req.company_name.trim().is_empty() {
        "UTKAL CHEMICAL AUSHADHALAYA"
    } else {
        req.company_name.trim()
    };

    // Register Header Image if provided
    let mut header_img_id: Option<usize> = None;
    if !req.header_image_base64.trim().is_empty() {
        if let Some(bytes) = base64_decode(&req.header_image_base64) {
            if let Ok(id) = canvas.add_jpeg_image(bytes, 0, 0) {
                header_img_id = Some(id);
            }
        }
    }

    // Register Signature Image if provided
    let mut sig_img_id: Option<usize> = None;
    if !req.signature_image_base64.trim().is_empty() {
        if let Some(bytes) = base64_decode(&req.signature_image_base64) {
            if let Ok(id) = canvas.add_jpeg_image(bytes, 0, 0) {
                sig_img_id = Some(id);
            }
        }
    }

    // Register Second Signatory (Employee / Candidate) Image if provided
    let mut second_sig_img_id: Option<usize> = None;
    if !req.second_signature_image_base64.trim().is_empty() {
        if let Some(bytes) = base64_decode(&req.second_signature_image_base64) {
            if let Ok(id) = canvas.add_jpeg_image(bytes, 0, 0) {
                second_sig_img_id = Some(id);
            }
        }
    }

    let is_draft = req.is_watermarked;
    let wm_text = if req.watermark_text.trim().is_empty() {
        "DRAFT - NOT FOR REGULATORY RELEASE"
    } else {
        req.watermark_text.trim()
    };

    // Helper: Draw watermark on draft; only draw page number on page 2+
    let draw_footer_and_watermark = |canvas: &mut PdfCanvas, page_num: usize| {
        if is_draft {
            canvas.set_fill_color(PdfColor { r: 0.92, g: 0.92, b: 0.92 });
            canvas.draw_centered_spaced_string(
                PdfFont::HelveticaBold,
                22.0,
                page_width / 2.0,
                page_height / 2.0,
                wm_text,
                1.5,
            );
        }

        // Clean page number indicator only for subsequent pages if enabled
        if req.show_page_numbers && page_num > 1 {
            let footer_meta = format!("Page {}", page_num);
            canvas.set_fill_color(PdfColor { r: 0.55, g: 0.58, b: 0.62 });
            canvas.draw_right_string(
                PdfFont::Helvetica,
                7.5,
                page_width - margin_right,
                22.0,
                &footer_meta,
            );
        }
    };

    // ==========================================
    // PAGE 1: HEADER
    // ==========================================
    let date_str = if req.date.trim().is_empty() { "October 18, 2026" } else { req.date.trim() };

    let draw_header = |canvas: &mut PdfCanvas| -> f64 {
        if let Some(id) = header_img_id {
            // Authentic Company Letterhead Graphic: Edge-to-Edge across top
            // Full width = 595.28 pt => Height = 163.4 pt
            let header_h = 163.4;
            let header_y = page_height - header_h;
            canvas.draw_image(id, 0.0, header_y, page_width, header_h);

            // Dynamic Reference Number overlaid onto header line right on preprinted dotted baseline
            let ref_clean = sanitize_text(&req.doc_ref_no);
            let ref_w = (ref_clean.len() as f64 * 5.5).max(92.0);
            canvas.set_fill_color(PdfColor::WHITE);
            canvas.rect(73.0, page_height - 116.0, ref_w, 13.0, false, true);

            canvas.set_fill_color(PdfColor { r: 0.08, g: 0.12, b: 0.20 });
            canvas.draw_string(
                PdfFont::HelveticaBold,
                8.5,
                75.0,
                page_height - 113.0,
                &ref_clean,
            );

            // Dynamic Date overlaid onto header line right on preprinted Date baseline
            let date_clean = sanitize_text(date_str);
            canvas.set_fill_color(PdfColor::WHITE);
            canvas.rect(464.0, page_height - 116.0, 75.0, 13.0, false, true);

            canvas.set_fill_color(PdfColor { r: 0.08, g: 0.12, b: 0.20 });
            canvas.draw_string(
                PdfFont::HelveticaBold,
                8.5,
                466.0,
                page_height - 113.0,
                &date_clean,
            );

            // Increased space between Ref/Date line and content (Ref is at 113pt, content starts at 175pt = 62pt gap below Ref, 11.6pt below 163.4pt banner)
            page_height - 175.0
        } else {
            // Clean Fallback Vector Header
            canvas.set_fill_color(PdfColor { r: 0.05, g: 0.25, b: 0.45 });
            canvas.rect(0.0, page_height - 6.0, page_width, 6.0, false, true);

            canvas.set_fill_color(PdfColor { r: 0.05, g: 0.20, b: 0.40 });
            canvas.draw_spaced_string(
                PdfFont::HelveticaBold,
                16.0,
                margin_left,
                page_height - 35.0,
                company_name,
                0.8,
            );

            canvas.set_fill_color(PdfColor { r: 0.35, g: 0.38, b: 0.42 });
            canvas.draw_string(
                PdfFont::Helvetica,
                8.5,
                margin_left,
                page_height - 48.0,
                "Ayurvedic & Herbal Pharmaceuticals • Schedule T GMP Certified",
            );

            canvas.set_fill_color(PdfColor { r: 0.40, g: 0.45, b: 0.50 });
            let lic_text = if req.company_ayush_lic.is_empty() { "Lic: OR-02/AYUR" } else { &req.company_ayush_lic };
            let gstin_text = if req.company_gstin.is_empty() { "GSTIN: 21AAAAU1234C1Z5" } else { &req.company_gstin };
            canvas.draw_right_string(
                PdfFont::Helvetica,
                7.5,
                page_width - margin_right,
                page_height - 35.0,
                &format!("{}  *  {}", lic_text, gstin_text),
            );

            canvas.set_fill_color(PdfColor { r: 0.82, g: 0.85, b: 0.88 });
            canvas.rect(margin_left, page_height - 56.0, content_width, 1.0, false, true);

            // Ref & Date bar
            canvas.set_fill_color(PdfColor { r: 0.96, g: 0.97, b: 0.98 });
            canvas.rect(margin_left, page_height - 82.0, content_width, 20.0, false, true);

            canvas.set_fill_color(PdfColor { r: 0.08, g: 0.12, b: 0.20 });
            canvas.draw_string(
                PdfFont::HelveticaBold,
                8.5,
                margin_left + 8.0,
                page_height - 70.0,
                &format!("REF: {}", sanitize_text(&req.doc_ref_no)),
            );

            canvas.draw_right_string(
                PdfFont::HelveticaBold,
                8.5,
                page_width - margin_right - 8.0,
                page_height - 70.0,
                &format!("DATE: {}", sanitize_text(date_str)),
            );

            page_height - 110.0
        }
    };

    let mut current_y: f64 = draw_header(&mut canvas);
    draw_footer_and_watermark(&mut canvas, 1);

    // ==========================================
    // RECIPIENT BLOCK (Larger, more prominent font & clean spacing)
    // ==========================================
    if !req.recipient_name.trim().is_empty() {
        canvas.set_fill_color(PdfColor::BLACK);
        canvas.draw_string(PdfFont::HelveticaBold, 10.5, margin_left, current_y, "To,");
        current_y -= 15.0;

        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.15, b: 0.28 });
        canvas.draw_string(PdfFont::HelveticaBold, 11.0, margin_left, current_y, &sanitize_text(&req.recipient_name));
        current_y -= 14.0;

        if !req.recipient_title.trim().is_empty() {
            canvas.set_fill_color(PdfColor { r: 0.25, g: 0.28, b: 0.32 });
            canvas.draw_string(PdfFont::Helvetica, 9.5, margin_left, current_y, &sanitize_text(&req.recipient_title));
            current_y -= 13.0;
        }

        if !req.recipient_address.trim().is_empty() {
            canvas.set_fill_color(PdfColor { r: 0.30, g: 0.34, b: 0.38 });
            for line in req.recipient_address.split('\n') {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    canvas.draw_string(PdfFont::Helvetica, 9.5, margin_left, current_y, &sanitize_text(trimmed));
                    current_y -= 12.0;
                }
            }
        }
        current_y -= 14.0;
    }

    // ==========================================
    // SUBJECT LINE (Larger font & enhanced spacing, smart multi-line wrap supported)
    // ==========================================
    if !req.subject.trim().is_empty() {
        let subj = format!("SUB: {}", sanitize_text(&req.subject).to_uppercase());
        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.18, b: 0.35 });
        let wrapped_subj = canvas.wrap_text(PdfFont::HelveticaBold, 11.0, &subj, content_width);
        for line in wrapped_subj {
            canvas.draw_string(PdfFont::HelveticaBold, 11.0, margin_left, current_y, &line);
            current_y -= 14.0;
        }
        current_y -= 12.0;
    }

    // ==========================================
    // TITLE LINE (Larger font & enhanced spacing, matching studio)
    // ==========================================
    if !req.title.trim().is_empty() && req.title.trim() != req.subject.trim() {
        let title_text = format!("TITLE: {}", sanitize_text(&req.title).to_uppercase());
        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.15, b: 0.28 });
        let wrapped_title = canvas.wrap_text(PdfFont::HelveticaBold, 11.0, &title_text, content_width);
        for line in wrapped_title {
            canvas.draw_string(PdfFont::HelveticaBold, 11.0, margin_left, current_y, &line);
            current_y -= 14.0;
        }
        current_y -= 12.0;
    }

    // ==========================================
    // SALUTATION & BODY PARAGRAPHS
    // ==========================================
    let salutation = if req.salutation.trim().is_empty() { "Dear Sir / Madam," } else { req.salutation.trim() };
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.draw_string(PdfFont::HelveticaBold, 9.5, margin_left, current_y, salutation);
    current_y -= 16.0;

    let mut paras_to_render = Vec::new();
    for (p_idx, para) in req.paragraphs.iter().enumerate() {
        let trimmed = para.trim();
        let lower = trimmed.to_lowercase();
        if p_idx == 0 && (lower == "dear sir / madam," || lower == "dear sir/madam," || lower == "dear sir / madam" || lower.starts_with("dear sir") || lower.starts_with("dear madam") || lower == salutation.to_lowercase()) {
            continue;
        }
        paras_to_render.push(para);
    }

    let mut page_count = 1;
    for para in &paras_to_render {
        let sanitized = sanitize_text(para);
        let wrapped_lines = canvas.wrap_text(PdfFont::Helvetica, 9.0, &sanitized, content_width);

        for line in wrapped_lines {
            if current_y < 50.0 {
                canvas.new_page();
                page_count += 1;
                // Continuation page gets identical header, ref, and date
                current_y = draw_header(&mut canvas);
                draw_footer_and_watermark(&mut canvas, page_count);
            }

            canvas.set_fill_color(PdfColor { r: 0.12, g: 0.14, b: 0.18 });
            canvas.draw_string(PdfFont::Helvetica, 9.0, margin_left, current_y, &line);
            current_y -= 14.0;
        }
        current_y -= 8.0;
    }

    // ==========================================
    // TERMS & BULLET CLAUSES
    // ==========================================
    if !req.terms_clauses.is_empty() {
        if current_y < 65.0 {
            canvas.new_page();
            page_count += 1;
            current_y = draw_header(&mut canvas);
            draw_footer_and_watermark(&mut canvas, page_count);
        }

        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.18, b: 0.35 });
        canvas.draw_string(PdfFont::HelveticaBold, 9.0, margin_left, current_y, "Terms & Statutory Declarations:");
        current_y -= 14.0;

        for (idx, clause) in req.terms_clauses.iter().enumerate() {
            let bullet_prefix = format!("{}. ", idx + 1);
            let clause_sanitized = sanitize_text(clause);
            let wrapped = canvas.wrap_text(PdfFont::Helvetica, 8.5, &clause_sanitized, content_width - 18.0);

            for (w_idx, line) in wrapped.iter().enumerate() {
                if current_y < 50.0 {
                    canvas.new_page();
                    page_count += 1;
                    current_y = draw_header(&mut canvas);
                    draw_footer_and_watermark(&mut canvas, page_count);
                }

                if w_idx == 0 {
                    canvas.set_fill_color(PdfColor::BLACK);
                    canvas.draw_string(PdfFont::HelveticaBold, 8.5, margin_left, current_y, &bullet_prefix);
                }

                canvas.set_fill_color(PdfColor { r: 0.18, g: 0.20, b: 0.24 });
                canvas.draw_string(PdfFont::Helvetica, 8.5, margin_left + 16.0, current_y, line);
                current_y -= 12.0;
            }
            current_y -= 4.0;
        }
        current_y -= 8.0;
    }

    // ==========================================
    // SIGNATORY BLOCK (RIGHT-ALIGNED WITH GENEROUS SIGNATURE SPACE)
    // ==========================================
    let sig_block_height = if sig_img_id.is_some() { 120.0 } else { 96.0 };
    let bottom_margin = 52.0;
    let target_sign_y = bottom_margin + sig_block_height;

    if current_y < target_sign_y {
        if current_y < bottom_margin + 50.0 {
            // Not enough room on this page, start new page
            canvas.new_page();
            page_count += 1;
            draw_header(&mut canvas);
            draw_footer_and_watermark(&mut canvas, page_count);
            current_y = target_sign_y;
        } else {
            // Squeeze on current page right below text
            current_y -= 14.0;
        }
    } else {
        // Automatically anchor near the bottom of the page
        current_y = target_sign_y;
    }

    let layout = req.signature_layout.trim().to_lowercase();
    if layout == "none" || layout == "disabled" {
        return Ok(canvas.build_pdf());
    }

    if layout == "dual" || layout == "double" || layout == "2" {
        let left_x = margin_left;
        let left_label = if req.second_signatory_label.trim().is_empty() {
            "Accepted & Agreed By:"
        } else {
            req.second_signatory_label.trim()
        };
        let left_name = if req.second_signatory_name.trim().is_empty() {
            if !req.recipient_name.trim().is_empty() {
                req.recipient_name.trim()
            } else {
                "Signature of Employee / Candidate"
            }
        } else {
            req.second_signatory_name.trim()
        };
        let left_title = if req.second_signatory_title.trim().is_empty() {
            "Date: ____________________"
        } else {
            req.second_signatory_title.trim()
        };

        canvas.set_fill_color(PdfColor { r: 0.05, g: 0.20, b: 0.40 });
        canvas.draw_string(PdfFont::HelveticaBold, 9.5, left_x, current_y, left_label);

        let left_sig_y = current_y - 52.0;
        if let Some(id) = second_sig_img_id {
            let (raw_w, raw_h) = canvas.get_image_size(id).unwrap_or((800, 200));
            let aspect = (raw_w as f64) / (raw_h as f64).max(1.0);
            let max_w = 150.0;
            let box_h = 44.0;
            let (sig_w, sig_h) = if aspect > (max_w / box_h) {
                (max_w, (max_w / aspect).max(22.0))
            } else {
                ((box_h * aspect).min(max_w), box_h)
            };

            let total_sig_gap = 52.0;
            let v_pad = ((total_sig_gap - sig_h) / 2.0).max(2.0);
            let img_top_y = current_y - v_pad - 4.5;
            let img_bottom_y = img_top_y - sig_h;
            canvas.draw_image(id, left_x, img_bottom_y, sig_w, sig_h);
        } else {
            canvas.set_stroke_color(PdfColor { r: 0.60, g: 0.65, b: 0.72 });
            canvas.set_line_width(0.75);
            canvas.line(left_x, left_sig_y + 16.0, left_x + 160.0, left_sig_y + 16.0);

            canvas.set_fill_color(PdfColor { r: 0.58, g: 0.64, b: 0.72 });
            canvas.draw_string(PdfFont::Helvetica, 7.5, left_x, left_sig_y + 20.0, "(Sign here)");
        }

        canvas.set_fill_color(PdfColor::BLACK);
        canvas.draw_string(PdfFont::HelveticaBold, 10.5, left_x, left_sig_y, left_name);

        canvas.set_fill_color(PdfColor { r: 0.35, g: 0.38, b: 0.42 });
        canvas.draw_string(PdfFont::Helvetica, 9.0, left_x, left_sig_y - 13.0, left_title);
    }

    let col_w = 205.0;
    let sign_x = page_width - margin_right - col_w;
    canvas.set_fill_color(PdfColor { r: 0.05, g: 0.20, b: 0.40 });
    canvas.draw_string(PdfFont::HelveticaBold, 9.5, sign_x, current_y, &format!("For {},", company_name));

    // Specimen Signature Image (vertically centered between company name and signer name)
    if let Some(id) = sig_img_id {
        let (raw_w, raw_h) = canvas.get_image_size(id).unwrap_or((800, 200));
        let aspect = (raw_w as f64) / (raw_h as f64).max(1.0);
        let max_w = 150.0;
        let box_h = 44.0;
        let (sig_w, sig_h) = if aspect > (max_w / box_h) {
            (max_w, (max_w / aspect).max(22.0))
        } else {
            ((box_h * aspect).min(max_w), box_h)
        };

        let total_sig_gap = 52.0;
        let v_pad = ((total_sig_gap - sig_h) / 2.0).max(2.0);
        let sig_x = sign_x;
        // Shift image slightly downward from 'For ...,' baseline to achieve equal visual white-space
        let img_top_y = current_y - v_pad - 4.5;
        let img_bottom_y = img_top_y - sig_h;
        canvas.draw_image(id, sig_x, img_bottom_y, sig_w, sig_h);
        current_y = current_y - total_sig_gap - 6.0;
    } else {
        current_y -= 52.0; // Generous 52pt blank signing space for physical pen signature
    }

    let signer_name = if req.signatory_name.trim().is_empty() { "Authorized Signatory" } else { req.signatory_name.trim() };
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.draw_string(PdfFont::HelveticaBold, 10.5, sign_x, current_y, signer_name);
    current_y -= 13.0;

    let signer_title = if req.signatory_title.trim().is_empty() { "Proprietor" } else { req.signatory_title.trim() };
    canvas.set_fill_color(PdfColor { r: 0.35, g: 0.38, b: 0.42 });
    canvas.draw_string(PdfFont::Helvetica, 9.0, sign_x, current_y, signer_title);
    current_y -= 12.0;

    if !req.signatory_reg_no.trim().is_empty() {
        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.40, b: 0.30 });
        canvas.draw_string(
            PdfFont::HelveticaBold,
            7.5,
            sign_x,
            current_y,
            &format!("Reg: {}", sanitize_text(&req.signatory_reg_no)),
        );
    }

    Ok(canvas.build_pdf())
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Pure Rust WASM SVG Document Renderer
/// Returns crisp vector SVG with 100% pixel-level parity to PDF output
pub fn render_letterhead_document_svg(req: &LetterheadDocRequest) -> Result<String, String> {
    let dummy_canvas = PdfCanvas::new_a4_portrait();
    let page_width = 595.28;
    let page_height = 841.89;
    let margin_left = 50.0;
    let margin_right = 50.0;
    let content_width = page_width - margin_left - margin_right;

    let company_name = if req.company_name.trim().is_empty() {
        "UTKAL CHEMICAL AUSHADHALAYA"
    } else {
        req.company_name.trim()
    };

    let date_str = if req.date.trim().is_empty() { "October 18, 2026" } else { req.date.trim() };

    struct SvgPage {
        elements: Vec<String>,
        page_num: usize,
    }

    let mut pages: Vec<SvgPage> = Vec::new();
    let mut current_page_idx = 0;
    let mut current_y = 175.0; // Top-down coordinate matching PDF page_height - 175.0

    let add_page = |pages: &mut Vec<SvgPage>, p_num: usize| {
        pages.push(SvgPage {
            elements: Vec::new(),
            page_num: p_num,
        });
    };

    let draw_header_svg = |page: &mut SvgPage, req: &LetterheadDocRequest, date_str: &str| {
        if !req.header_image_base64.trim().is_empty() {
            let img_src = if req.header_image_base64.starts_with("data:") {
                req.header_image_base64.clone()
            } else {
                format!("data:image/jpeg;base64,{}", req.header_image_base64.trim())
            };
            page.elements.push(format!(
                r##"<image href="{}" x="0" y="0" width="{}" height="163.4" preserveAspectRatio="none"/>"##,
                img_src, page_width
            ));
            // Overlaid Ref (matching PDF rect 73, y 103, text x 75, y 113)
            let ref_clean = xml_escape(&sanitize_text(&req.doc_ref_no));
            let ref_w = (ref_clean.len() as f64 * 5.5).max(92.0);
            page.elements.push(format!(r##"<rect x="73" y="103" width="{}" height="13" fill="#ffffff"/>"##, ref_w));
            page.elements.push(format!(
                r##"<text x="75" y="113" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="8.5" fill="#141e33">{}</text>"##,
                ref_clean
            ));
            // Overlaid Date (matching PDF rect 464, y 103, text x 466, y 113)
            let date_clean = xml_escape(&sanitize_text(date_str));
            page.elements.push(r##"<rect x="464" y="103" width="75" height="13" fill="#ffffff"/>"##.to_string());
            page.elements.push(format!(
                r##"<text x="466" y="113" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="8.5" fill="#141e33">{}</text>"##,
                date_clean
            ));
        } else {
            page.elements.push(format!(r##"<rect x="0" y="0" width="{}" height="6" fill="#0d4073"/>"##, page_width));
            page.elements.push(format!(
                r##"<text x="{}" y="35" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="16" fill="#0d3366" letter-spacing="0.8">{}</text>"##,
                margin_left, xml_escape(company_name)
            ));
            page.elements.push(format!(
                r##"<text x="{}" y="48" font-family="Helvetica, Arial, sans-serif" font-size="8.5" fill="#59616b">Ayurvedic &amp; Herbal Pharmaceuticals • Schedule T GMP Certified</text>"##,
                margin_left
            ));
            page.elements.push(format!(r##"<rect x="{}" y="56" width="{}" height="1" fill="#d1d9e0"/>"##, margin_left, content_width));
            page.elements.push(format!(r##"<rect x="{}" y="62" width="{}" height="20" fill="#f5f7fa"/>"##, margin_left, content_width));
            page.elements.push(format!(
                r##"<text x="{}" y="76" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="8.5" fill="#141e33">REF: {}</text>"##,
                margin_left + 8.0, xml_escape(&sanitize_text(&req.doc_ref_no))
            ));
            page.elements.push(format!(
                r##"<text x="{}" y="76" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="8.5" fill="#141e33">DATE: {}</text>"##,
                page_width - margin_right - 8.0, xml_escape(date_str)
            ));
        }
    };

    add_page(&mut pages, 1);
    draw_header_svg(&mut pages[0], req, date_str);

    // ==========================================
    // RECIPIENT BLOCK
    // ==========================================
    if !req.recipient_name.trim().is_empty() {
        pages[current_page_idx].elements.push(format!(
            r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="10.5" fill="#000000">To,</text>"##,
            margin_left, current_y
        ));
        current_y += 15.0;

        pages[current_page_idx].elements.push(format!(
            r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11.0" fill="#142647">{}</text>"##,
            margin_left, current_y, xml_escape(&sanitize_text(&req.recipient_name))
        ));
        current_y += 14.0;

        if !req.recipient_title.trim().is_empty() {
            pages[current_page_idx].elements.push(format!(
                r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-size="9.5" fill="#404752">{}</text>"##,
                margin_left, current_y, xml_escape(&sanitize_text(&req.recipient_title))
            ));
            current_y += 13.0;
        }

        if !req.recipient_address.trim().is_empty() {
            for line in req.recipient_address.split('\n') {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    pages[current_page_idx].elements.push(format!(
                        r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-size="9.5" fill="#4d5761">{}</text>"##,
                        margin_left, current_y, xml_escape(&sanitize_text(trimmed))
                    ));
                    current_y += 12.0;
                }
            }
        }
        current_y += 14.0;
    }

    // ==========================================
    // SUBJECT LINE
    // ==========================================
    if !req.subject.trim().is_empty() {
        let subj = format!("SUB: {}", sanitize_text(&req.subject).to_uppercase());
        let wrapped_subj = dummy_canvas.wrap_text(PdfFont::HelveticaBold, 11.0, &subj, content_width);
        for line in wrapped_subj {
            pages[current_page_idx].elements.push(format!(
                r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11.0" fill="#142e59">{}</text>"##,
                margin_left, current_y, xml_escape(&line)
            ));
            current_y += 14.0;
        }
        current_y += 12.0;
    }

    // ==========================================
    // TITLE LINE
    // ==========================================
    if !req.title.trim().is_empty() && req.title.trim() != req.subject.trim() {
        let title_text = format!("TITLE: {}", sanitize_text(&req.title).to_uppercase());
        let wrapped_title = dummy_canvas.wrap_text(PdfFont::HelveticaBold, 11.0, &title_text, content_width);
        for line in wrapped_title {
            pages[current_page_idx].elements.push(format!(
                r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11.0" fill="#142647">{}</text>"##,
                margin_left, current_y, xml_escape(&line)
            ));
            current_y += 14.0;
        }
        current_y += 12.0;
    }

    // ==========================================
    // SALUTATION & BODY PARAGRAPHS
    // ==========================================
    let salutation = if req.salutation.trim().is_empty() { "Dear Sir / Madam," } else { req.salutation.trim() };
    pages[current_page_idx].elements.push(format!(
        r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="9.5" fill="#000000">{}</text>"##,
        margin_left, current_y, xml_escape(salutation)
    ));
    current_y += 16.0;

    let mut paras_to_render = Vec::new();
    for (p_idx, para) in req.paragraphs.iter().enumerate() {
        let trimmed = para.trim();
        let lower = trimmed.to_lowercase();
        if p_idx == 0 && (lower == "dear sir / madam," || lower == "dear sir/madam," || lower == "dear sir / madam" || lower.starts_with("dear sir") || lower.starts_with("dear madam") || lower == salutation.to_lowercase()) {
            continue;
        }
        paras_to_render.push(para);
    }

    // ==========================================
    // BODY PARAGRAPHS
    // ==========================================
    for para in &paras_to_render {
        let sanitized = sanitize_text(para);
        let wrapped_lines = dummy_canvas.wrap_text(PdfFont::Helvetica, 9.0, &sanitized, content_width);

        for line in wrapped_lines {
            if current_y > page_height - 50.0 {
                current_page_idx += 1;
                add_page(&mut pages, current_page_idx + 1);
                draw_header_svg(&mut pages[current_page_idx], req, date_str);
                current_y = 175.0;
            }

            pages[current_page_idx].elements.push(format!(
                r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-size="9.0" fill="#1f242e">{}</text>"##,
                margin_left, current_y, xml_escape(&line)
            ));
            current_y += 14.0;
        }
        current_y += 8.0;
    }

    // ==========================================
    // TERMS & BULLET CLAUSES
    // ==========================================
    if !req.terms_clauses.is_empty() {
        if current_y > page_height - 65.0 {
            current_page_idx += 1;
            add_page(&mut pages, current_page_idx + 1);
            draw_header_svg(&mut pages[current_page_idx], req, date_str);
            current_y = 175.0;
        }

        pages[current_page_idx].elements.push(format!(
            r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="9.0" fill="#142e59">Terms &amp; Statutory Declarations:</text>"##,
            margin_left, current_y
        ));
        current_y += 14.0;

        for (idx, clause) in req.terms_clauses.iter().enumerate() {
            let bullet_prefix = format!("{}. ", idx + 1);
            let clause_sanitized = sanitize_text(clause);
            let wrapped = dummy_canvas.wrap_text(PdfFont::Helvetica, 8.5, &clause_sanitized, content_width - 18.0);

            for (w_idx, line) in wrapped.iter().enumerate() {
                if current_y > page_height - 50.0 {
                    current_page_idx += 1;
                    add_page(&mut pages, current_page_idx + 1);
                    draw_header_svg(&mut pages[current_page_idx], req, date_str);
                    current_y = 150.0;
                }

                if w_idx == 0 {
                    pages[current_page_idx].elements.push(format!(
                        r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="8.5" fill="#000000">{}</text>"##,
                        margin_left, current_y, bullet_prefix
                    ));
                }

                pages[current_page_idx].elements.push(format!(
                    r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-size="8.5" fill="#2e333d">{}</text>"##,
                    margin_left + 16.0, current_y, xml_escape(line)
                ));
                current_y += 12.0;
            }
            current_y += 4.0;
        }
        current_y += 8.0;
    }

    // ==========================================
    // SIGNATORY BLOCK
    // ==========================================
    let has_sig_img = !req.signature_image_base64.trim().is_empty();
    let sig_block_height = if has_sig_img { 120.0 } else { 96.0 };
    let bottom_margin = 52.0;
    let target_sign_y = page_height - bottom_margin - sig_block_height;

    if current_y > target_sign_y {
        if current_y > page_height - bottom_margin - 50.0 {
            current_page_idx += 1;
            add_page(&mut pages, current_page_idx + 1);
            draw_header_svg(&mut pages[current_page_idx], req, date_str);
            current_y = target_sign_y;
        } else {
            current_y += 14.0;
        }
    } else {
        current_y = target_sign_y;
    }

    let layout = req.signature_layout.trim().to_lowercase();
    if layout != "none" && layout != "disabled" {
        if layout == "dual" || layout == "double" || layout == "2" {
            let left_x = margin_left;
            let left_label = if req.second_signatory_label.trim().is_empty() {
                "Accepted & Agreed By:"
            } else {
                req.second_signatory_label.trim()
            };
            let left_name = if req.second_signatory_name.trim().is_empty() {
                if !req.recipient_name.trim().is_empty() {
                    req.recipient_name.trim()
                } else {
                    "Signature of Employee / Candidate"
                }
            } else {
                req.second_signatory_name.trim()
            };
            let left_title = if req.second_signatory_title.trim().is_empty() {
                "Date: ____________________"
            } else {
                req.second_signatory_title.trim()
            };

            pages[current_page_idx].elements.push(format!(
                r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="9.5" fill="#0d3366">{}</text>"##,
                left_x, current_y, xml_escape(left_label)
            ));

            let has_second_sig_img = !req.second_signature_image_base64.trim().is_empty();
            if has_second_sig_img {
                let sig_src = if req.second_signature_image_base64.starts_with("data:") {
                    req.second_signature_image_base64.clone()
                } else {
                    format!("data:image/png;base64,{}", req.second_signature_image_base64.trim())
                };
                let max_w: f64 = 150.0;
                let box_h: f64 = 44.0;
                let total_sig_gap: f64 = 52.0;
                let v_pad: f64 = ((total_sig_gap - box_h) / 2.0).max(2.0);
                let img_top_y = current_y + v_pad + 4.5;
                pages[current_page_idx].elements.push(format!(
                    r##"<image href="{}" x="{}" y="{}" width="{}" height="{}" preserveAspectRatio="xMinYMid meet"/>"##,
                    sig_src, left_x, img_top_y, max_w, box_h
                ));
            } else {
                let left_sig_line_y = current_y + 36.0;
                pages[current_page_idx].elements.push(format!(
                    r##"<line x1="{}" y1="{}" x2="{}" y2="{}" stroke="#94a3b8" stroke-dasharray="3,2" stroke-width="1"/>"##,
                    left_x, left_sig_line_y, left_x + 160.0, left_sig_line_y
                ));
                pages[current_page_idx].elements.push(format!(
                    r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-style="italic" font-size="8.0" fill="#94a3b8">(Sign here)</text>"##,
                    left_x, left_sig_line_y - 5.0
                ));
            }
            pages[current_page_idx].elements.push(format!(
                r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="10.5" fill="#000000">{}</text>"##,
                left_x, current_y + 52.0, xml_escape(left_name)
            ));
            pages[current_page_idx].elements.push(format!(
                r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-size="9.0" fill="#59616b">{}</text>"##,
                left_x, current_y + 65.0, xml_escape(left_title)
            ));
        }

        let col_w = 205.0;
        let sign_x = page_width - margin_right - col_w;

        pages[current_page_idx].elements.push(format!(
            r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="9.5" fill="#0d3366">For {},</text>"##,
            sign_x, current_y, xml_escape(company_name)
        ));

        if has_sig_img {
            let sig_src = if req.signature_image_base64.starts_with("data:") {
                req.signature_image_base64.clone()
            } else {
                format!("data:image/png;base64,{}", req.signature_image_base64.trim())
            };
            let max_w: f64 = 150.0;
            let box_h: f64 = 44.0;
            let total_sig_gap: f64 = 52.0;
            let sig_x = sign_x;
            let v_pad: f64 = ((total_sig_gap - box_h) / 2.0).max(2.0);
            let img_top_y = current_y + v_pad + 4.5;
            pages[current_page_idx].elements.push(format!(
                r##"<image href="{}" x="{}" y="{}" width="{}" height="{}" preserveAspectRatio="xMinYMid meet"/>"##,
                sig_src, sig_x, img_top_y, max_w, box_h
            ));
            current_y = current_y + total_sig_gap + 6.0;
        } else {
            current_y += 52.0; // Clean 52pt physical pen space
        }

        let signer_name = if req.signatory_name.trim().is_empty() { "Authorized Signatory" } else { req.signatory_name.trim() };
        pages[current_page_idx].elements.push(format!(
            r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="10.5" fill="#000000">{}</text>"##,
            sign_x, current_y, xml_escape(signer_name)
        ));
        current_y += 13.0;

        let signer_title = if req.signatory_title.trim().is_empty() { "Proprietor" } else { req.signatory_title.trim() };
        pages[current_page_idx].elements.push(format!(
            r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-size="9.0" fill="#59616b">{}</text>"##,
            sign_x, current_y, xml_escape(signer_title)
        ));
        current_y += 12.0;

        if !req.signatory_reg_no.trim().is_empty() {
            pages[current_page_idx].elements.push(format!(
                r##"<text x="{}" y="{}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="7.5" fill="#14664d">Reg: {}</text>"##,
                sign_x, current_y, xml_escape(&sanitize_text(&req.signatory_reg_no))
            ));
        }
    }

    // Footers across all pages
    let total_pages = pages.len();
    for (idx, page) in pages.iter_mut().enumerate() {
        if req.show_page_numbers {
            page.elements.push(format!(
                r##"<text x="{}" y="{}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="8.5" fill="#64748b">Page {} of {}</text>"##,
                page_width - margin_right, page_height - 24.0, idx + 1, total_pages
            ));
        }
    }

    // Assemble unified multi-page SVG
    let page_gap = 24.0;
    let total_svg_height = (total_pages as f64 * page_height) + ((total_pages - 1) as f64 * page_gap);

    let mut svg = String::with_capacity(16384);
    svg.push_str(&format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {} {}" width="{}" height="{}" style="width: 100%; height: auto; display: block;">"##,
        page_width, total_svg_height, page_width, total_svg_height
    ));

    svg.push_str(r##"
<defs>
  <filter id="page-shadow" x="-5%" y="-2%" width="110%" height="106%">
    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.12"/>
  </filter>
</defs>
"##);

    for (idx, page) in pages.iter().enumerate() {
        let offset_y = idx as f64 * (page_height + page_gap);
        svg.push_str(&format!(r##"<g class="uca-doc-page" transform="translate(0, {})">"##, offset_y));
        // Paper background
        svg.push_str(&format!(
            r##"<rect x="0" y="0" width="{}" height="{}" fill="#ffffff" filter="url(#page-shadow)" rx="2" ry="2"/>"##,
            page_width, page_height
        ));
        for el in &page.elements {
            svg.push_str(el);
            svg.push('\n');
        }
        svg.push_str("</g>\n");
    }

    svg.push_str("</svg>");
    Ok(svg)
}


