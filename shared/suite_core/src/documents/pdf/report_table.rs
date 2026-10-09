use super::writer::{PdfCanvas, PdfColor, PdfFont};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColumnAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone)]
pub struct TableColumnDef {
    pub header: String,
    pub width: f64,
    pub align: ColumnAlign,
}

#[derive(Debug, Clone)]
pub struct TableRowData {
    pub cells: Vec<String>,
    pub is_highlighted: bool,
}

#[derive(Debug, Clone)]
pub struct ReportCompanyHeader {
    pub name: String,
    pub sub_title: String,
    pub factory_address: String,
    pub office_address: String,
    pub ayush_license_no: String,
    pub gstin: String,
    pub pan: String,
    pub phone: String,
}

impl Default for ReportCompanyHeader {
    fn default() -> Self {
        Self {
            name: "UTKAL CHEMICAL AUSHADHALAYA".to_string(),
            sub_title: "Ayurvedic Medicine Manufacturing Unit (Sole Proprietorship)".to_string(),
            factory_address: "Binaba Marg, Aska, Ganjam, Odisha - 761110".to_string(),
            office_address: "D1, Basera Complex, Dumduma, BBSR - 751019".to_string(),
            ayush_license_no: "Form 25D/26D-AYUSH-GA/04".to_string(),
            gstin: "21AIDPF4446J1ZL".to_string(),
            pan: "AIDPF4446J".to_string(),
            phone: "06822273304 / 943933330".to_string(),
        }
    }
}

impl ReportCompanyHeader {
    pub fn from_settings(settings: &HashMap<String, String>) -> Self {
        let mut h = Self::default();
        if let Some(v) = settings.get("company_name") {
            if !v.trim().is_empty() {
                h.name = v.clone();
            }
        }
        if let Some(v) = settings.get("company_address_factory") {
            if !v.trim().is_empty() {
                h.factory_address = v.clone();
            }
        }
        if let Some(v) = settings.get("company_address_office") {
            if !v.trim().is_empty() {
                h.office_address = v.clone();
            }
        }
        if let Some(v) = settings.get("company_ayush_licence") {
            if !v.trim().is_empty() {
                h.ayush_license_no = v.clone();
            }
        }
        if let Some(v) = settings.get("company_gstin") {
            if !v.trim().is_empty() {
                h.gstin = v.clone();
            }
        }
        if let Some(v) = settings.get("company_pan") {
            if !v.trim().is_empty() {
                h.pan = v.clone();
            }
        }
        if let Some(v) = settings.get("company_phone") {
            if !v.trim().is_empty() {
                h.phone = v.clone();
            }
        }
        h
    }
}

#[derive(Debug, Clone)]
pub struct ReportMeta {
    pub report_title: String,
    pub statutory_reference: String,
    pub period_text: String,
    pub generated_at: String,
    pub statutory_declaration: String,
    pub signatory_title: String,
}

pub struct MultiPageTableReport {
    pub company: ReportCompanyHeader,
    pub meta: ReportMeta,
    pub columns: Vec<TableColumnDef>,
    pub rows: Vec<TableRowData>,
    pub summary_rows: Vec<Vec<String>>,
    pub is_landscape: bool,
}

impl MultiPageTableReport {
    pub fn new(
        company: ReportCompanyHeader,
        meta: ReportMeta,
        columns: Vec<TableColumnDef>,
        rows: Vec<TableRowData>,
        summary_rows: Vec<Vec<String>>,
        is_landscape: bool,
    ) -> Self {
        Self {
            company,
            meta,
            columns,
            rows,
            summary_rows,
            is_landscape,
        }
    }

    pub fn render_pdf(&self) -> Result<Vec<u8>, String> {
        let (page_width, page_height) = if self.is_landscape {
            (841.89, 595.28)
        } else {
            (595.28, 841.89)
        };

        let mut canvas = if self.is_landscape {
            PdfCanvas::new_a4_landscape()
        } else {
            PdfCanvas::new_a4_portrait()
        };

        let left_margin = 32.0;
        let right_margin = 32.0;
        let content_width = page_width - left_margin - right_margin;

        // Heights
        let row_height: f64 = 18.0;
        let table_header_height: f64 = 22.0;
        let page_footer_height: f64 = 36.0;

        // Page 1 header block takes ~115 pt
        let p1_header_height: f64 = 115.0;
        // Continuation pages header block takes ~45 pt
        let cont_header_height: f64 = 45.0;

        // Calculate item budget per page
        let p1_table_area_height: f64 = page_height - p1_header_height - table_header_height - page_footer_height - 30.0;
        let p1_max_rows: usize = (p1_table_area_height / row_height).floor().max(5.0) as usize;

        let cont_table_area_height: f64 = page_height - cont_header_height - table_header_height - page_footer_height - 30.0;
        let cont_max_rows: usize = (cont_table_area_height / row_height).floor().max(8.0) as usize;

        let total_items = self.rows.len();

        // Compute page slices
        let mut page_ranges: Vec<(usize, usize)> = Vec::new();
        if total_items == 0 {
            page_ranges.push((0, 0));
        } else {
            let mut curr = 0;
            // Page 1
            let end_p1 = (curr + p1_max_rows).min(total_items);
            page_ranges.push((curr, end_p1));
            curr = end_p1;

            // Continuation pages
            while curr < total_items {
                let end = (curr + cont_max_rows).min(total_items);
                page_ranges.push((curr, end));
                curr = end;
            }
        }

        let total_pages = page_ranges.len();

        for (page_idx, &(start_idx, end_idx)) in page_ranges.iter().enumerate() {
            let page_num = page_idx + 1;
            let is_first_page = page_idx == 0;
            let is_last_page = page_num == total_pages;

            if page_idx > 0 {
                canvas.new_page();
            }

            // Top boundary
            let mut current_y = page_height - 24.0;

            if is_first_page {
                // Enterprise Banner Header
                canvas.set_fill_color(PdfColor::hex("#0f172a"));
                canvas.draw_string(PdfFont::HelveticaBold, 13.0, left_margin, current_y, &self.company.name);

                // Small right-aligned tag
                canvas.set_fill_color(PdfColor::hex("#475569"));
                canvas.draw_right_string(
                    PdfFont::Helvetica,
                    7.5,
                    page_width - right_margin,
                    current_y,
                    "FORM 25D / 26D AYURVEDIC MANUFACTURING",
                );

                current_y -= 14.0;
                canvas.draw_string(PdfFont::Helvetica, 8.0, left_margin, current_y, &self.company.sub_title);

                current_y -= 12.0;
                let add_line = format!("Factory: {} | Regd. Office: {}", self.company.factory_address, self.company.office_address);
                canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin, current_y, &add_line);

                current_y -= 12.0;
                let lic_line = format!(
                    "AYUSH Lic. No: {}  |  GSTIN: {}  |  PAN: {}  |  Ph: {}",
                    self.company.ayush_license_no, self.company.gstin, self.company.pan, self.company.phone
                );
                canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin, current_y, &lic_line);

                // Divider Line
                current_y -= 8.0;
                canvas.set_stroke_color(PdfColor::hex("#cbd5e1"));
                canvas.set_line_width(0.75);
                canvas.line(left_margin, current_y, page_width - right_margin, current_y);

                // Report Title Box
                current_y -= 14.0;
                canvas.set_fill_color(PdfColor::hex("#1e293b"));
                canvas.draw_string(PdfFont::HelveticaBold, 11.0, left_margin, current_y, &self.meta.report_title);

                // Statutory Reference Note
                current_y -= 10.0;
                canvas.set_fill_color(PdfColor::hex("#0369a1")); // subtle statutory blue
                canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin, current_y, &self.meta.statutory_reference);

                // Period & Generation info on right
                canvas.set_fill_color(PdfColor::hex("#334155"));
                let meta_right = format!("Period: {}  |  Generated: {}", self.meta.period_text, self.meta.generated_at);
                canvas.draw_right_string(PdfFont::Helvetica, 7.5, page_width - right_margin, current_y + 10.0, &meta_right);

                current_y -= 12.0;
            } else {
                // Condensed Header on Continuation Pages
                canvas.set_fill_color(PdfColor::hex("#0f172a"));
                canvas.draw_string(
                    PdfFont::HelveticaBold,
                    9.5,
                    left_margin,
                    current_y,
                    &format!("{}  —  {} (Cont.)", self.company.name, self.meta.report_title),
                );

                canvas.set_fill_color(PdfColor::hex("#475569"));
                let meta_right = format!("Period: {} | Page {} of {}", self.meta.period_text, page_num, total_pages);
                canvas.draw_right_string(PdfFont::Helvetica, 7.5, page_width - right_margin, current_y, &meta_right);

                current_y -= 8.0;
                canvas.set_stroke_color(PdfColor::hex("#cbd5e1"));
                canvas.set_line_width(0.5);
                canvas.line(left_margin, current_y, page_width - right_margin, current_y);
                current_y -= 12.0;
            }

            // Draw Table Header Row
            let table_top_y = current_y;
            canvas.set_fill_color(PdfColor::hex("#1e293b"));
            canvas.rect(left_margin, table_top_y - table_header_height, content_width, table_header_height, false, true);

            // Print Column Headers
            let mut col_x = left_margin;
            canvas.set_fill_color(PdfColor::WHITE);
            for col in &self.columns {
                let cell_y = table_top_y - 14.5;
                match col.align {
                    ColumnAlign::Left => {
                        canvas.draw_string(PdfFont::HelveticaBold, 7.5, col_x + 4.0, cell_y, &col.header);
                    }
                    ColumnAlign::Center => {
                        canvas.draw_centered_string(PdfFont::HelveticaBold, 7.5, col_x + col.width / 2.0, cell_y, &col.header);
                    }
                    ColumnAlign::Right => {
                        canvas.draw_right_string(PdfFont::HelveticaBold, 7.5, col_x + col.width - 4.0, cell_y, &col.header);
                    }
                }
                col_x += col.width;
            }

            current_y -= table_header_height;

            // Draw Data Rows for this page
            let page_rows = if total_items > 0 {
                &self.rows[start_idx..end_idx]
            } else {
                &[]
            };

            for (row_offset, row) in page_rows.iter().enumerate() {
                let row_y_bottom = current_y - row_height;

                // Alternate Row Striping
                if row.is_highlighted {
                    canvas.set_fill_color(PdfColor::hex("#fef3c7")); // amber alert row
                    canvas.rect(left_margin, row_y_bottom, content_width, row_height, false, true);
                } else if row_offset % 2 == 1 {
                    canvas.set_fill_color(PdfColor::hex("#f8fafc"));
                    canvas.rect(left_margin, row_y_bottom, content_width, row_height, false, true);
                }

                // Bottom Border for row
                canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
                canvas.set_line_width(0.4);
                canvas.line(left_margin, row_y_bottom, page_width - right_margin, row_y_bottom);

                // Cells
                let mut cell_x = left_margin;
                for (c_idx, col) in self.columns.iter().enumerate() {
                    let cell_text = row.cells.get(c_idx).map(|s| s.as_str()).unwrap_or("");
                    let text_y = row_y_bottom + 5.5;

                    canvas.set_fill_color(if row.is_highlighted {
                        PdfColor::hex("#92400e")
                    } else {
                        PdfColor::hex("#1e293b")
                    });

                    // Fit text with dynamic size reduction if wider than column
                    let mut font_size = 7.5;
                    let max_w = (col.width - 6.0).max(10.0);
                    while canvas.string_width(PdfFont::Helvetica, font_size, cell_text) > max_w && font_size > 5.0 {
                        font_size -= 0.2;
                    }

                    match col.align {
                        ColumnAlign::Left => {
                            canvas.draw_string(PdfFont::Helvetica, font_size, cell_x + 3.0, text_y, cell_text);
                        }
                        ColumnAlign::Center => {
                            canvas.draw_centered_string(PdfFont::Helvetica, font_size, cell_x + col.width / 2.0, text_y, cell_text);
                        }
                        ColumnAlign::Right => {
                            canvas.draw_right_string(PdfFont::Helvetica, font_size, cell_x + col.width - 3.0, text_y, cell_text);
                        }
                    }

                    cell_x += col.width;
                }

                current_y -= row_height;
            }

            // Outer vertical grid border for the table
            canvas.set_stroke_color(PdfColor::hex("#cbd5e1"));
            canvas.set_line_width(0.6);
            canvas.rect(left_margin, current_y, content_width, table_top_y - current_y, true, false);

            // Summary Totals on Last Page
            if is_last_page && !self.summary_rows.is_empty() {
                for sum_row in &self.summary_rows {
                    let sum_y_bottom = current_y - row_height;
                    canvas.set_fill_color(PdfColor::hex("#f1f5f9"));
                    canvas.rect(left_margin, sum_y_bottom, content_width, row_height, true, true);

                    let mut s_cell_x = left_margin;
                    for (c_idx, col) in self.columns.iter().enumerate() {
                        let text = sum_row.get(c_idx).map(|s| s.as_str()).unwrap_or("");
                        let text_y = sum_y_bottom + 5.5;

                        canvas.set_fill_color(PdfColor::hex("#0f172a"));
                        match col.align {
                            ColumnAlign::Left => {
                                canvas.draw_string(PdfFont::HelveticaBold, 7.5, s_cell_x + 3.0, text_y, text);
                            }
                            ColumnAlign::Center => {
                                canvas.draw_centered_string(PdfFont::HelveticaBold, 7.5, s_cell_x + col.width / 2.0, text_y, text);
                            }
                            ColumnAlign::Right => {
                                canvas.draw_right_string(PdfFont::HelveticaBold, 7.5, s_cell_x + col.width - 3.0, text_y, text);
                            }
                        }
                        s_cell_x += col.width;
                    }
                    current_y -= row_height;
                }

                // Final Page Statutory Declaration & Signature Stamp Block
                current_y -= 14.0;
                let cert_box_h = 42.0;
                canvas.set_fill_color(PdfColor::hex("#fafafa"));
                canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
                canvas.set_line_width(0.5);
                canvas.rect(left_margin, current_y - cert_box_h, content_width, cert_box_h, true, true);

                // Legal declaration text on left
                canvas.set_fill_color(PdfColor::hex("#475569"));
                canvas.draw_string(
                    PdfFont::Helvetica,
                    6.5,
                    left_margin + 8.0,
                    current_y - 12.0,
                    &self.meta.statutory_declaration,
                );
                canvas.draw_string(
                    PdfFont::Helvetica,
                    6.0,
                    left_margin + 8.0,
                    current_y - 22.0,
                    "Maintained electronically under the provisions of the Information Technology Act, 2000 & Drug Rules.",
                );

                // Signatory on right
                let sig_right = page_width - right_margin - 12.0;
                canvas.set_fill_color(PdfColor::hex("#0f172a"));
                canvas.draw_right_string(
                    PdfFont::HelveticaBold,
                    7.5,
                    sig_right,
                    current_y - 14.0,
                    &format!("FOR  {}", self.company.name),
                );
                canvas.draw_right_string(
                    PdfFont::Helvetica,
                    7.0,
                    sig_right,
                    current_y - 32.0,
                    &self.meta.signatory_title,
                );
            } else if !is_last_page {
                // Continuation note
                canvas.set_fill_color(PdfColor::hex("#64748b"));
                canvas.draw_right_string(
                    PdfFont::HelveticaBold,
                    7.5,
                    page_width - right_margin,
                    current_y - 12.0,
                    &format!("Continued on Page {} >>", page_num + 1),
                );
            }

            // Universal Page Footer
            let footer_y = 14.0;
            canvas.set_stroke_color(PdfColor::hex("#e2e8f0"));
            canvas.set_line_width(0.5);
            canvas.line(left_margin, footer_y + 12.0, page_width - right_margin, footer_y + 12.0);

            canvas.set_fill_color(PdfColor::hex("#94a3b8"));
            canvas.draw_string(
                PdfFont::Helvetica,
                6.5,
                left_margin,
                footer_y,
                "macOS Business Suite (Statutory Core Engine) • Dept of AYUSH & GST Ready",
            );

            canvas.draw_right_string(
                PdfFont::HelveticaBold,
                7.0,
                page_width - right_margin,
                footer_y,
                &format!("Page {} of {}", page_num, total_pages),
            );
        }

        Ok(canvas.build_pdf())
    }
}
