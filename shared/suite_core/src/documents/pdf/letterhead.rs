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
}

fn default_true() -> bool {
    true
}

fn sanitize_text(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii() && c != '\r' { c } else { ' ' })
        .collect()
}

pub fn render_letterhead_document_pdf(req: &LetterheadDocRequest) -> Result<Vec<u8>, String> {
    let mut canvas = PdfCanvas::new_a4_portrait();
    let page_width = 595.28;
    let page_height = 841.89;
    let margin_left = 50.0;
    let margin_right = 50.0;
    let content_width = page_width - margin_left - margin_right;

    let draw_header_and_footer = |canvas: &mut PdfCanvas, page_num: usize, is_draft: bool, wm_text: &str| {
        // Watermark if draft
        if is_draft {
            let wm = if wm_text.trim().is_empty() { "DRAFT - NOT FOR REGULATORY RELEASE" } else { wm_text.trim() };
            canvas.set_fill_color(PdfColor { r: 0.90, g: 0.90, b: 0.90 });
            canvas.draw_centered_spaced_string(
                PdfFont::HelveticaBold,
                22.0,
                page_width / 2.0,
                page_height / 2.0,
                wm,
                1.5,
            );
        }

        // Top deep royal green band
        canvas.set_fill_color(PdfColor { r: 0.05, g: 0.35, b: 0.25 });
        canvas.rect(0.0, page_height - 6.0, page_width, 6.0, false, true);

        // Gold accent band
        canvas.set_fill_color(PdfColor { r: 0.85, g: 0.65, b: 0.15 });
        canvas.rect(0.0, page_height - 9.0, page_width, 2.0, false, true);

        // Company Name Banner
        canvas.set_fill_color(PdfColor { r: 0.05, g: 0.32, b: 0.22 });
        canvas.draw_spaced_string(
            PdfFont::HelveticaBold,
            16.0,
            margin_left,
            page_height - 35.0,
            "UTKAL CHEMICAL AUSHADHALAYA",
            0.8,
        );

        // Subtitle
        canvas.set_fill_color(PdfColor { r: 0.35, g: 0.38, b: 0.42 });
        canvas.draw_string(
            PdfFont::Helvetica,
            8.5,
            margin_left,
            page_height - 47.0,
            "Premier Ayurvedic & Herbal Pharmaceutical Manufacturing Unit  *  Estd. 1978",
        );

        // Right side compliance tags
        canvas.set_fill_color(PdfColor { r: 0.82, g: 0.55, b: 0.05 });
        canvas.draw_right_spaced_string(
            PdfFont::HelveticaBold,
            7.5,
            page_width - margin_right,
            page_height - 33.0,
            "AYUSH GMP CERTIFIED  *  SCHEDULE T COMPLIANT",
            0.4,
        );

        canvas.set_fill_color(PdfColor { r: 0.40, g: 0.45, b: 0.50 });
        canvas.draw_right_string(
            PdfFont::Helvetica,
            7.5,
            page_width - margin_right,
            page_height - 45.0,
            "Govt. Lic. No: 124-A-AYU (OR)  *  GSTIN: 21AAACU1234F1Z8",
        );

        // Header separator rule
        canvas.set_fill_color(PdfColor { r: 0.78, g: 0.82, b: 0.86 });
        canvas.rect(margin_left, page_height - 54.0, content_width, 1.0, false, true);

        // Running Footer rule
        canvas.set_fill_color(PdfColor { r: 0.82, g: 0.85, b: 0.88 });
        canvas.rect(margin_left, 42.0, content_width, 0.8, false, true);

        // Footer info
        canvas.set_fill_color(PdfColor { r: 0.45, g: 0.48, b: 0.52 });
        canvas.draw_string(
            PdfFont::Helvetica,
            7.0,
            margin_left,
            30.0,
            "Works & Regd. Office: Jagatpur Industrial Estate, Cuttack - 754021, Odisha, India  *  Web: www.utkalchemical.com",
        );

        let footer_meta = format!("Page {}", page_num);
        canvas.set_fill_color(PdfColor { r: 0.35, g: 0.40, b: 0.45 });
        canvas.draw_right_string(
            PdfFont::HelveticaBold,
            7.5,
            page_width - margin_right,
            30.0,
            &footer_meta,
        );
    };

    let is_draft = req.is_watermarked;
    draw_header_and_footer(&mut canvas, 1, is_draft, &req.watermark_text);

    let mut current_y = page_height - 76.0;

    // Document Reference and Date Box
    canvas.set_fill_color(PdfColor { r: 0.96, g: 0.97, b: 0.98 });
    canvas.rect(margin_left, current_y - 24.0, content_width, 24.0, false, true);

    canvas.set_fill_color(PdfColor { r: 0.08, g: 0.12, b: 0.20 });
    canvas.draw_string(
        PdfFont::HelveticaBold,
        9.0,
        margin_left + 8.0,
        current_y - 16.0,
        &format!("REF NO: {}", sanitize_text(&req.doc_ref_no)),
    );

    let date_str = if req.date.trim().is_empty() { "October 16, 2026" } else { req.date.trim() };
    canvas.draw_right_string(
        PdfFont::HelveticaBold,
        9.0,
        page_width - margin_right - 8.0,
        current_y - 16.0,
        &format!("DATE: {}", sanitize_text(date_str)),
    );

    current_y -= 40.0;

    // Recipient block
    if !req.recipient_name.trim().is_empty() {
        canvas.set_fill_color(PdfColor::BLACK);
        canvas.draw_string(PdfFont::HelveticaBold, 9.0, margin_left, current_y, "To,");
        current_y -= 13.0;

        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.15, b: 0.28 });
        canvas.draw_string(PdfFont::HelveticaBold, 9.5, margin_left, current_y, &sanitize_text(&req.recipient_name));
        current_y -= 12.0;

        if !req.recipient_title.trim().is_empty() {
            canvas.set_fill_color(PdfColor { r: 0.25, g: 0.28, b: 0.32 });
            canvas.draw_string(PdfFont::Helvetica, 8.5, margin_left, current_y, &sanitize_text(&req.recipient_title));
            current_y -= 12.0;
        }

        if !req.recipient_address.trim().is_empty() {
            canvas.set_fill_color(PdfColor { r: 0.30, g: 0.34, b: 0.38 });
            for line in req.recipient_address.split('\n') {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    canvas.draw_string(PdfFont::Helvetica, 8.5, margin_left, current_y, &sanitize_text(trimmed));
                    current_y -= 11.0;
                }
            }
        }
        current_y -= 6.0;
    }

    // Subject Line
    if !req.subject.trim().is_empty() {
        let subj = format!("SUB: {}", sanitize_text(&req.subject).to_uppercase());
        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.18, b: 0.28 });
        canvas.draw_string(PdfFont::HelveticaBold, 10.0, margin_left, current_y, &subj);
        current_y -= 16.0;
    }

    // Salutation
    let salutation = if req.salutation.trim().is_empty() { "Dear Sir / Madam," } else { req.salutation.trim() };
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.draw_string(PdfFont::HelveticaBold, 9.0, margin_left, current_y, salutation);
    current_y -= 16.0;

    // Body Paragraphs
    let mut page_count = 1;
    for para in &req.paragraphs {
        let sanitized = sanitize_text(para);
        let wrapped_lines = canvas.wrap_text(PdfFont::Helvetica, 9.0, &sanitized, content_width);

        for line in wrapped_lines {
            if current_y < 120.0 {
                canvas.new_page();
                page_count += 1;
                draw_header_and_footer(&mut canvas, page_count, is_draft, &req.watermark_text);
                current_y = page_height - 76.0;
            }

            canvas.set_fill_color(PdfColor { r: 0.12, g: 0.14, b: 0.18 });
            canvas.draw_string(PdfFont::Helvetica, 9.0, margin_left, current_y, &line);
            current_y -= 13.5;
        }
        current_y -= 8.0;
    }

    // Terms / Bullet Clauses
    if !req.terms_clauses.is_empty() {
        if current_y < 140.0 {
            canvas.new_page();
            page_count += 1;
            draw_header_and_footer(&mut canvas, page_count, is_draft, &req.watermark_text);
            current_y = page_height - 76.0;
        }

        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.18, b: 0.28 });
        canvas.draw_string(PdfFont::HelveticaBold, 9.0, margin_left, current_y, "Terms & Statutory Declarations:");
        current_y -= 14.0;

        for (idx, clause) in req.terms_clauses.iter().enumerate() {
            let bullet_prefix = format!("{}. ", idx + 1);
            let clause_sanitized = sanitize_text(clause);
            let wrapped = canvas.wrap_text(PdfFont::Helvetica, 8.5, &clause_sanitized, content_width - 18.0);

            for (w_idx, line) in wrapped.iter().enumerate() {
                if current_y < 110.0 {
                    canvas.new_page();
                    page_count += 1;
                    draw_header_and_footer(&mut canvas, page_count, is_draft, &req.watermark_text);
                    current_y = page_height - 76.0;
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

    // Signatory / Authorization Block
    if current_y < 130.0 {
        canvas.new_page();
        page_count += 1;
        draw_header_and_footer(&mut canvas, page_count, is_draft, &req.watermark_text);
        current_y = page_height - 76.0;
    }

    current_y -= 10.0;
    canvas.set_fill_color(PdfColor { r: 0.05, g: 0.25, b: 0.18 });
    canvas.draw_string(PdfFont::HelveticaBold, 9.0, margin_left, current_y, "For UTKAL CHEMICAL AUSHADHALAYA,");
    current_y -= 38.0;

    let signer_name = if req.signatory_name.trim().is_empty() { "Authorized Signatory" } else { req.signatory_name.trim() };
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.draw_string(PdfFont::HelveticaBold, 9.5, margin_left, current_y, signer_name);
    current_y -= 12.0;

    let signer_title = if req.signatory_title.trim().is_empty() { "Designated Authority" } else { req.signatory_title.trim() };
    canvas.set_fill_color(PdfColor { r: 0.35, g: 0.38, b: 0.42 });
    canvas.draw_string(PdfFont::Helvetica, 8.5, margin_left, current_y, signer_title);
    current_y -= 11.0;

    if !req.signatory_reg_no.trim().is_empty() {
        canvas.set_fill_color(PdfColor { r: 0.08, g: 0.40, b: 0.30 });
        canvas.draw_string(
            PdfFont::HelveticaBold,
            8.0,
            margin_left,
            current_y,
            &format!("Registration / Authority No: {}", sanitize_text(&req.signatory_reg_no)),
        );
        current_y -= 14.0;
    }

    // Cryptographic verification seal footer block
    if !req.verification_hash.trim().is_empty() {
        let hash_stamp = format!(
            "DIGITALLY VERIFIED DOCUMENT  *  SHA-256: {}",
            &req.verification_hash.trim()[0..32.min(req.verification_hash.trim().len())]
        );
        canvas.set_fill_color(PdfColor { r: 0.94, g: 0.97, b: 0.95 });
        canvas.rect(margin_left, current_y - 14.0, content_width, 14.0, false, true);

        canvas.set_fill_color(PdfColor { r: 0.15, g: 0.50, b: 0.35 });
        canvas.draw_string(PdfFont::HelveticaBold, 6.5, margin_left + 6.0, current_y - 9.0, &hash_stamp);
    }

    Ok(canvas.build_pdf())
}

