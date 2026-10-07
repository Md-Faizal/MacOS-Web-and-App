use super::writer::{PdfCanvas, PdfColor, PdfFont};
use serde::Deserialize;

const LABELS_PER_PAGE: usize = 24;
const LABEL_COLUMNS: usize = 3;
const LABEL_ROWS: usize = 8;

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogQrLabel {
    pub product_id: String,
    pub product_name: String,
    #[serde(default, alias = "category_name")]
    pub category: String,
    #[serde(default)]
    pub variant: String,
    #[serde(default)]
    pub batch_no: String,
    #[serde(default)]
    pub mrp: Option<f64>,
    pub qr_rows: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CatalogQrLabelRequest {
    pub labels: Vec<CatalogQrLabel>,
}

fn printable_ascii(value: &str, max_chars: usize, fallback: &str) -> String {
    let result: String = value
        .chars()
        .filter(|character| character.is_ascii() && !character.is_control())
        .take(max_chars)
        .collect();
    if result.trim().is_empty() {
        fallback.chars().take(max_chars).collect()
    } else {
        result
    }
}

fn wrap_text(canvas: &PdfCanvas, font: PdfFont, size: f64, text: &str, max_width: f64, max_lines: usize) -> Vec<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }

    let mut lines = Vec::new();
    let mut current_line = String::new();

    for word in words {
        let test_line = if current_line.is_empty() {
            word.to_string()
        } else {
            format!("{} {}", current_line, word)
        };

        if canvas.string_width(font, size, &test_line) <= max_width {
            current_line = test_line;
        } else {
            if !current_line.is_empty() {
                lines.push(std::mem::take(&mut current_line));
                if lines.len() >= max_lines {
                    break;
                }
            }
            if canvas.string_width(font, size, word) > max_width {
                let mut chunk = String::new();
                for c in word.chars() {
                    let mut candidate = chunk.clone();
                    candidate.push(c);
                    if canvas.string_width(font, size, &candidate) <= max_width {
                        chunk = candidate;
                    } else {
                        if !chunk.is_empty() {
                            lines.push(std::mem::take(&mut chunk));
                            if lines.len() >= max_lines {
                                break;
                            }
                        }
                        chunk = c.to_string();
                    }
                }
                current_line = chunk;
            } else {
                current_line = word.to_string();
            }
        }
    }

    if !current_line.is_empty() && lines.len() < max_lines {
        lines.push(current_line);
    }

    lines
}

fn validate_labels(labels: &[CatalogQrLabel]) -> Result<(), String> {
    if labels.is_empty() {
        return Err("There are no product or batch labels to print.".to_string());
    }
    if labels.len() > 2_000 {
        return Err("A print export may contain at most 2,000 QR labels.".to_string());
    }

    for (index, label) in labels.iter().enumerate() {
        if label.product_id.trim().is_empty() {
            return Err(format!("Label {} is missing its product ID.", index + 1));
        }
        if label.mrp.is_some_and(|mrp| !mrp.is_finite()) {
            return Err(format!("Label {} has an invalid MRP value.", index + 1));
        }
        let size = label.qr_rows.len();
        if !(21..=177).contains(&size)
            || label.qr_rows.iter().any(|row| {
                row.len() != size || !row.bytes().all(|byte| byte == b'0' || byte == b'1')
            })
        {
            return Err(format!(
                "Label {} contains an invalid QR matrix.",
                index + 1
            ));
        }
    }
    Ok(())
}

fn draw_qr(canvas: &mut PdfCanvas, rows: &[String], x: f64, y: f64, side: f64) {
    let size = rows.len();
    let quiet_modules = 4.0;
    let module_size = side / (size as f64 + quiet_modules * 2.0);
    canvas.set_fill_color(PdfColor::BLACK);
    for (row_index, row) in rows.iter().enumerate() {
        for (column_index, module) in row.bytes().enumerate() {
            if module == b'1' {
                let module_x = x + (column_index as f64 + quiet_modules) * module_size;
                let module_y =
                    y + (size as f64 - row_index as f64 - 1.0 + quiet_modules) * module_size;
                canvas.rect(
                    module_x,
                    module_y,
                    module_size + 0.02,
                    module_size + 0.02,
                    false,
                    true,
                );
            }
        }
    }
}

pub fn render_catalog_qr_label_pdf(request: &CatalogQrLabelRequest) -> Result<Vec<u8>, String> {
    validate_labels(&request.labels)?;

    let mut canvas = PdfCanvas::new_a4_portrait();
    let margin = 28.35;
    let gap = 5.0;
    let cell_width =
        (canvas.width - margin * 2.0 - gap * (LABEL_COLUMNS - 1) as f64) / LABEL_COLUMNS as f64;
    let cell_height =
        (canvas.height - margin * 2.0 - gap * (LABEL_ROWS - 1) as f64) / LABEL_ROWS as f64;

    for (index, label) in request.labels.iter().enumerate() {
        if index > 0 && index % LABELS_PER_PAGE == 0 {
            canvas.new_page();
        }
        let position_on_page = index % LABELS_PER_PAGE;
        let column = position_on_page % LABEL_COLUMNS;
        let row = position_on_page / LABEL_COLUMNS;
        let x = margin + column as f64 * (cell_width + gap);
        let y = canvas.height - margin - (row + 1) as f64 * cell_height - row as f64 * gap;

        // Label outer boundary line
        canvas.set_stroke_color(PdfColor::BLACK);
        canvas.set_line_width(0.45);
        canvas.rect(x, y, cell_width, cell_height, true, false);

        // QR code on left side of cell
        let qr_side = cell_height - 18.0;
        draw_qr(&mut canvas, &label.qr_rows, x + 4.0, y + 9.0, qr_side);

        // Text content on right side of cell
        let text_x = x + qr_side + 8.0;
        let text_right = x + cell_width - 4.0;
        let max_text_width = (text_right - text_x).max(20.0);

        let clean_product_name = printable_ascii(&label.product_name, 120, &format!("PRODUCT {}", label.product_id));
        let clean_category = printable_ascii(&label.category, 40, "");
        let clean_variant = printable_ascii(&label.variant, 40, "");
        let clean_batch_no = printable_ascii(&label.batch_no, 40, "");

        let has_category = !clean_category.trim().is_empty();
        let mut cur_y = y + cell_height - 10.0;

        // 1. Hierarchy: CATEGORY (subtle uppercase indicator)
        if has_category {
            canvas.set_fill_color(PdfColor::hex("#475569"));
            let cat_display = if clean_category.len() > 18 {
                format!("{:.16}..", clean_category)
            } else {
                clean_category.to_uppercase()
            };
            canvas.draw_spaced_string(
                PdfFont::HelveticaBold,
                5.2,
                text_x,
                cur_y,
                &cat_display,
                0.3,
            );
            cur_y -= 8.5;
        }

        // 2. Hierarchy: PRODUCT NAME (Bold, dynamically wrapped so long names never clip)
        canvas.set_fill_color(PdfColor::BLACK);
        let name_font_size = if clean_product_name.len() > 35 { 6.2 } else { 7.0 };
        let name_line_height = if name_font_size < 6.5 { 7.4 } else { 8.2 };
        let name_lines = wrap_text(&canvas, PdfFont::HelveticaBold, name_font_size, &clean_product_name, max_text_width, 2);

        for line in &name_lines {
            canvas.draw_string(
                PdfFont::HelveticaBold,
                name_font_size,
                text_x,
                cur_y,
                line,
            );
            cur_y -= name_line_height;
        }

        // Slight breathing space between product title and variant/batch details
        cur_y -= 1.5;

        // 3. Hierarchy: VARIANT / PACK SIZE
        if !clean_variant.trim().is_empty() {
            canvas.set_fill_color(PdfColor::hex("#1e293b"));
            let variant_text = format!("Pack: {clean_variant}");
            let lines = wrap_text(&canvas, PdfFont::Helvetica, 6.0, &variant_text, max_text_width, 1);
            if let Some(first_line) = lines.first() {
                canvas.draw_string(
                    PdfFont::Helvetica,
                    6.0,
                    text_x,
                    cur_y,
                    first_line,
                );
                cur_y -= 7.8;
            }
        }

        // 4. Hierarchy: BATCH NUMBER
        if !clean_batch_no.trim().is_empty() {
            canvas.set_fill_color(PdfColor::hex("#1e293b"));
            let batch_text = format!("Batch: {clean_batch_no}");
            let lines = wrap_text(&canvas, PdfFont::Helvetica, 6.0, &batch_text, max_text_width, 1);
            if let Some(first_line) = lines.first() {
                canvas.draw_string(
                    PdfFont::Helvetica,
                    6.0,
                    text_x,
                    cur_y,
                    first_line,
                );
            }
        }

        // 5. Hierarchy: MRP (Firmly anchored at bottom)
        if let Some(mrp) = label.mrp {
            canvas.set_fill_color(PdfColor::BLACK);
            canvas.draw_string(
                PdfFont::HelveticaBold,
                7.5,
                text_x,
                y + 10.5,
                &format!("MRP: {:.2}", mrp),
            );
        }
    }

    Ok(canvas.build_pdf())
}

#[cfg(test)]
mod tests {
    use super::{render_catalog_qr_label_pdf, CatalogQrLabel, CatalogQrLabelRequest};

    fn label(index: usize) -> CatalogQrLabel {
        CatalogQrLabel {
            product_id: index.to_string(),
            product_name: format!("Product {index}"),
            category: "General Care".to_string(),
            variant: "100 ml".to_string(),
            batch_no: format!("B-{index}"),
            mrp: Some(20.5),
            qr_rows: vec!["1".repeat(21); 21],
        }
    }

    #[test]
    fn renders_black_and_white_labels_across_a4_pages() {
        let request = CatalogQrLabelRequest {
            labels: (1..=25).map(label).collect(),
        };
        let pdf = render_catalog_qr_label_pdf(&request).unwrap();
        let pdf = String::from_utf8_lossy(&pdf);
        assert!(pdf.starts_with("%PDF-1.4"));
        assert!(pdf.contains("/Count 2"));
        assert!(pdf.contains("Product 1"));
        assert!(pdf.contains("Batch: B-25"));
        assert!(pdf.contains("MRP: 20.50"));
        assert!(pdf.contains("%%EOF"));
    }

    #[test]
    fn renders_long_product_names_without_clipping() {
        let long_label = CatalogQrLabel {
            product_id: "99".to_string(),
            product_name: "Amoxicillin and Potassium Clavulanate Tablets IP 625mg Fast Relief".to_string(),
            category: "Antibiotics".to_string(),
            variant: "10x10 Strips".to_string(),
            batch_no: "BATCH-LONG-99".to_string(),
            mrp: Some(199.99),
            qr_rows: vec!["1".repeat(21); 21],
        };
        let request = CatalogQrLabelRequest {
            labels: vec![long_label],
        };
        let pdf = render_catalog_qr_label_pdf(&request).unwrap();
        let pdf = String::from_utf8_lossy(&pdf);
        assert!(pdf.starts_with("%PDF-1.4"));
        assert!(pdf.contains("Amoxicillin"));
        assert!(pdf.contains("ANTIBIOTICS"));
        assert!(pdf.contains("Pack: 10x10 Strips"));
    }

    #[test]
    fn rejects_empty_or_invalid_qr_label_sets() {
        assert!(
            render_catalog_qr_label_pdf(&CatalogQrLabelRequest { labels: Vec::new() }).is_err()
        );
        let mut invalid = label(1);
        invalid.qr_rows[0].push('x');
        assert!(render_catalog_qr_label_pdf(&CatalogQrLabelRequest {
            labels: vec![invalid]
        })
        .is_err());
    }
}
