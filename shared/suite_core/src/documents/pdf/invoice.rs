use super::writer::{PdfCanvas, PdfColor, PdfFont};
use crate::documents::words::amount_in_indian_words;
use serde::{Deserialize, Serialize};

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
        AnyBool::String(s) => Ok(s == "1" || s.eq_ignore_ascii_case("true")),
    }
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
    #[serde(default)]
    pub bank_account_holder: Option<String>,
    #[serde(default)]
    pub bank_account_number: Option<String>,
    #[serde(default)]
    pub bank_ifsc: Option<String>,
    #[serde(default)]
    pub bank_branch: Option<String>,
}

/// Render an invoice into pure standard PDF 1.4 bytes matching ReportLab layout
pub fn render_invoice_pdf(data: &InvoiceRenderData) -> Vec<u8> {
    let mut canvas = PdfCanvas::new_a4_landscape();

    let left_margin = mm_to_pt(5.0);
    let right_margin = mm_to_pt(5.0);
    let bottom_margin = mm_to_pt(5.0);
    let width = canvas.width;
    let height = canvas.height;
    let table_width = width - left_margin - right_margin;

    // Precise column widths (19 columns) matching ReportLab
    let column_widths: [f64; 19] = [
        14.91, 37.69, 26.50, 159.03, 33.96, 64.19, 30.23, 37.69,
        30.23, 45.56, 40.17, 46.38, 30.23, 26.92, 30.23, 41.41,
        30.23, 41.83, 45.14
    ];

    // Outer Border
    canvas.set_stroke_color(PdfColor::BLACK);
    canvas.set_line_width(1.0);
    canvas.rect(left_margin, bottom_margin, table_width, height - mm_to_pt(10.0), true, false);

    // --- Header Section ---
    let header_top = height - mm_to_pt(5.0);
    let header_height = mm_to_pt(32.0);
    let left_w = mm_to_pt(98.0);
    let center_w = mm_to_pt(120.0);
    let right_x = left_margin + left_w + center_w;
    let right_w = width - left_margin - right_margin - (left_w + center_w);
    let header_y = header_top - header_height;

    // 3 Header Boxes
    canvas.rect(left_margin, header_y, left_w, header_height, true, false);
    canvas.rect(left_margin + left_w, header_y, center_w, header_height, true, false);
    canvas.rect(right_x, header_y, right_w, header_height, true, false);

    // Left: Company Info
    canvas.set_fill_color(PdfColor::NAVY_BLUE);
    canvas.draw_string(PdfFont::HelveticaBold, 13.0, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(5.0), "UTKAL CHEMICAL AUSHADHALAYA");
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(11.0), "FACT ADD::Binaba Marg, Aska, Ganjam, Pin.761110");
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(15.0), "COMP ADD::D1, Basera Comple,Dumduma,BBSR");
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(19.0), "PIN CODE::751019     Phone : 06822273304 / 943933330");
    canvas.set_fill_color(PdfColor::NAVY_BLUE);
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + mm_to_pt(2.0), header_y + header_height - mm_to_pt(23.0), "GSTIN : 21BOCPM8229J2ZWPAN :");

    // Center: Title
    canvas.draw_centered_string(PdfFont::HelveticaBold, 15.0, left_margin + left_w + center_w / 2.0, header_y + header_height - mm_to_pt(8.0), "GST INVOICE");
    canvas.draw_centered_string(PdfFont::HelveticaBold, 10.0, left_margin + left_w + center_w / 2.0, header_y + header_height - mm_to_pt(15.0), "CREDIT");
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
    canvas.line(table_x, table_y + table_h / 2.0, table_x + table_w, table_y + table_h / 2.0);

    let cell_w = table_w / 4.0;
    let cell_h = table_h / 2.0;
    let pad_x = mm_to_pt(1.5);
    let row0_y = table_y + cell_h + cell_h / 2.0 - 3.5;
    let row1_y = table_y + cell_h / 2.0 - 3.5;

    // Row 0
    canvas.draw_string(PdfFont::Helvetica, 7.0, table_x + pad_x, row0_y + 3.0, "Invoice No");
    canvas.draw_string(PdfFont::HelveticaBold, 7.0, table_x + cell_w + pad_x, row0_y + 3.0, &data.invoice_no);
    canvas.draw_string(PdfFont::Helvetica, 7.0, table_x + 2.0 * cell_w + pad_x, row0_y + 6.0, "Order No.");
    canvas.draw_string(PdfFont::Helvetica, 7.0, table_x + 2.0 * cell_w + pad_x, row0_y - 2.0, "Order Date");
    canvas.draw_string(PdfFont::HelveticaBold, 7.0, table_x + 3.0 * cell_w + pad_x, row0_y + 3.0, "Cases   0");

    // Row 1
    canvas.draw_string(PdfFont::HelveticaBold, 7.0, table_x + pad_x, row1_y + 6.0, "Invoice Date");
    canvas.draw_string(PdfFont::Helvetica, 7.0, table_x + pad_x, row1_y - 2.0, "Due Date");
    canvas.draw_string(PdfFont::Helvetica, 7.0, table_x + cell_w + pad_x, row1_y + 6.0, &format_date(data.invoice_date.as_deref().unwrap_or("")));
    canvas.draw_string(PdfFont::Helvetica, 7.0, table_x + cell_w + pad_x, row1_y - 2.0, &format_date(data.due_date.as_deref().unwrap_or("")));
    canvas.draw_string(PdfFont::HelveticaBold, 7.0, table_x + 2.0 * cell_w + pad_x, row1_y + 6.0, "L.R. No.");
    canvas.draw_string(PdfFont::Helvetica, 7.0, table_x + 2.0 * cell_w + pad_x, row1_y - 2.0, &format!("L.R. Date {}", format_date(data.lr_date.as_deref().unwrap_or(""))));
    canvas.draw_string(PdfFont::HelveticaBold, 7.0, table_x + 3.0 * cell_w + pad_x, row1_y + 3.0, "Transport");

    // Right: Customer Info
    let party_x = right_x + mm_to_pt(2.0);
    let party_y = header_y + header_height - mm_to_pt(5.0);
    canvas.draw_string(PdfFont::Helvetica, 8.0, party_x, party_y, "Party Name :");
    let label_w = canvas.string_width(PdfFont::Helvetica, 8.0, "Party Name :");
    let mut party_font_size = 8.5;
    let max_party_w = right_w - label_w - 12.0;
    while canvas.string_width(PdfFont::HelveticaBold, party_font_size, &data.party_name) > max_party_w && party_font_size > 4.0 {
        party_font_size -= 0.1;
    }
    canvas.draw_string(PdfFont::HelveticaBold, party_font_size, party_x + label_w + 4.0, party_y, &data.party_name);

    let address_line = if data.address.len() > 60 { &data.address[..60] } else { &data.address };
    canvas.draw_string(PdfFont::Helvetica, 8.0, party_x, header_y + header_height - mm_to_pt(10.0), address_line);
    canvas.draw_string(PdfFont::Helvetica, 8.0, party_x, header_y + header_height - mm_to_pt(14.0), &format!("PHONE : {}", data.phone));
    canvas.draw_string(PdfFont::Helvetica, 8.0, party_x, header_y + header_height - mm_to_pt(18.0), &format!("Licence No. : {}", data.licence_no));
    canvas.draw_string(PdfFont::Helvetica, 8.0, party_x, header_y + header_height - mm_to_pt(22.0), &format!("PAN : {}", data.pan));
    canvas.draw_string(PdfFont::Helvetica, 8.0, party_x, header_y + header_height - mm_to_pt(26.0), &format!("GSTIN : {}", data.gstin));

    // Horizontal separator
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
    canvas.rect(left_margin, header_bottom_line_y, table_width, 12.0, false, true);
    canvas.set_fill_color(PdfColor::BLACK);
    canvas.line(left_margin, header_bottom_line_y, left_margin + table_width, header_bottom_line_y);

    let table_header_y = header_y - (header_y - header_bottom_line_y) / 2.0 - 4.0;
    let col_titles = [
        "SL", "HSN", "MFG", "PRODUCT NAME", "PACK", "BATCH NO.", "EXP", "QTY.",
        "FREE", "M.R.P", "RATE", "AMOUNT", "DIS1", "DIS2", "SGST", "Value",
        "CGST", "Value", "FINAL AMT"
    ];

    let mut x_curr = left_margin;
    canvas.line(left_margin, header_y, left_margin, y1);
    for (i, &w) in column_widths.iter().enumerate() {
        if i < col_titles.len() {
            if matches!(i, 0 | 1 | 2 | 5 | 7 | 8 | 12 | 13 | 14 | 15 | 16 | 17) {
                canvas.draw_centered_string(PdfFont::HelveticaBold, 8.0, x_curr + w / 2.0, table_header_y, col_titles[i]);
            } else {
                canvas.draw_string(PdfFont::HelveticaBold, 8.0, x_curr + 2.0, table_header_y, col_titles[i]);
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

    for (row_idx, prod) in data.products.iter().enumerate() {
        let y = product_table_top - 12.0 - ((row_idx as f64) * product_row_height) + 3.0;
        let exp_str = prod.exp_date.as_deref().unwrap_or("--");
        let name_str = if prod.is_gold {
            format!("{} (G)", prod.name)
        } else {
            prod.name.clone()
        };

        let row_values = [
            format!("{}", row_idx + 1),
            prod.hsn.clone(),
            prod.mfg.clone(),
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
                // Product name auto scaling
                let mut font_size = 8.0;
                let max_w = col_w - 3.0;
                while canvas.string_width(PdfFont::Helvetica, font_size, val) > max_w && font_size > 4.0 {
                    font_size -= 0.1;
                }
                canvas.draw_string(PdfFont::Helvetica, font_size, x_col + 2.0, y, val);
            } else if matches!(col_idx, 0 | 1 | 2 | 5 | 6 | 7 | 8 | 12 | 13 | 14 | 15 | 16 | 17) {
                canvas.draw_centered_string(PdfFont::Helvetica, 8.0, x_col + col_w / 2.0, y, val);
            } else if matches!(col_idx, 4 | 9 | 10 | 11 | 18) {
                canvas.draw_right_string(PdfFont::Helvetica, 8.0, x_col + col_w - 2.0, y, val);
            } else {
                canvas.draw_string(PdfFont::Helvetica, 8.0, x_col + 2.0, y, val);
            }
            x_col += col_w;
        }
    }

    // --- Footer: GST Grid ---
    let total_value: f64 = data.products.iter().map(|p| p.amount).sum();
    let dis_amt = data.total_discount;
    let sgst_pay = data.total_sgst;
    let cgst_pay = data.total_cgst;

    let col_headers = ["CLASS", "TOTAL", "SCHEME", "DISCOUNT", "SGST", "CGST", "TOTAL GST"];
    let class_col_widths = [90.0, 60.0, 60.0, 88.0, 66.0, 44.0, 146.0];
    let mut header_x = left_margin + 15.0;
    for (j, header) in col_headers.iter().enumerate() {
        canvas.draw_string(PdfFont::HelveticaBold, 7.0, header_x + 2.0, y2 + 2.0, header);
        header_x += class_col_widths[j];
    }

    let gst_labels = ["GST 5.00%", "GST 12.00%", "GST 18.00%", "GST 28.00%"];
    let num_gst_rows = 4;
    let row_height = (y2 - y3 - 20.0) / (num_gst_rows as f64);
    let extra_space = 4.0;
    let gst_col_xs = vec![equi_xs[1], equi_xs[2], equi_xs[3], equi_xs[4], equi_xs[5], vertical_x2];

    for i in 0..num_gst_rows {
        let y = y2 - 10.0 - ((i as f64) + 0.5) * row_height - (i as f64) * extra_space;
        canvas.draw_string(PdfFont::HelveticaBold, 8.0, left_margin + 5.0, y, gst_labels[i]);

        for (j, &gx) in gst_col_xs.iter().enumerate() {
            let val_str = if i == 0 {
                match j {
                    0 => format!("{:.2}", total_value),
                    1 => "0.00".to_string(),
                    2 => format!("{:.2}", dis_amt),
                    3 => format!("{:.2}", sgst_pay),
                    4 => format!("{:.2}", cgst_pay),
                    5 => format!("{:.2}", sgst_pay + cgst_pay),
                    _ => "0.00".to_string(),
                }
            } else {
                "0.00".to_string()
            };
            canvas.draw_right_string(PdfFont::HelveticaBold, 9.0, gx - 7.0, y, &val_str);
        }
    }

    // Amount in Words
    canvas.draw_string(PdfFont::HelveticaBold, 9.0, left_margin + 15.0, y4 + 1.5, "TOTAL");
    let amount_words = format!("Rs. {}", amount_in_indian_words(data.grand_total));
    canvas.draw_string(PdfFont::HelveticaBold, 8.5, left_margin + 15.0, y4 + (y5 - y4) / 2.0 - 4.5, &amount_words);

    // Right Side Summary
    let items_x = vertical_x2 + 10.0;
    let items_y = y3 + (y2 - y3) / 2.0;
    canvas.draw_string(PdfFont::Helvetica, 9.0, items_x, items_y + 6.0, &format!("Total Items :-     {}", data.products.len()));
    let total_qty: f64 = data.products.iter().map(|p| p.qty + p.free).sum();
    canvas.draw_string(PdfFont::Helvetica, 9.0, items_x, items_y - 6.0, &format!("Total Qty  :-     {:.2}", total_qty));
    canvas.draw_string(PdfFont::HelveticaBold, 9.0, items_x, y4 + (y5 - y4) / 2.0, &format!("Previous Due: Rs. {:.2}", data.previous_due));

    // Summary Totals on the right
    let right_summary = [
        ("DIS AMT.", format!("{:.2}", data.total_discount)),
        ("SGST PAYBLE", format!("{:.2}", data.total_sgst)),
        ("CGST PAYBLE", format!("{:.2}", data.total_cgst)),
        ("CR/DR NOTE", "0.00".to_string()),
        ("ROUND OFF", format!("{:.2}", data.round_off)),
        ("GRAND TOTAL", format!("{:.2}", data.grand_total)),
    ];
    let mut sum_y = y1 - 12.0;
    for (label, val) in right_summary {
        canvas.draw_string(PdfFont::HelveticaBold, 8.0, width - right_margin - 130.0, sum_y, label);
        canvas.draw_right_string(PdfFont::HelveticaBold, 8.5, width - right_margin - 10.0, sum_y, &val);
        sum_y -= 12.0;
    }

    // Bank Details (Bottom Left)
    let holder = data.bank_account_holder.as_deref().unwrap_or("MD FAIZAL");
    let acc_no = data.bank_account_number.as_deref().unwrap_or("50100673684509");
    let ifsc = data.bank_ifsc.as_deref().unwrap_or("HDFC0000236");
    let branch = data.bank_branch.as_deref().unwrap_or("CUTTACK - ODISHA");

    canvas.draw_string(PdfFont::HelveticaBold, 7.5, left_margin + 15.0, bottom_margin + 52.0, &format!("Bank: HDFC Bank | A/C Holder: {} | A/C No: {}", holder, acc_no));
    canvas.draw_string(PdfFont::Helvetica, 7.5, left_margin + 15.0, bottom_margin + 40.0, &format!("IFSC: {} | Branch: {}", ifsc, branch));
    canvas.draw_string(PdfFont::HelveticaBold, 8.0, left_margin + 15.0, bottom_margin + 24.0, "Terms & Conditions: Goods once sold will not be taken back or exchanged.");

    // Signatures
    canvas.draw_string(PdfFont::Helvetica, 8.0, left_margin + 15.0, bottom_margin + 10.0, "Receiver's Signature");
    canvas.draw_right_string(PdfFont::HelveticaBold, 8.5, width - right_margin - 15.0, bottom_margin + 10.0, "For UTKAL CHEMICAL AUSHADHALAYA");

    canvas.build_pdf()
}
