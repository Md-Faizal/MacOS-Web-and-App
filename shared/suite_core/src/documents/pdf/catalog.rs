// ─────────────────────────────────────────────────────────────────────────────
// Pure Rust Vector Product Catalogue PDF Generator (Zero Puppeteer / Zero Dependencies)
// High-performance Neo-Brutalist replacement for legacy browser-based Puppeteer PDF generation.
// Matches the visual and structural fidelity of the master catalog PDF (MacOS-Home.pdf).
// ─────────────────────────────────────────────────────────────────────────────

use super::writer::{PdfCanvas, PdfColor, PdfFont};
use qrcodegen::{QrCode, QrCodeEcc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CatalogType {
    Master,
    Product,
    Batch,
}

impl Default for CatalogType {
    fn default() -> Self {
        CatalogType::Master
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogBatchItem {
    #[serde(default)]
    pub batch_id: Option<String>,
    pub batch_no: String,
    pub mrp: f64,
    #[serde(default)]
    pub mfg_date: Option<String>,
    #[serde(default)]
    pub expiry_date: Option<String>,
    #[serde(default)]
    pub qr_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogVariantItem {
    #[serde(default)]
    pub variant_id: Option<String>,
    #[serde(default)]
    pub pack_size: String,
    #[serde(default)]
    pub batches: Vec<CatalogBatchItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogProductItem {
    pub product_id: String,
    pub product_name: String,
    #[serde(default)]
    pub odia_name: Option<String>,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub is_gold: bool,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub variants: Vec<CatalogVariantItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleBatchParams {
    pub product_id: String,
    pub product_name: String,
    #[serde(default)]
    pub pack_size: String,
    pub batch_no: String,
    pub mrp: f64,
    #[serde(default)]
    pub mfg_date: Option<String>,
    #[serde(default)]
    pub expiry_date: Option<String>,
    #[serde(default)]
    pub qr_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogRenderData {
    #[serde(default)]
    pub catalog_type: CatalogType,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub generated_at: Option<String>,
    #[serde(default)]
    pub products: Vec<CatalogProductItem>,
    #[serde(default)]
    pub single_batch: Option<SingleBatchParams>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens: Neo-Brutalist High-Contrast Print Theme
// ─────────────────────────────────────────────────────────────────────────────
const COLOR_BG: &str = "#f4f6fb";
const COLOR_PRIMARY: &str = "#0038ff";     // Electric Blue
const COLOR_SECONDARY: &str = "#ffea00";   // Vibrant Yellow
const COLOR_ACCENT: &str = "#00f0ff";      // Neon Cyan
const COLOR_RED: &str = "#ff2a4b";         // Accent Red
const COLOR_TEXT: &str = "#0d0f12";        // Slate Black
const COLOR_TEXT_MUTED: &str = "#5c687d";

fn printable_ascii(value: &str, max_chars: usize, fallback: &str) -> String {
    let result: String = value
        .chars()
        .filter(|c| c.is_ascii() && !c.is_control())
        .take(max_chars)
        .collect();
    if result.trim().is_empty() {
        fallback.chars().take(max_chars).collect()
    } else {
        result
    }
}

/// Draw a Neo-Brutalist card with solid black drop shadow and crisp border
fn draw_neo_card(
    canvas: &mut PdfCanvas,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    r: f64,
    bg_color: PdfColor,
    shadow_offset: f64,
    border_width: f64,
) {
    if shadow_offset > 0.0 {
        canvas.set_fill_color(PdfColor::BLACK);
        canvas.round_rect(x + shadow_offset, y - shadow_offset, w, h, r, false, true);
    }
    canvas.set_fill_color(bg_color);
    canvas.set_stroke_color(PdfColor::BLACK);
    canvas.set_line_width(border_width);
    canvas.round_rect(x, y, w, h, r, true, true);
}

fn draw_qr_code(canvas: &mut PdfCanvas, content: &str, x: f64, y: f64, side: f64) {
    if content.trim().is_empty() {
        return;
    }
    let qr = match QrCode::encode_text(content, QrCodeEcc::Medium) {
        Ok(q) => q,
        Err(_) => return,
    };
    let size = qr.size();
    let quiet_modules = 2.0;
    let module_size = side / (size as f64 + quiet_modules * 2.0);

    canvas.set_fill_color(PdfColor::BLACK);
    for row in 0..size {
        for col in 0..size {
            if qr.get_module(col, row) {
                let mx = x + (col as f64 + quiet_modules) * module_size;
                let my = y + (size as f64 - row as f64 - 1.0 + quiet_modules) * module_size;
                canvas.rect(mx, my, module_size + 0.02, module_size + 0.02, false, true);
            }
        }
    }
}

/// Draw the 36pt crosshatch grid overlay that matches .qr-neo-grid in CSS
/// rgba(0,0,0,0.05) lines — we approximate with a very light grey stroke
fn draw_page_grid(canvas: &mut PdfCanvas, page_w: f64, page_h: f64) {
    let grid = 36.0_f64;  // 36px ≈ 36pt (CSS uses px but at 96dpi/72dpi they differ slightly; 36pt matches visually)
    // Grid color: black at ~5% opacity — use near-white grey stroke
    canvas.set_stroke_color(PdfColor::hex("#d8dce8")); // approx rgba(0,0,0,0.05) on #f4f6fb
    canvas.set_line_width(0.4);

    // Vertical lines
    let mut x = 0.0;
    while x <= page_w {
        canvas.line(x, 0.0, x, page_h);
        x += grid;
    }
    // Horizontal lines
    let mut y = 0.0;
    while y <= page_h {
        canvas.line(0.0, y, page_w, y);
        y += grid;
    }
}

fn draw_running_footer(canvas: &mut PdfCanvas, generated_at: &str) {
    let page_w = canvas.width;
    let footer_h = 36.0;
    let footer_y = 0.0;

    // White background
    canvas.set_fill_color(PdfColor::WHITE);
    canvas.rect(0.0, footer_y, page_w, footer_h, false, true);

    // 3px black top border
    canvas.set_stroke_color(PdfColor::BLACK);
    canvas.set_line_width(3.0);
    canvas.line(0.0, footer_y + footer_h, page_w, footer_y + footer_h);

    // Left: Brand title (11pt bold, primary blue)
    canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
    canvas.draw_string(PdfFont::HelveticaBold, 11.0, 34.0, footer_y + 13.0, "UCA · PRODUCT CATALOG");

    // Center: Three vibrant yellow diamonds (Bigger diamonds & 16pt spacing)
    let cx = page_w / 2.0;
    let cy = footer_y + 18.0;
    canvas.set_fill_color(PdfColor::hex(COLOR_SECONDARY));
    canvas.set_stroke_color(PdfColor::BLACK);
    canvas.set_line_width(1.0);
    canvas.diamond(cx - 16.0, cy, 4.5, true, true);
    canvas.diamond(cx, cy, 4.5, true, true);
    canvas.diamond(cx + 16.0, cy, 4.5, true, true);

    // Right: Generation timestamp in Neo-brutalist pill (24pt pill, 9.5pt bold text)
    let gen_text = format!("Generated {}", printable_ascii(generated_at, 40, "Recently"));
    let gen_text_w = canvas.string_width(PdfFont::HelveticaBold, 9.5, &gen_text);
    let gen_pill_w = gen_text_w + 22.0;
    let gen_pill_h = 24.0;
    let gen_pill_x = page_w - 34.0 - gen_pill_w;
    draw_neo_card(canvas, gen_pill_x, footer_y + 6.0, gen_pill_w, gen_pill_h, 6.0, PdfColor::WHITE, 2.0, 1.5);
    canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
    canvas.draw_centered_string(PdfFont::HelveticaBold, 9.5, gen_pill_x + gen_pill_w / 2.0, footer_y + 13.5, &gen_text);
}

pub fn render_catalog_pdf(data: &CatalogRenderData) -> Result<Vec<u8>, String> {
    match data.catalog_type {
        CatalogType::Batch => render_single_batch_pdf(data),
        CatalogType::Product => render_product_or_master_catalog_pdf(data, true),
        CatalogType::Master => render_product_or_master_catalog_pdf(data, false),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SINGLE BATCH QR PDF RENDERER (Neo-Brutalist Aesthetic)
// ─────────────────────────────────────────────────────────────────────────────
fn render_single_batch_pdf(data: &CatalogRenderData) -> Result<Vec<u8>, String> {
    let batch = match &data.single_batch {
        Some(b) => b,
        None => return Err("Single batch data is missing for batch QR rendering.".to_string()),
    };

    let mut canvas = PdfCanvas::new_a4_portrait();
    let left = 34.0;
    let width = canvas.width - left * 2.0;
    let generated_at = data.generated_at.as_deref().unwrap_or("Current");

    // Page Background Fill (#f4f6fb)
    canvas.set_fill_color(PdfColor::hex(COLOR_BG));
    let (cw, ch) = (canvas.width, canvas.height);
    canvas.rect(0.0, 0.0, cw, ch, false, true);
    // Grid overlay
    draw_page_grid(&mut canvas, cw, ch);

    // Header Neo-Brutalist Card
    let header_y = canvas.height - 140.0;
    let header_h = 95.0;
    draw_neo_card(&mut canvas, left, header_y, width, header_h, 16.0, PdfColor::WHITE, 6.0, 3.0);

    canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
    canvas.draw_centered_spaced_string(PdfFont::HelveticaBold, 11.0, left + width / 2.0, header_y + 70.0, "UCA INVENTORY SYSTEM", 2.0);

    canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
    canvas.draw_centered_bilingual_string(26.0, left + width / 2.0, header_y + 40.0, "Batch QR Code");

    let sub = format!("{} · {}", &batch.product_name, &batch.pack_size);
    canvas.set_fill_color(PdfColor::hex(COLOR_TEXT_MUTED));
    canvas.draw_centered_bilingual_string(10.0, left + width / 2.0, header_y + 16.0, &sub);

    // Batch Hero Summary Strip
    let hero_y = header_y - 95.0;
    let hero_h = 75.0;
    draw_neo_card(&mut canvas, left, hero_y, width, hero_h, 12.0, PdfColor::WHITE, 6.0, 3.0);

    // Left: Batch Number Pill
    canvas.set_fill_color(PdfColor::hex(COLOR_TEXT_MUTED));
    canvas.draw_bilingual_string(8.5, left + 20.0, hero_y + 50.0, "BATCH NO.");
    let bno_text = printable_ascii(&batch.batch_no, 25, "BATCH");
    let bno_w = canvas.bilingual_string_width(14.0, &bno_text) + 16.0;
    draw_neo_card(&mut canvas, left + 18.0, hero_y + 16.0, bno_w, 28.0, 6.0, PdfColor::hex(COLOR_BG), 0.0, 1.5);
    canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
    canvas.draw_bilingual_string(14.0, left + 26.0, hero_y + 24.0, &bno_text);

    // Right: MRP Tag (Vibrant Yellow Pill)
    let mrp_x = left + width - 170.0;
    canvas.set_fill_color(PdfColor::hex(COLOR_TEXT_MUTED));
    canvas.draw_bilingual_string(8.5, mrp_x, hero_y + 50.0, "MAX RETAIL PRICE (MRP)");
    let mrp_text = format!("₹ {:.2}", batch.mrp);
    let mrp_w = canvas.bilingual_string_width(16.0, &mrp_text) + 20.0;
    draw_neo_card(&mut canvas, mrp_x - 4.0, hero_y + 16.0, mrp_w, 28.0, 8.0, PdfColor::hex(COLOR_SECONDARY), 3.0, 2.0);
    canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
    canvas.draw_bilingual_string(16.0, mrp_x + 6.0, hero_y + 24.0, &mrp_text);

    // Meta Details Grid (Pack Size, Mfg Date, Exp Date)
    let meta_y = hero_y - 70.0;
    let col_w = (width - 24.0) / 3.0;

    let items = [
        ("PACK SIZE", printable_ascii(&batch.pack_size, 25, "Standard")),
        ("MFG DATE", batch.mfg_date.clone().unwrap_or_else(|| "01/26".to_string())),
        ("EXP DATE", batch.expiry_date.clone().unwrap_or_else(|| "12/28".to_string())),
    ];

    for (idx, (k, v)) in items.iter().enumerate() {
        let cx = left + idx as f64 * (col_w + 12.0);
        draw_neo_card(&mut canvas, cx, meta_y, col_w, 52.0, 8.0, PdfColor::WHITE, 3.0, 2.0);

        canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
        canvas.draw_string(PdfFont::HelveticaBold, 8.0, cx + 12.0, meta_y + 34.0, k);

        let is_exp = *k == "EXP DATE";
        canvas.set_fill_color(if is_exp { PdfColor::hex(COLOR_RED) } else { PdfColor::hex(COLOR_TEXT) });
        canvas.draw_string(PdfFont::HelveticaBold, 11.0, cx + 12.0, meta_y + 15.0, v);
    }

    // Printable QR Code Sizes Section
    let qr_section_y = meta_y - 45.0;
    canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
    canvas.draw_string(PdfFont::HelveticaBold, 14.0, left, qr_section_y, "Printable Vector QR Code Sizes");

    let base_url = data.base_url.as_deref().unwrap_or("https://mac.faizal.uk");
    let qr_link = batch.qr_url.clone().unwrap_or_else(|| {
        format!("{}/public/{}?batch_no={}", base_url, batch.product_id, batch.batch_no)
    });

    let sizes = [
        ("Small (25mm)", 75.0),
        ("Medium (40mm)", 120.0),
        ("Large (60mm)", 175.0),
    ];

    let mut block_x = left;
    let block_y = qr_section_y - 240.0;

    for (label, side) in sizes {
        let frame_w = side + 24.0;
        let frame_h = side + 50.0;

        draw_neo_card(&mut canvas, block_x, block_y, frame_w, frame_h, 10.0, PdfColor::WHITE, 3.0, 2.0);

        // QR Code
        draw_qr_code(&mut canvas, &qr_link, block_x + 12.0, block_y + 36.0, side);

        // Size Label Pill
        let pill_w = frame_w - 20.0;
        draw_neo_card(&mut canvas, block_x + 10.0, block_y + 10.0, pill_w, 18.0, 6.0, PdfColor::hex(COLOR_ACCENT), 0.0, 1.5);
        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_centered_string(PdfFont::HelveticaBold, 7.5, block_x + frame_w / 2.0, block_y + 15.0, label);

        block_x += frame_w + 14.0;
    }

    draw_running_footer(&mut canvas, generated_at);
    Ok(canvas.build_pdf())
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MASTER / PRODUCT CATALOGUE RENDERER (Full Visual Parity with MacOS-Home.pdf)
// ─────────────────────────────────────────────────────────────────────────────
fn render_product_or_master_catalog_pdf(data: &CatalogRenderData, is_single_product: bool) -> Result<Vec<u8>, String> {
    if data.products.is_empty() {
        return Err("There are no products in the catalog to render.".to_string());
    }

    let mut canvas = PdfCanvas::new_a4_portrait();
    let page_w = canvas.width;
    let page_h = canvas.height;
    let left = 34.0;
    let width = page_w - left * 2.0;
    let bottom_limit = 52.0; // Above running footer (36.0pt)
    let base_url = data.base_url.as_deref().unwrap_or("https://mac.faizal.uk");
    let generated_at = data.generated_at.as_deref().unwrap_or("8 October 2026");

    // Sort products alphabetically by name across all categories (matches Puppeteer layout)
    let mut sorted_products = data.products.clone();
    sorted_products.sort_by(|a, b| {
        a.product_name.to_lowercase().cmp(&b.product_name.to_lowercase())
    });

    let total_products = sorted_products.len();
    let mut total_variants = 0;
    let mut total_batches = 0;
    for p in &sorted_products {
        total_variants += p.variants.len();
        for v in &p.variants {
            total_batches += v.batches.len();
        }
    }

    // Extract unique categories (retains full bilingual naming)
    let mut unique_categories: Vec<String> = sorted_products
        .iter()
        .map(|p| p.category.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();
    unique_categories.sort();
    unique_categories.dedup();

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION A: COVER & TABLE OF CONTENTS / INDEX FLOW (PAGES 1 - 4)
    // ─────────────────────────────────────────────────────────────────────────
    if !is_single_product {
        // Page 1 Background Fill
        canvas.set_fill_color(PdfColor::hex(COLOR_BG));
        canvas.rect(0.0, 0.0, page_w, page_h, false, true);
        // Grid overlay (matches .qr-neo-grid CSS)
        draw_page_grid(&mut canvas, page_w, page_h);

        // 1. Document Header Card
        let header_x = left;
        let header_w = width;
        let header_h = 112.0;
        let header_y = page_h - 24.0 - header_h;
        draw_neo_card(&mut canvas, header_x, header_y, header_w, header_h, 18.0, PdfColor::WHITE, 5.0, 3.0);

        canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
        canvas.draw_centered_spaced_string(PdfFont::HelveticaBold, 12.5, header_x + header_w / 2.0, header_y + 84.0, "UCA INVENTORY SYSTEM", 2.0);

        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        let title = data.title.as_deref().unwrap_or("Product Catalog");
        canvas.draw_centered_bilingual_string(36.0, header_x + header_w / 2.0, header_y + 46.0, title);

        let subtitle = data.subtitle.as_deref().unwrap_or("QR CODE PRICE LIST & REFERENCE");
        let sub_w = 260.0;
        let sub_h = 24.0;
        let sub_x = (page_w - sub_w) / 2.0;
        let sub_y = header_y + 12.0;
        draw_neo_card(&mut canvas, sub_x, sub_y, sub_w, sub_h, 8.0, PdfColor::hex(COLOR_SECONDARY), 2.5, 1.75);
        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_centered_bilingual_string(9.5, page_w / 2.0, sub_y + 7.5, subtitle);

        // 2. Metrics Row (3 Bold Neo-Brutalist Pills)
        let pill_y = header_y - 78.0;
        let pill_h = 66.0;
        let pill_gap = 16.0;
        let pill_w = (width - pill_gap * 2.0) / 3.0;

        // Pill 1: Products
        let p1_x = left;
        draw_neo_card(&mut canvas, p1_x, pill_y, pill_w, pill_h, 16.0, PdfColor::WHITE, 4.0, 2.5);
        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_centered_bilingual_string(32.0, p1_x + pill_w / 2.0, pill_y + 30.0, &total_products.to_string());
        canvas.draw_centered_bilingual_string(10.5, p1_x + pill_w / 2.0, pill_y + 12.0, "PRODUCTS");

        // Pill 2: Variants (Vibrant Blue with white text matching Puppeteer)
        let p2_x = p1_x + pill_w + pill_gap;
        draw_neo_card(&mut canvas, p2_x, pill_y, pill_w, pill_h, 16.0, PdfColor::hex(COLOR_PRIMARY), 4.0, 2.5);
        canvas.set_fill_color(PdfColor::WHITE);
        canvas.draw_centered_bilingual_string(32.0, p2_x + pill_w / 2.0, pill_y + 30.0, &total_variants.to_string());
        canvas.draw_centered_bilingual_string(10.5, p2_x + pill_w / 2.0, pill_y + 12.0, "VARIANTS");

        // Pill 3: Batches
        let p3_x = p2_x + pill_w + pill_gap;
        draw_neo_card(&mut canvas, p3_x, pill_y, pill_w, pill_h, 16.0, PdfColor::WHITE, 4.0, 2.5);
        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_centered_bilingual_string(32.0, p3_x + pill_w / 2.0, pill_y + 30.0, &total_batches.to_string());
        canvas.draw_centered_bilingual_string(10.5, p3_x + pill_w / 2.0, pill_y + 12.0, "BATCHES");

        // 3. Category Cloud (Center-aligned rows matching Puppeteer flex-wrap justify-center)
        let cat_font_size = 9.0;
        let cat_tag_h = 24.0;
        let cat_gap_x = 10.0;
        let cat_gap_y = 8.0;

        let mut cat_lines: Vec<Vec<(String, f64)>> = Vec::new();
        let mut current_line: Vec<(String, f64)> = Vec::new();
        let mut current_line_w = 0.0;

        for cat in &unique_categories {
            let tag_w = canvas.bilingual_string_width(cat_font_size, cat) + 24.0;
            let needed_w = if current_line.is_empty() { tag_w } else { current_line_w + cat_gap_x + tag_w };
            if needed_w <= width {
                current_line_w = needed_w;
                current_line.push((cat.clone(), tag_w));
            } else {
                if !current_line.is_empty() {
                    cat_lines.push(std::mem::take(&mut current_line));
                }
                current_line_w = tag_w;
                current_line.push((cat.clone(), tag_w));
            }
        }
        if !current_line.is_empty() {
            cat_lines.push(current_line);
        }

        let mut cat_y = pill_y - 24.0;
        for line in &cat_lines {
            let line_total_w: f64 = line.iter().map(|(_, w)| *w).sum::<f64>() + (line.len().saturating_sub(1) as f64) * cat_gap_x;
            let mut line_x = left + (width - line_total_w) / 2.0;

            for (label, tag_w) in line {
                draw_neo_card(&mut canvas, line_x, cat_y - cat_tag_h, *tag_w, cat_tag_h, 12.0, PdfColor::WHITE, 2.5, 1.75);
                canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
                canvas.draw_centered_bilingual_string(cat_font_size, line_x + *tag_w / 2.0, cat_y - cat_tag_h + 7.5, label);
                line_x += *tag_w + cat_gap_x;
            }
            cat_y -= cat_tag_h + cat_gap_y;
        }

        // 4. Table of Contents / Index (A–Z) Flow (2 Columns across pages)
        let index_start_y = cat_y - 18.0;
        let mut cur_col = 0; // 0: Left column, 1: Right column
        let col_w = (width - 24.0) / 2.0;
        let col_xs = [left + 6.0, left + col_w + 18.0];

        // Container Card on Page 1 (extends down to 24.0 pt because NO footer on Index pages!)
        let card_bottom = 24.0;
        let card_h = index_start_y - card_bottom;
        draw_neo_card(&mut canvas, left, card_bottom, width, card_h, 18.0, PdfColor::WHITE, 4.0, 2.5);

        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_string(PdfFont::HelveticaBold, 15.0, left + 18.0, index_start_y - 20.0, "INDEX (A-Z)");
        canvas.set_stroke_color(PdfColor::BLACK);
        canvas.set_line_width(3.0);
        canvas.line(left + 18.0, index_start_y - 25.0, left + width - 18.0, index_start_y - 25.0);

        let mut top_entry_y = index_start_y - 40.0;
        let mut cur_y = top_entry_y;
        let mut current_index_letter = String::new();
        let mut toc_overflow_page = 0;

        for product in &sorted_products {
            let starting_letter = product.product_name.chars().next().unwrap_or('A').to_uppercase().to_string();
            let is_new_letter = starting_letter != current_index_letter;

            // Avoid breaking letter groups if there is not enough column height left
            let page_col_limit = if toc_overflow_page >= 2 { 385.0 } else { 38.0 };
            let should_break_column = if is_new_letter {
                let letter_items = sorted_products.iter().filter(|p| {
                    p.product_name.chars().next().unwrap_or('A').to_uppercase().to_string() == starting_letter
                }).count();
                let group_h = 28.0 + (letter_items as f64).min(5.0) * 21.0;
                cur_y - group_h < page_col_limit && cur_y < top_entry_y - 45.0
            } else {
                cur_y - 21.0 < page_col_limit
            };

            if should_break_column {
                if cur_col == 0 {
                    cur_col = 1;
                    cur_y = top_entry_y;
                } else {
                    // Page overflow in TOC -> New Page (NO footer on Index pages!)
                    canvas.new_page();
                    canvas.set_fill_color(PdfColor::hex(COLOR_BG));
                    canvas.rect(0.0, 0.0, page_w, page_h, false, true);
                    toc_overflow_page += 1;

                    // Re-draw grid on new overflow page FIRST
                    draw_page_grid(&mut canvas, page_w, page_h);

                    // New Index Card container — on Page 3, leave room for Popular Suggestions
                    let card_bottom = if toc_overflow_page >= 2 { 370.0 } else { 24.0 };
                    let new_card_h = page_h - 32.0 - card_bottom;
                    draw_neo_card(&mut canvas, left, card_bottom, width, new_card_h, 18.0, PdfColor::WHITE, 4.0, 2.5);

                    top_entry_y = page_h - 52.0;
                    cur_col = 0;
                    cur_y = top_entry_y;
                }
            }

            if is_new_letter {
                current_index_letter = starting_letter.clone();
                let col_x = col_xs[cur_col];
                canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
                canvas.draw_bilingual_string(18.0, col_x + 6.0, cur_y - 14.0, &current_index_letter);
                canvas.set_stroke_color(PdfColor::BLACK);
                canvas.set_line_width(2.0);
                canvas.line(col_x + 6.0, cur_y - 18.0, col_x + col_w - 6.0, cur_y - 18.0);
                cur_y -= 28.0;
            }

            let col_x = col_xs[cur_col];
            let display_name = if let Some(ref odia) = product.odia_name {
                if !odia.trim().is_empty() && !product.product_name.contains(odia.trim()) {
                    format!("{} ({})", product.product_name.trim(), odia.trim())
                } else {
                    product.product_name.trim().to_string()
                }
            } else {
                product.product_name.trim().to_string()
            };

            // Badge with Variant and Batch Count
            let mut b_count = 0;
            for v in &product.variants {
                b_count += v.batches.len();
            }
            let info_str = format!("{}V · {}B", product.variants.len(), b_count);
            let info_w = canvas.bilingual_string_width(8.5, &info_str) + 14.0;
            let badge_x = col_x + col_w - info_w - 6.0;

            // Maximum width for product name before leader line and badge
            let max_name_w = (col_w - info_w - 20.0).max(40.0);
            let mut name_to_draw = display_name.clone();
            while canvas.bilingual_string_width(9.5, &name_to_draw) > max_name_w && name_to_draw.chars().count() > 10 {
                name_to_draw.pop();
            }
            if name_to_draw.len() < display_name.len() {
                name_to_draw.push('…');
            }

            // Product Name (9.5pt bold bilingual)
            canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
            canvas.draw_bilingual_string(9.5, col_x + 6.0, cur_y - 11.0, &name_to_draw);

            draw_neo_card(&mut canvas, badge_x, cur_y - 13.0, info_w, 15.0, 4.0, PdfColor::hex(COLOR_SECONDARY), 0.0, 1.25);
            canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
            canvas.draw_centered_bilingual_string(8.0, badge_x + info_w / 2.0, cur_y - 9.0, &info_str);

            // Interactive Clickable Link Annotation for Index Product
            let prod_url = format!("{}/public/{}", base_url, product.product_id);
            canvas.add_link_annotation(col_x + 6.0, cur_y - 14.0, col_w - 12.0, 17.0, &prod_url);

            // Dotted Leader Line
            let name_end_x = col_x + 6.0 + canvas.bilingual_string_width(9.5, &name_to_draw) + 6.0;
            let dot_end_x = badge_x - 6.0;
            if dot_end_x > name_end_x + 8.0 {
                canvas.set_stroke_color(PdfColor::BLACK);
                canvas.set_line_width(1.75);
                canvas.set_dash(1.5, 3.0);
                canvas.line(name_end_x, cur_y - 7.5, dot_end_x, cur_y - 7.5);
                canvas.set_dash(0.0, 0.0); // Reset dash
            }

            cur_y -= 21.0;
        }

        // 5. Popular Suggestions Section (Positioned neatly below Index card on Page 3)
        // (NO footer on Page 3!)
        let pop_y = 24.0;
        let pop_h = 328.0;
        draw_neo_card(&mut canvas, left, pop_y, width, pop_h, 18.0, PdfColor::hex(COLOR_PRIMARY), 5.0, 3.0);

        // SVG background decorative shapes (.qr-popular-shapes) with 0.12 opacity
        canvas.set_alpha(0.12);
        // Shape 1: Accent Cyan Circle (top right)
        canvas.set_stroke_color(PdfColor::hex(COLOR_ACCENT));
        canvas.set_line_width(4.0);
        canvas.circle(left + width - 45.0, pop_y + pop_h - 22.0, 32.0, true, false);

        // Shape 2: Yellow Cross (+) (bottom left)
        canvas.set_fill_color(PdfColor::hex(COLOR_SECONDARY));
        canvas.draw_string(PdfFont::HelveticaBold, 42.0, left + 22.0, pop_y + 18.0, "+");

        // Shape 3: White Square rotated/offset (top left)
        canvas.set_stroke_color(PdfColor::WHITE);
        canvas.set_line_width(3.0);
        canvas.round_rect(left + 65.0, pop_y + pop_h - 42.0, 30.0, 30.0, 5.0, true, false);

        // Shape 4: Cyan dots (bottom right)
        canvas.set_fill_color(PdfColor::hex(COLOR_ACCENT));
        canvas.draw_string(PdfFont::HelveticaBold, 22.0, left + width - 85.0, pop_y + 18.0, ". . .");
        canvas.set_alpha(1.0);

        // Header with Yellow diamonds
        canvas.set_fill_color(PdfColor::WHITE);
        canvas.draw_centered_spaced_string(PdfFont::HelveticaBold, 14.0, left + width / 2.0, pop_y + pop_h - 20.0, "POPULAR SUGGESTIONS", 2.5);
        canvas.set_fill_color(PdfColor::hex(COLOR_SECONDARY));
        canvas.diamond(left + width / 2.0 - 135.0, pop_y + pop_h - 15.0, 5.0, true, true);
        canvas.diamond(left + width / 2.0 + 135.0, pop_y + pop_h - 15.0, 5.0, true, true);
        canvas.set_fill_color(PdfColor::BLACK);
        canvas.diamond(left + width / 2.0 - 135.0, pop_y + pop_h - 15.0, 5.0, false, false);
        canvas.diamond(left + width / 2.0 + 135.0, pop_y + pop_h - 15.0, 5.0, false, false);

        // Featured Chips — 6 chips in 2 columns × 3 rows matching Puppeteer Page 3
        let mut featured: Vec<&CatalogProductItem> = sorted_products.iter().filter(|p| p.is_gold).collect();
        let mut remaining: Vec<&CatalogProductItem> = sorted_products.iter().filter(|p| !p.is_gold).collect();
        remaining.sort_by(|a, b| {
            let a_b: usize = a.variants.iter().map(|v| v.batches.len()).sum();
            let b_b: usize = b.variants.iter().map(|v| v.batches.len()).sum();
            b_b.cmp(&a_b)
        });
        featured.extend(remaining);
        featured.truncate(6);

        // 2-column layout: 2 per row, 3 rows of tall vibrant yellow cards
        let cols = 2usize;
        let chip_gap_x = 14.0;
        let chip_gap_y = 12.0;
        let chip_h = 74.0;
        let chip_w = (width - chip_gap_x - 24.0) / cols as f64;
        let chips_start_y = pop_y + pop_h - 42.0;

        for (i, p) in featured.iter().enumerate() {
            let row = i / cols;
            let col = i % cols;
            let cx = left + 12.0 + col as f64 * (chip_w + chip_gap_x);
            let cy = chips_start_y - row as f64 * (chip_h + chip_gap_y);

            // Card body: Vibrant Yellow with bold Neo-Brutalist border and shadow
            draw_neo_card(&mut canvas, cx, cy - chip_h, chip_w, chip_h, 12.0, PdfColor::hex(COLOR_SECONDARY), 2.5, 2.0);

            // Interactive Link Annotation on Popular Suggestion Chip
            let pop_url = format!("{}/public/{}", base_url, p.product_id);
            canvas.add_link_annotation(cx, cy - chip_h, chip_w, chip_h, &pop_url);

            // Product name (11.0pt bold bilingual, centered)
            let display_pname = if let Some(ref odia) = p.odia_name {
                if !odia.trim().is_empty() && !p.product_name.contains(odia.trim()) {
                    format!("{} ({})", p.product_name.trim(), odia.trim())
                } else {
                    p.product_name.trim().to_string()
                }
            } else {
                p.product_name.trim().to_string()
            };
            canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
            canvas.draw_centered_bilingual_string(11.0, cx + chip_w / 2.0, cy - 20.0, &display_pname);

            // Subtitle: Category & Gold indicator (8.0pt bold bilingual, charcoal text, centered)
            let cat = p.category.trim();
            let sub = if p.is_gold && !cat.to_uppercase().contains("GOLD") {
                format!("{} (GOLD PREPARATION)", cat)
            } else {
                cat.to_string()
            };
            canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
            canvas.draw_centered_bilingual_string(8.0, cx + chip_w / 2.0, cy - 36.0, &sub);

            // Variant · Batch count badge centered at bottom of chip
            let mut b_cnt = 0;
            for v in &p.variants { b_cnt += v.batches.len(); }
            let stat = format!("{}V · {}B", p.variants.len(), b_cnt);
            let stat_w = canvas.bilingual_string_width(8.5, &stat) + 16.0;
            let badge_x = cx + (chip_w - stat_w) / 2.0;
            let badge_y = cy - chip_h + 10.0;
            draw_neo_card(&mut canvas, badge_x, badge_y, stat_w, 18.0, 9.0, PdfColor::hex(COLOR_TEXT), 0.0, 1.25);
            canvas.set_fill_color(PdfColor::WHITE);
            canvas.draw_centered_bilingual_string(8.5, cx + chip_w / 2.0, badge_y + 4.5, &stat);
        }

        // NO footer on Page 3! Just advance to Product Section
        canvas.new_page();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION B: PRODUCT CATALOGUE PAGES (PAGES 5 - 42)
    // ─────────────────────────────────────────────────────────────────────────
    canvas.set_fill_color(PdfColor::hex(COLOR_BG));
    canvas.rect(0.0, 0.0, page_w, page_h, false, true);

    let mut cursor_y = page_h - 38.0;
    let card_w = 168.75;
    let card_h = 124.0; // Roomy card matching Puppeteer's bold neo-brutalist cards
    let mut current_render_letter = String::new();

    for product in &sorted_products {
        let starting_letter = product.product_name.chars().next().unwrap_or('A').to_uppercase().to_string();
        let is_new_letter = starting_letter != current_render_letter;

        // Estimate space: letter break + product header + 1 batch row
        let needed_space = {
            let mut n = 36.0 + card_h; // product header + 1 card row
            if is_new_letter { n += 46.0; }
            n
        };
        if cursor_y - needed_space < bottom_limit && cursor_y < page_h - 100.0 {
            draw_running_footer(&mut canvas, generated_at);
            canvas.new_page();
            canvas.set_fill_color(PdfColor::hex(COLOR_BG));
            canvas.rect(0.0, 0.0, page_w, page_h, false, true);
            draw_page_grid(&mut canvas, page_w, page_h);
            cursor_y = page_h - 38.0;
        }

        // ── Alphabetical Letter Break (.qr-letter-break) ────────────────────────
        if is_new_letter {
            current_render_letter = starting_letter.clone();

            // Large letter with cyan drop shadow (38pt display font)
            let char_x = left;
            let char_y = cursor_y - 32.0;
            canvas.set_fill_color(PdfColor::hex(COLOR_ACCENT));
            canvas.draw_string(PdfFont::HelveticaBold, 38.0, char_x + 2.5, char_y - 2.5, &current_render_letter);
            canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
            canvas.draw_string(PdfFont::HelveticaBold, 38.0, char_x, char_y, &current_render_letter);

            // 4px thick black divider line
            let line_start_x = char_x + canvas.string_width(PdfFont::HelveticaBold, 38.0, &current_render_letter) + 16.0;
            canvas.set_stroke_color(PdfColor::BLACK);
            canvas.set_line_width(4.0);
            canvas.line(line_start_x, char_y + 10.0, left + width, char_y + 10.0);

            cursor_y -= 44.0;
        }

        // ── Product Header (.qr-product-header) ──────────────────────────────
        let display_pname = if let Some(ref odia) = product.odia_name {
            if !odia.trim().is_empty() && !product.product_name.contains(odia.trim()) {
                format!("{} ({})", product.product_name.trim(), odia.trim())
            } else {
                product.product_name.trim().to_string()
            }
        } else {
            product.product_name.trim().to_string()
        };

        // Measure wrapped name to determine header height
        let name_max_w = width - 210.0; // reserve right side for badges
        let name_lines = canvas.wrap_bilingual_text(12.0, &display_pname, name_max_w);
        let name_line_count = name_lines.len().max(1);
        let prod_h = (15.0 * name_line_count as f64 + 18.0).max(36.0);
        let prod_y = cursor_y - prod_h;
        draw_neo_card(&mut canvas, left, prod_y, width, prod_h, 8.0, PdfColor::hex(COLOR_PRIMARY), 2.5, 2.0);

        // Product interactive link on product header
        let p_url = format!("{}/public/{}", base_url, product.product_id);
        canvas.add_link_annotation(left, prod_y, width, prod_h, &p_url);

        // Product Name — word-wrapped in 12pt bold white
        canvas.set_fill_color(PdfColor::WHITE);
        let name_text_y = prod_y + prod_h - 22.0;
        for (li, line) in name_lines.iter().enumerate() {
            canvas.draw_bilingual_string(12.0, left + 12.0, name_text_y - li as f64 * 14.0, line);
        }

        let mut right_cursor = left + width - 12.0;
        let badge_h = 18.0;
        let badge_y = prod_y + prod_h - 26.0;

        // Batch Count Badge (Cyan Pill)
        let mut p_batches = 0;
        for v in &product.variants { p_batches += v.batches.len(); }
        let b_badge_text = format!("{} Batch{}", p_batches, if p_batches == 1 { "" } else { "es" });
        let b_badge_w = canvas.bilingual_string_width(8.5, &b_badge_text) + 16.0;
        let b_badge_x = right_cursor - b_badge_w;
        draw_neo_card(&mut canvas, b_badge_x, badge_y, b_badge_w, badge_h, 9.0, PdfColor::hex(COLOR_ACCENT), 0.0, 1.25);
        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_centered_bilingual_string(8.5, b_badge_x + b_badge_w / 2.0, badge_y + 4.5, &b_badge_text);
        right_cursor = b_badge_x - 8.0;

        // Gold Badge (if gold)
        if product.is_gold {
            let gold_w = canvas.bilingual_string_width(8.5, "GOLD") + 16.0;
            let gold_x = right_cursor - gold_w;
            draw_neo_card(&mut canvas, gold_x, badge_y, gold_w, badge_h, 9.0, PdfColor::hex(COLOR_SECONDARY), 0.0, 1.25);
            canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
            canvas.draw_centered_bilingual_string(8.5, gold_x + gold_w / 2.0, badge_y + 4.5, "GOLD");
            right_cursor = gold_x - 8.0;
        }

        // Category Pill (only show if not already in category section header)
        let cat_label = product.category.trim();
        let cat_w = canvas.bilingual_string_width(8.0, cat_label) + 16.0;
        let cat_x = right_cursor - cat_w;
        draw_neo_card(&mut canvas, cat_x, badge_y, cat_w, badge_h, 9.0, PdfColor::WHITE, 0.0, 1.0);
        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_centered_bilingual_string(8.0, cat_x + cat_w / 2.0, badge_y + 4.5, cat_label);

        cursor_y -= prod_h + 5.0;

        // ── Product Meta Strip (ADDED / UPDATED) ─────────────────────────────
        let add_date = product.created_at.as_deref().unwrap_or("23 Feb 2026");
        let upd_date = product.updated_at.as_deref().unwrap_or(add_date);

        // ADDED pill
        draw_neo_card(&mut canvas, left + 4.0, cursor_y - 14.0, 44.0, 14.0, 3.5, PdfColor::hex("#e2e8f0"), 0.0, 1.0);
        canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
        canvas.draw_centered_bilingual_string(7.0, left + 26.0, cursor_y - 10.5, "ADDED");
        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_bilingual_string(8.5, left + 54.0, cursor_y - 10.5, &printable_ascii(add_date, 25, ""));

        // UPDATED pill
        let upd_x = left + 160.0;
        draw_neo_card(&mut canvas, upd_x, cursor_y - 14.0, 56.0, 14.0, 3.5, PdfColor::hex("#e2e8f0"), 0.0, 1.0);
        canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
        canvas.draw_centered_bilingual_string(7.0, upd_x + 28.0, cursor_y - 10.5, "UPDATED");
        canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
        canvas.draw_bilingual_string(8.5, upd_x + 66.0, cursor_y - 10.5, &printable_ascii(upd_date, 25, ""));

        cursor_y -= 19.0;

        // ── Variants and Batches ───────────────────────────────────────────────
        // Sort variants by pack_size so hierarchy is deterministic
        let mut sorted_variants = product.variants.clone();
        sorted_variants.sort_by(|a, b| a.pack_size.cmp(&b.pack_size));
        for variant in &sorted_variants {
            if cursor_y - (18.0 + card_h) < bottom_limit {
                draw_running_footer(&mut canvas, generated_at);
                canvas.new_page();
                canvas.set_fill_color(PdfColor::hex(COLOR_BG));
                canvas.rect(0.0, 0.0, page_w, page_h, false, true);
                draw_page_grid(&mut canvas, page_w, page_h);
                cursor_y = page_h - 38.0;
            }

            // Variant Tag (.qr-variant-tag)
            let pack_str = if variant.pack_size.trim().is_empty() { "Standard".to_string() } else { variant.pack_size.clone() };
            let pack_w = canvas.bilingual_string_width(9.5, &pack_str) + 18.0;
            draw_neo_card(&mut canvas, left, cursor_y - 18.0, pack_w, 18.0, 9.0, PdfColor::hex(COLOR_SECONDARY), 0.0, 1.25);
            canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
            canvas.draw_bilingual_string(9.5, left + 9.0, cursor_y - 13.5, &pack_str);

            cursor_y -= 24.0;

            // Batch Cards Grid (3 Columns)
            let col_gap = (width - card_w * 3.0) / 2.0;

            for (b_idx, batch) in variant.batches.iter().enumerate() {
                let col = b_idx % 3;
                if col == 0 && b_idx > 0 {
                    cursor_y -= card_h + 10.0;
                    if cursor_y - card_h < bottom_limit {
                        draw_running_footer(&mut canvas, generated_at);
                        canvas.new_page();
                        canvas.set_fill_color(PdfColor::hex(COLOR_BG));
                        canvas.rect(0.0, 0.0, page_w, page_h, false, true);
                        draw_page_grid(&mut canvas, page_w, page_h);
                        cursor_y = page_h - 38.0;
                    }
                }

                let card_x = left + col as f64 * (card_w + col_gap);
                let card_y = cursor_y - card_h;

                // 1. Neo-Brutalist Frame with Drop Shadow
                draw_neo_card(&mut canvas, card_x, card_y, card_w, card_h, 8.0, PdfColor::WHITE, 3.0, 2.0);

                // 2. Cyan Header Strip (.qr-batch-top)
                let strip_h = 28.0;
                let strip_y = card_y + card_h - strip_h;
                canvas.set_fill_color(PdfColor::hex(COLOR_ACCENT));
                canvas.round_rect(card_x, strip_y, card_w, strip_h, 8.0, false, true);
                canvas.rect(card_x, strip_y, card_w, 8.0, false, true); // square bottom

                canvas.set_stroke_color(PdfColor::BLACK);
                canvas.set_line_width(2.0);
                canvas.line(card_x, strip_y, card_x + card_w, strip_y);
                canvas.round_rect(card_x, card_y, card_w, card_h, 8.0, true, false); // re-stroke

                // Batch Number Pill (White)
                let bno_clean = printable_ascii(&batch.batch_no, 18, "BATCH");
                let bno_w = canvas.bilingual_string_width(9.5, &bno_clean) + 14.0;
                draw_neo_card(&mut canvas, card_x + 6.0, strip_y + 4.5, bno_w, 19.0, 4.0, PdfColor::WHITE, 0.0, 1.5);
                canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
                canvas.draw_bilingual_string(9.5, card_x + 13.0, strip_y + 9.5, &bno_clean);

                // MRP Pill (Yellow with black border)
                let mrp_str = format!("₹ {:.2}", batch.mrp);
                let mrp_w = canvas.bilingual_string_width(11.0, &mrp_str) + 14.0;
                let mrp_x = card_x + card_w - mrp_w - 6.0;
                draw_neo_card(&mut canvas, mrp_x, strip_y + 4.0, mrp_w, 20.0, 6.0, PdfColor::hex(COLOR_SECONDARY), 0.0, 1.5);
                canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
                canvas.draw_bilingual_string(11.0, mrp_x + 7.0, strip_y + 9.0, &mrp_str);

                // 3. Body: Left metadata (MFG / EXP) & Right QR Code
                let mfg_str = batch.mfg_date.as_deref().unwrap_or("Not Defined");
                let clean_mfg = printable_ascii(mfg_str, 16, "Not Defined");
                canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
                canvas.draw_bilingual_string(7.5, card_x + 9.0, card_y + 68.0, "MFG");
                canvas.set_fill_color(PdfColor::hex(COLOR_TEXT));
                canvas.draw_bilingual_string(9.0, card_x + 9.0, card_y + 55.0, &clean_mfg);

                let exp_str = batch.expiry_date.as_deref().unwrap_or("Not Defined");
                let clean_exp = printable_ascii(exp_str, 16, "Not Defined");
                canvas.set_fill_color(PdfColor::hex(COLOR_PRIMARY));
                canvas.draw_bilingual_string(7.5, card_x + 9.0, card_y + 37.0, "EXP");
                let is_exp_red = !clean_exp.eq_ignore_ascii_case("Not Defined");
                canvas.set_fill_color(if is_exp_red { PdfColor::hex(COLOR_RED) } else { PdfColor::hex(COLOR_TEXT) });
                canvas.draw_bilingual_string(9.0, card_x + 9.0, card_y + 24.0, &clean_exp);

                // Pack size label below EXP
                let pack_label = if variant.pack_size.trim().is_empty() { "Standard".to_string() } else {
                    variant.pack_size.trim().to_string()
                };
                canvas.set_fill_color(PdfColor::hex(COLOR_TEXT_MUTED));
                canvas.draw_bilingual_string(7.5, card_x + 9.0, card_y + 10.0, &pack_label);

                // Vector QR Code (.qr-code-img)
                let qr_url = batch.qr_url.clone().unwrap_or_else(|| {
                    format!("{}/public/{}?batch_no={}", base_url, product.product_id, batch.batch_no)
                });
                let box_side = 62.0;
                let box_x = card_x + card_w - box_side - 8.0;
                let box_y = card_y + 16.0;
                // White frame with subtle shadow
                draw_neo_card(&mut canvas, box_x, box_y, box_side, box_side, 6.0, PdfColor::WHITE, 2.0, 1.25);
                draw_qr_code(&mut canvas, &qr_url, box_x + 4.0, box_y + 4.0, box_side - 8.0);

                // ── CLICKABLE LINK ANNOTATION on the entire batch card ──────────────
                canvas.add_link_annotation(
                    card_x,
                    card_y,
                    card_w,
                    card_h,
                    &qr_url,
                );
            }

            cursor_y -= card_h + 10.0;
        }

        cursor_y -= 14.0; // Space between products
    }

    // Running footer on final page
    draw_running_footer(&mut canvas, generated_at);

    Ok(canvas.build_pdf())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_catalog() -> CatalogRenderData {
        CatalogRenderData {
            catalog_type: CatalogType::Master,
            title: Some("UCA Test Catalog".to_string()),
            subtitle: Some("Automated Rust Engine Verification".to_string()),
            base_url: Some("https://catalog.example.com".to_string()),
            generated_at: Some("8 October 2026 at 12:44 am".to_string()),
            products: vec![
                CatalogProductItem {
                    product_id: "101".to_string(),
                    product_name: "Amoxicillin and Potassium Clavulanate Tablets IP 625mg".to_string(),
                    odia_name: None,
                    category: "Antibiotics".to_string(),
                    is_gold: true,
                    created_at: Some("2026-01-01".to_string()),
                    updated_at: Some("2026-02-01".to_string()),
                    variants: vec![
                        CatalogVariantItem {
                            variant_id: Some("1".to_string()),
                            pack_size: "10x10 Strips".to_string(),
                            batches: vec![
                                CatalogBatchItem {
                                    batch_id: Some("B1".to_string()),
                                    batch_no: "AMX-2026".to_string(),
                                    mrp: 185.50,
                                    mfg_date: Some("01/26".to_string()),
                                    expiry_date: Some("12/27".to_string()),
                                    qr_url: Some("https://catalog.example.com/p/101?b=AMX-2026".to_string()),
                                },
                            ],
                        },
                    ],
                },
                CatalogProductItem {
                    product_id: "102".to_string(),
                    product_name: "Paracetamol Paediatric Oral Suspension".to_string(),
                    odia_name: None,
                    category: "Analgesics".to_string(),
                    is_gold: false,
                    created_at: Some("2026-01-01".to_string()),
                    updated_at: Some("2026-02-01".to_string()),
                    variants: vec![
                        CatalogVariantItem {
                            variant_id: Some("2".to_string()),
                            pack_size: "60 ml".to_string(),
                            batches: vec![
                                CatalogBatchItem {
                                    batch_id: Some("B2".to_string()),
                                    batch_no: "PCM-099".to_string(),
                                    mrp: 42.00,
                                    mfg_date: Some("02/26".to_string()),
                                    expiry_date: Some("01/28".to_string()),
                                    qr_url: None,
                                },
                            ],
                        },
                    ],
                },
            ],
            single_batch: None,
        }
    }

    #[test]
    fn test_master_catalog_pdf_generation() {
        let req = sample_catalog();
        let pdf = render_catalog_pdf(&req).expect("Failed to render master catalog PDF");
        let pdf_str = String::from_utf8_lossy(&pdf);
        assert!(pdf_str.starts_with("%PDF-1.4"));
        assert!(pdf_str.contains("UCA INVENTORY SYSTEM"));
        assert!(pdf_str.contains("Amoxicillin"));
        assert!(pdf_str.contains("Paracetamol"));
        assert!(pdf_str.contains("UCA · PRODUCT CATALOG"));
        assert!(pdf_str.contains("%%EOF"));
    }

    #[test]
    fn test_single_batch_pdf_generation() {
        let req = CatalogRenderData {
            catalog_type: CatalogType::Batch,
            title: None,
            subtitle: None,
            base_url: Some("https://catalog.example.com".to_string()),
            generated_at: Some("8 October 2026".to_string()),
            products: Vec::new(),
            single_batch: Some(SingleBatchParams {
                product_id: "101".to_string(),
                product_name: "Amoxicillin 625mg".to_string(),
                pack_size: "10 Strips".to_string(),
                batch_no: "AMX-99".to_string(),
                mrp: 145.0,
                mfg_date: Some("01/26".to_string()),
                expiry_date: Some("12/27".to_string()),
                qr_url: None,
            }),
        };
        let pdf = render_catalog_pdf(&req).expect("Failed to render single batch PDF");
        let pdf_str = String::from_utf8_lossy(&pdf);
        assert!(pdf_str.starts_with("%PDF-1.4"));
        assert!(pdf_str.contains("Batch QR Code"));
        assert!(pdf_str.contains("AMX-99"));
        assert!(pdf_str.contains("145.00"));
        assert!(pdf_str.contains("%%EOF"));
    }
}
