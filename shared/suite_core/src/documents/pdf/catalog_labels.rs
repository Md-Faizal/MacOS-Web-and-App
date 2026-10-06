use super::writer::{PdfCanvas, PdfColor, PdfFont};
use serde::Deserialize;

const LABELS_PER_PAGE: usize = 24;
const LABEL_COLUMNS: usize = 3;
const LABEL_ROWS: usize = 8;

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogQrLabel {
    pub product_id: String,
    pub product_name: String,
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

        canvas.set_stroke_color(PdfColor::BLACK);
        canvas.set_line_width(0.45);
        canvas.rect(x, y, cell_width, cell_height, true, false);

        let qr_side = cell_height - 18.0;
        draw_qr(&mut canvas, &label.qr_rows, x + 4.0, y + 9.0, qr_side);

        let text_x = x + qr_side + 9.0;
        let text_right = x + cell_width - 5.0;
        let available_chars = ((text_right - text_x) / 4.2).floor().max(8.0) as usize;
        let product_fallback = format!("PRODUCT {}", label.product_id);
        let product_name = printable_ascii(&label.product_name, available_chars, &product_fallback);
        let variant = printable_ascii(&label.variant, available_chars, "PACK");
        let batch_no = printable_ascii(&label.batch_no, available_chars, "BATCH");

        canvas.set_fill_color(PdfColor::BLACK);
        canvas.draw_string(
            PdfFont::HelveticaBold,
            7.5,
            text_x,
            y + cell_height - 18.0,
            &product_name,
        );
        if !label.batch_no.trim().is_empty() {
            canvas.draw_string(
                PdfFont::Helvetica,
                6.5,
                text_x,
                y + cell_height - 30.0,
                &format!("Batch: {batch_no}"),
            );
        }
        if !label.variant.trim().is_empty() {
            canvas.draw_string(
                PdfFont::Helvetica,
                6.5,
                text_x,
                y + cell_height - 41.0,
                &format!("Pack: {variant}"),
            );
        }
        if let Some(mrp) = label.mrp {
            canvas.draw_string(
                PdfFont::HelveticaBold,
                7.5,
                text_x,
                y + 13.0,
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
