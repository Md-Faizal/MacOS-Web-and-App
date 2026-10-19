// ─────────────────────────────────────────────────────────────────────────────
// Pure Rust Vector PDF 1.4 Writer (Zero Dependencies)
// Generates standard compliant PDF documents with Type 1 Helvetica fonts
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PdfFont {
    Helvetica,
    HelveticaBold,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PdfColor {
    pub r: f64,
    pub g: f64,
    pub b: f64,
}

impl PdfColor {
    pub const BLACK: Self = Self {
        r: 0.0,
        g: 0.0,
        b: 0.0,
    };
    pub const WHITE: Self = Self {
        r: 1.0,
        g: 1.0,
        b: 1.0,
    };
    pub const GRAY_BAR: Self = Self {
        r: 0.768,
        g: 0.768,
        b: 0.768,
    }; // #c4c4c4
    pub const NAVY_BLUE: Self = Self {
        r: 0.102,
        g: 0.137,
        b: 0.494,
    }; // #1a237e

    pub fn hex(hex_str: &str) -> Self {
        let s = hex_str.trim().trim_start_matches('#');
        if s.len() == 6 {
            if let Ok(num) = u32::from_str_radix(s, 16) {
                let r = ((num >> 16) & 0xFF) as f64 / 255.0;
                let g = ((num >> 8) & 0xFF) as f64 / 255.0;
                let b = (num & 0xFF) as f64 / 255.0;
                return Self { r, g, b };
            }
        }
        Self::BLACK
    }
}

/// A clickable URI link annotation rectangle on a page.
#[derive(Debug, Clone)]
pub struct LinkAnnotation {
    /// Bottom-left x in PDF user space (points from bottom)
    pub x: f64,
    /// Bottom-left y in PDF user space
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub url: String,
}

pub struct PdfImage {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

pub struct PdfCanvas {
    pub width: f64,
    pub height: f64,
    stream: String,
    pages: Vec<PdfPage>,
    images: Vec<PdfImage>,
    current_stroke: PdfColor,
    current_fill: PdfColor,
    current_line_width: f64,
    /// Annotations for the *current* (in-progress) page
    current_annots: Vec<LinkAnnotation>,
}

struct PdfPage {
    stream: String,
    width: f64,
    height: f64,
    annots: Vec<LinkAnnotation>,
}

impl PdfCanvas {
    pub fn new_a4_landscape() -> Self {
        // A4 Landscape: 841.89 pt x 595.28 pt (297mm x 210mm)
        Self {
            width: 841.89,
            height: 595.28,
            stream: String::with_capacity(16384),
            pages: Vec::new(),
            images: Vec::new(),
            current_stroke: PdfColor::BLACK,
            current_fill: PdfColor::BLACK,
            current_line_width: 1.0,
            current_annots: Vec::new(),
        }
    }

    pub fn new_a4_portrait() -> Self {
        Self {
            width: 595.28,
            height: 841.89,
            stream: String::with_capacity(16384),
            pages: Vec::new(),
            images: Vec::new(),
            current_stroke: PdfColor::BLACK,
            current_fill: PdfColor::BLACK,
            current_line_width: 1.0,
            current_annots: Vec::new(),
        }
    }

    pub fn new_page(&mut self) {
        self.pages.push(PdfPage {
            stream: std::mem::take(&mut self.stream),
            width: self.width,
            height: self.height,
            annots: std::mem::take(&mut self.current_annots),
        });
        self.current_stroke = PdfColor::BLACK;
        self.current_fill = PdfColor::BLACK;
        self.current_line_width = 1.0;
    }

    /// Add a clickable URI rectangle to the current page.
    /// `x`, `y` are bottom-left in PDF coordinate space (origin = bottom-left of page).
    pub fn add_link_annotation(&mut self, x: f64, y: f64, width: f64, height: f64, url: &str) {
        if !url.trim().is_empty() {
            self.current_annots.push(LinkAnnotation {
                x,
                y,
                width,
                height,
                url: url.to_string(),
            });
        }
    }

    /// Register a JPEG image in the PDF catalog. Returns 1-based image_id.
    pub fn add_jpeg_image(&mut self, data: Vec<u8>, width: u32, height: u32) -> Result<usize, String> {
        let (w, h) = if width > 0 && height > 0 {
            (width, height)
        } else {
            parse_jpeg_size(&data).ok_or_else(|| "Failed to parse JPEG dimensions".to_string())?
        };
        self.images.push(PdfImage {
            width: w,
            height: h,
            data,
        });
        Ok(self.images.len())
    }

    /// Draw a registered image at bottom-left `(x, y)` with given dimensions in points.
    pub fn draw_image(&mut self, image_id: usize, x: f64, y: f64, width: f64, height: f64) {
        if image_id > 0 && image_id <= self.images.len() {
            self.stream.push_str(&format!(
                "q {:.2} 0 0 {:.2} {:.2} {:.2} cm /Im{} Do Q\n",
                width, height, x, y, image_id
            ));
        }
    }

    /// Retrieve the parsed dimensions (width, height) of a registered image.
    pub fn get_image_size(&self, image_id: usize) -> Option<(u32, u32)> {
        if image_id > 0 && image_id <= self.images.len() {
            let img = &self.images[image_id - 1];
            Some((img.width, img.height))
        } else {
            None
        }
    }

    pub fn new_page_with_size(&mut self, width: f64, height: f64) {
        self.new_page();
        self.width = width;
        self.height = height;
    }

    pub fn set_stroke_color(&mut self, color: PdfColor) {
        if self.current_stroke.r != color.r
            || self.current_stroke.g != color.g
            || self.current_stroke.b != color.b
        {
            self.stream.push_str(&format!(
                "{:.3} {:.3} {:.3} RG\n",
                color.r, color.g, color.b
            ));
            self.current_stroke = color;
        }
    }

    pub fn set_fill_color(&mut self, color: PdfColor) {
        if self.current_fill.r != color.r
            || self.current_fill.g != color.g
            || self.current_fill.b != color.b
        {
            self.stream.push_str(&format!(
                "{:.3} {:.3} {:.3} rg\n",
                color.r, color.g, color.b
            ));
            self.current_fill = color;
        }
    }

    pub fn save_state(&mut self) {
        self.stream.push_str("q\n");
    }

    pub fn restore_state(&mut self) {
        self.stream.push_str("Q\n");
        self.current_stroke = PdfColor {
            r: -1.0,
            g: -1.0,
            b: -1.0,
        };
        self.current_fill = PdfColor {
            r: -1.0,
            g: -1.0,
            b: -1.0,
        };
        self.current_line_width = -1.0;
    }

    pub fn set_alpha(&mut self, alpha: f64) {
        if (alpha - 0.12).abs() < 0.015 {
            self.stream.push_str("/GS_a12 gs\n");
        } else if (alpha - 0.09).abs() < 0.015 {
            self.stream.push_str("/GS_a09 gs\n");
        } else if (alpha - 0.15).abs() < 0.015 {
            self.stream.push_str("/GS_a15 gs\n");
        } else if (alpha - 0.18).abs() < 0.015 {
            self.stream.push_str("/GS_a18 gs\n");
        } else if (alpha - 0.08).abs() < 0.015 {
            self.stream.push_str("/GS_a08 gs\n");
        } else if (alpha - 0.04).abs() < 0.015 {
            self.stream.push_str("/GS_a04 gs\n");
        } else {
            self.stream.push_str("/GS_a100 gs\n");
        }
    }

    pub fn set_dash(&mut self, dash: f64, space: f64) {
        if dash <= 0.0 {
            self.stream.push_str("[] 0 d\n");
        } else {
            self.stream.push_str(&format!("[{:.2} {:.2}] 0 d\n", dash, space));
        }
    }

    pub fn move_to(&mut self, x: f64, y: f64) {
        self.stream.push_str(&format!("{:.2} {:.2} m\n", x, y));
    }

    pub fn line_to(&mut self, x: f64, y: f64) {
        self.stream.push_str(&format!("{:.2} {:.2} l\n", x, y));
    }

    pub fn curve_to(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, x3: f64, y3: f64) {
        self.stream.push_str(&format!(
            "{:.2} {:.2} {:.2} {:.2} {:.2} {:.2} c\n",
            x1, y1, x2, y2, x3, y3
        ));
    }

    pub fn close_path(&mut self) {
        self.stream.push_str("h\n");
    }

    pub fn stroke(&mut self) {
        self.stream.push_str("S\n");
    }

    pub fn fill(&mut self) {
        self.stream.push_str("f\n");
    }

    pub fn fill_and_stroke(&mut self) {
        self.stream.push_str("B\n");
    }

    pub fn circle(&mut self, cx: f64, cy: f64, r: f64, stroke: bool, fill: bool) {
        let k = r * 0.5522847498307935;
        self.move_to(cx + r, cy);
        self.curve_to(cx + r, cy + k, cx + k, cy + r, cx, cy + r);
        self.curve_to(cx - k, cy + r, cx - r, cy + k, cx - r, cy);
        self.curve_to(cx - r, cy - k, cx - k, cy - r, cx, cy - r);
        self.curve_to(cx + k, cy - r, cx + r, cy - k, cx + r, cy);
        self.close_path();
        match (stroke, fill) {
            (true, true) => self.fill_and_stroke(),
            (true, false) => self.stroke(),
            (false, true) => self.fill(),
            (false, false) => {}
        }
    }

    pub fn diamond(&mut self, cx: f64, cy: f64, r: f64, stroke: bool, fill: bool) {
        self.move_to(cx, cy + r);
        self.line_to(cx + r, cy);
        self.line_to(cx, cy - r);
        self.line_to(cx - r, cy);
        self.close_path();
        match (stroke, fill) {
            (true, true) => self.fill_and_stroke(),
            (true, false) => self.stroke(),
            (false, true) => self.fill(),
            (false, false) => {}
        }
    }

    pub fn round_rect(&mut self, x: f64, y: f64, w: f64, h: f64, r: f64, stroke: bool, fill: bool) {
        let r = r.min(w / 2.0).min(h / 2.0);
        let k = r * 0.55228475;
        self.move_to(x + r, y);
        self.line_to(x + w - r, y);
        self.curve_to(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
        self.line_to(x + w, y + h - r);
        self.curve_to(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
        self.line_to(x + r, y + h);
        self.curve_to(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
        self.line_to(x, y + r);
        self.curve_to(x, y + r - k, x + r - k, y, x + r, y);
        self.close_path();
        match (stroke, fill) {
            (true, true) => self.fill_and_stroke(),
            (true, false) => self.stroke(),
            (false, true) => self.fill(),
            (false, false) => {}
        }
    }

    pub fn set_line_width(&mut self, width: f64) {
        if (self.current_line_width - width).abs() > 0.001 {
            self.stream.push_str(&format!("{:.2} w\n", width));
            self.current_line_width = width;
        }
    }

    pub fn line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64) {
        self.stream
            .push_str(&format!("{:.2} {:.2} m {:.2} {:.2} l S\n", x1, y1, x2, y2));
    }

    pub fn rect(&mut self, x: f64, y: f64, w: f64, h: f64, stroke: bool, fill: bool) {
        self.stream
            .push_str(&format!("{:.2} {:.2} {:.2} {:.2} re ", x, y, w, h));
        match (stroke, fill) {
            (true, true) => self.stream.push_str("B\n"),
            (true, false) => self.stream.push_str("s\n"),
            (false, true) => self.stream.push_str("f\n"),
            (false, false) => self.stream.push_str("n\n"),
        }
    }

    fn escape_pdf_text(text: &str) -> String {
        let mut out = String::with_capacity(text.len() + 8);
        for c in text.chars() {
            match c {
                '(' => out.push_str("\\("),
                ')' => out.push_str("\\)"),
                '\\' => out.push_str("\\\\"),
                '\r' | '\n' => out.push(' '),
                _ => out.push(c),
            }
        }
        out
    }

    pub fn draw_string(&mut self, font: PdfFont, size: f64, x: f64, y: f64, text: &str) {
        let font_tag = match font {
            PdfFont::Helvetica => "/F1",
            PdfFont::HelveticaBold => "/F2",
        };
        let escaped = Self::escape_pdf_text(text);
        self.stream.push_str(&format!(
            "BT {} {:.2} Tf {:.2} {:.2} Td ({}) Tj ET\n",
            font_tag, size, x, y, escaped
        ));
    }

    pub fn draw_spaced_string(
        &mut self,
        font: PdfFont,
        size: f64,
        x: f64,
        y: f64,
        text: &str,
        spacing: f64,
    ) {
        let font_tag = match font {
            PdfFont::Helvetica => "/F1",
            PdfFont::HelveticaBold => "/F2",
        };
        let escaped = Self::escape_pdf_text(text);
        if spacing.abs() < 0.001 {
            self.stream.push_str(&format!(
                "BT {} {:.2} Tf {:.2} {:.2} Td ({}) Tj ET\n",
                font_tag, size, x, y, escaped
            ));
        } else {
            self.stream.push_str(&format!(
                "BT {} {:.2} Tf {:.2} Tc {:.2} {:.2} Td ({}) Tj 0.00 Tc ET\n",
                font_tag, size, spacing, x, y, escaped
            ));
        }
    }

    pub fn string_width_spaced(&self, font: PdfFont, size: f64, text: &str, spacing: f64) -> f64 {
        let base = self.string_width(font, size, text);
        let count = text.chars().count();
        if count > 1 && spacing != 0.0 {
            base + (count - 1) as f64 * spacing
        } else {
            base
        }
    }

    pub fn draw_centered_spaced_string(
        &mut self,
        font: PdfFont,
        size: f64,
        center_x: f64,
        y: f64,
        text: &str,
        spacing: f64,
    ) {
        let w = self.string_width_spaced(font, size, text, spacing);
        self.draw_spaced_string(font, size, center_x - w / 2.0, y, text, spacing);
    }

    pub fn draw_right_spaced_string(
        &mut self,
        font: PdfFont,
        size: f64,
        right_x: f64,
        y: f64,
        text: &str,
        spacing: f64,
    ) {
        let w = self.string_width_spaced(font, size, text, spacing);
        self.draw_spaced_string(font, size, right_x - w, y, text, spacing);
    }

    /// Draws bilingual text using Plus Jakarta Sans ExtraBold (/F3) for Latin and Noto Sans Oriya Bold (/F4) for Odia
    pub fn draw_bilingual_string(&mut self, font_size: f64, x: f64, y: f64, text: &str) {
        let chunks = crate::documents::pdf::font::segment_and_shape(text);
        if chunks.is_empty() {
            return;
        }
        self.stream.push_str(&format!("% {}\n", text.replace(['\r', '\n'], " ")));
        self.stream.push_str("BT\n");
        self.stream.push_str(&format!(
            "{:.3} {:.3} {:.3} rg\n",
            self.current_fill.r, self.current_fill.g, self.current_fill.b
        ));
        self.stream.push_str(&format!("{:.2} {:.2} Td\n", x, y));
        for chunk in chunks {
            self.stream.push_str(&format!("/F{} {:.2} Tf\n", chunk.font_number, font_size));
            self.stream.push_str(&format!("<{}> Tj\n", chunk.hex_gids));
        }
        self.stream.push_str("ET\n");
    }

    pub fn draw_centered_bilingual_string(&mut self, font_size: f64, cx: f64, y: f64, text: &str) {
        let w = self.bilingual_string_width(font_size, text);
        self.draw_bilingual_string(font_size, cx - w / 2.0, y, text);
    }

    pub fn draw_right_bilingual_string(&mut self, font_size: f64, right_x: f64, y: f64, text: &str) {
        let w = self.bilingual_string_width(font_size, text);
        self.draw_bilingual_string(font_size, right_x - w, y, text);
    }

    pub fn bilingual_string_width(&self, font_size: f64, text: &str) -> f64 {
        crate::documents::pdf::font::measure_bilingual_width(font_size, text)
    }

    pub fn wrap_bilingual_text(&self, font_size: f64, text: &str, max_width: f64) -> Vec<String> {
        crate::documents::pdf::font::wrap_bilingual_text(font_size, text, max_width)
    }

    pub fn draw_centered_string(
        &mut self,
        font: PdfFont,
        size: f64,
        center_x: f64,
        y: f64,
        text: &str,
    ) {
        let w = self.string_width(font, size, text);
        self.draw_string(font, size, center_x - w / 2.0, y, text);
    }

    pub fn draw_right_string(
        &mut self,
        font: PdfFont,
        size: f64,
        right_x: f64,
        y: f64,
        text: &str,
    ) {
        let w = self.string_width(font, size, text);
        self.draw_string(font, size, right_x - w, y, text);
    }

    pub fn string_width(&self, font: PdfFont, size: f64, text: &str) -> f64 {
        let mut total_units: f64 = 0.0;
        for c in text.chars() {
            total_units += char_width(font, c);
        }
        (total_units * size) / 1000.0
    }

    /// Word-wrap `text` into lines that fit within `max_width` points.
    /// Returns the lines as owned Strings.
    pub fn wrap_text(&self, font: PdfFont, size: f64, text: &str, max_width: f64) -> Vec<String> {
        let mut lines: Vec<String> = Vec::new();
        let space_w = self.string_width(font, size, " ");
        for paragraph in text.split('\n') {
            let words: Vec<&str> = paragraph.split_whitespace().collect();
            if words.is_empty() {
                lines.push(String::new());
                continue;
            }
            let mut current = String::new();
            let mut current_w = 0.0_f64;
            for word in words {
                let word_w = self.string_width(font, size, word);
                if current.is_empty() {
                    current.push_str(word);
                    current_w = word_w;
                } else if current_w + space_w + word_w <= max_width {
                    current.push(' ');
                    current.push_str(word);
                    current_w += space_w + word_w;
                } else {
                    lines.push(current.clone());
                    current = word.to_string();
                    current_w = word_w;
                }
            }
            if !current.is_empty() {
                lines.push(current);
            }
        }
        lines
    }

    /// Draw word-wrapped text, drawing each line at `line_height` spacing downward.
    /// Returns the total height consumed (number_of_lines * line_height).
    pub fn draw_wrapped_string(
        &mut self,
        font: PdfFont,
        size: f64,
        x: f64,
        y: f64,
        max_width: f64,
        line_height: f64,
        text: &str,
    ) -> f64 {
        let lines = self.wrap_text(font, size, text, max_width);
        let count = lines.len() as f64;
        for (i, line) in lines.into_iter().enumerate() {
            // lines go downward in PDF space means decreasing y
            let ly = y - i as f64 * line_height;
            self.draw_string(font, size, x, ly, &line);
        }
        count * line_height
    }

    /// Compile into final valid PDF 1.4 byte buffer
    pub fn build_pdf(mut self) -> Vec<u8> {
        // Flush the last in-progress page
        self.pages.push(PdfPage {
            stream: self.stream,
            width: self.width,
            height: self.height,
            annots: self.current_annots,
        });

        // ── Phase 1: collect all annotation objects first so we know their IDs ──
        // Object layout:
        //   1 = Catalog
        //   2 = Pages
        //   3 = Font F1 (Helvetica)
        //   4 = Font F2 (Helvetica-Bold)
        //   5..9 = Font F3 (Plus Jakarta Sans ExtraBold: Type 0, CIDFont, FontDescriptor, FontFile2, ToUnicode)
        //   10..14 = Font F4 (Noto Sans Oriya Bold: Type 0, CIDFont, FontDescriptor, FontFile2, ToUnicode)
        //   15, 17, 19, … = Page objects
        //   16, 18, 20, … = Content stream objects
        //   After all pages: annotation objects
        let num_pages = self.pages.len();
        let first_page_obj = 15_usize;
        // annotation objects start after all page+stream pairs
        let annot_base_id = first_page_obj + num_pages * 2;

        // Pre-compute annotation object IDs per page
        let mut annot_ids_per_page: Vec<Vec<usize>> = Vec::with_capacity(num_pages);
        let mut next_annot_id = annot_base_id;
        for page in &self.pages {
            let ids: Vec<usize> = (0..page.annots.len())
                .map(|_| { let id = next_annot_id; next_annot_id += 1; id })
                .collect();
            annot_ids_per_page.push(ids);
        }

        // ── Phase 2: build PDF object list ──
        let mut objects = Vec::<Vec<u8>>::with_capacity(14 + num_pages * 2 + next_annot_id - annot_base_id);

        // Obj 1: Catalog
        objects.push(b"<< /Type /Catalog /Pages 2 0 R >>".to_vec());

        // Obj 2: Pages
        let page_object_ids: Vec<usize> =
            (0..num_pages).map(|i| first_page_obj + i * 2).collect();
        let kids = page_object_ids
            .iter()
            .map(|id| format!("{id} 0 R"))
            .collect::<Vec<_>>()
            .join(" ");
        objects.push(
            format!("<< /Type /Pages /Kids [{kids}] /Count {num_pages} >>")
                .into_bytes(),
        );

        // Obj 3 & 4: Type 1 Fonts
        objects.push(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_vec());
        objects.push(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>".to_vec());

        // Obj 5..9 & 10..14: Embedded TrueType Fonts (F3: Latin ExtraBold, F4: Odia Bold)
        let latin_font = crate::documents::pdf::font::EmbeddedTrueType::parse("PlusJakartaSans", crate::documents::pdf::font::LATIN_FONT_BYTES);
        let odia_font = crate::documents::pdf::font::EmbeddedTrueType::parse("NotoSansOriya", crate::documents::pdf::font::ODIA_FONT_BYTES);

        fn add_true_type_font_objects(objects: &mut Vec<Vec<u8>>, font: &crate::documents::pdf::font::EmbeddedTrueType, base_id: usize) {
            let cid_font_id = base_id + 1;
            let descriptor_id = base_id + 2;
            let font_file_id = base_id + 3;
            let to_unicode_id = base_id + 4;

            // Type 0 Font
            objects.push(
                format!(
                    "<< /Type /Font /Subtype /Type0 /BaseFont /{} /Encoding /Identity-H /DescendantFonts [{} 0 R] /ToUnicode {} 0 R >>",
                    font.postscript_name, cid_font_id, to_unicode_id
                ).into_bytes()
            );

            // CIDFont
            let mut widths_str = String::from("/W [ 0 [ ");
            for w in &font.widths {
                widths_str.push_str(&format!("{} ", w));
            }
            widths_str.push_str("] ]");

            objects.push(
                format!(
                    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /{} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor {} 0 R /CIDToGIDMap /Identity /DW 1000 {} >>",
                    font.postscript_name, descriptor_id, widths_str
                ).into_bytes()
            );

            // FontDescriptor
            objects.push(
                format!(
                    "<< /Type /FontDescriptor /FontName /{} /Flags 32 /FontBBox [{} {} {} {}] /ItalicAngle 0 /Ascent {} /Descent {} /CapHeight {} /StemV 120 /FontFile2 {} 0 R >>",
                    font.postscript_name, font.bbox[0], font.bbox[1], font.bbox[2], font.bbox[3], font.ascent, font.descent, font.cap_height, font_file_id
                ).into_bytes()
            );

            // FontFile2
            let mut ff_obj = format!("<< /Length {} /Length1 {} >>\nstream\n", font.font_data.len(), font.font_data.len()).into_bytes();
            ff_obj.extend_from_slice(font.font_data);
            ff_obj.extend_from_slice(b"\nendstream");
            objects.push(ff_obj);

            // ToUnicode
            let cmap_bytes = font.to_unicode_cmap.as_bytes();
            let mut tu_obj = format!("<< /Length {} >>\nstream\n", cmap_bytes.len()).into_bytes();
            tu_obj.extend_from_slice(cmap_bytes);
            tu_obj.extend_from_slice(b"\nendstream");
            objects.push(tu_obj);
        }

        add_true_type_font_objects(&mut objects, &latin_font, 5);
        add_true_type_font_objects(&mut objects, &odia_font, 10);

        let ext_gstate = "<< \
            /GS_a12 << /Type /ExtGState /ca 0.12 /CA 0.12 >> \
            /GS_a09 << /Type /ExtGState /ca 0.09 /CA 0.09 >> \
            /GS_a15 << /Type /ExtGState /ca 0.15 /CA 0.15 >> \
            /GS_a18 << /Type /ExtGState /ca 0.18 /CA 0.18 >> \
            /GS_a08 << /Type /ExtGState /ca 0.08 /CA 0.08 >> \
            /GS_a04 << /Type /ExtGState /ca 0.04 /CA 0.04 >> \
            /GS_a100 << /Type /ExtGState /ca 1.00 /CA 1.00 >> \
        >>";

        let image_base_id = next_annot_id;
        let xobjects_entry = if self.images.is_empty() {
            String::new()
        } else {
            let mut s = String::from(" /XObject << ");
            for (i, _) in self.images.iter().enumerate() {
                let img_id = image_base_id + i;
                s.push_str(&format!("/Im{} {} 0 R ", i + 1, img_id));
            }
            s.push_str(">>");
            s
        };

        // Page + Stream objects (obj 15/16, 17/18, …)
        for (index, page) in self.pages.iter().enumerate() {
            let page_id = page_object_ids[index];
            let stream_id = page_id + 1;

            // Build /Annots entry
            let annots_entry = if annot_ids_per_page[index].is_empty() {
                String::new()
            } else {
                let refs = annot_ids_per_page[index]
                    .iter()
                    .map(|id| format!("{id} 0 R"))
                    .collect::<Vec<_>>()
                    .join(" ");
                format!(" /Annots [{refs}]")
            };

            objects.push(
                format!(
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 10 0 R >>{xobjects_entry} /ExtGState {ext_gstate} >> /Contents {stream_id} 0 R{annots_entry} >>",
                    page.width, page.height
                )
                .into_bytes(),
            );
            let stream_bytes = page.stream.as_bytes();
            let mut stream_object =
                format!("<< /Length {} >>\nstream\n", stream_bytes.len()).into_bytes();
            stream_object.extend_from_slice(stream_bytes);
            stream_object.extend_from_slice(b"\nendstream");
            objects.push(stream_object);
        }

        // Annotation objects (URI /Link)
        for (page_idx, page) in self.pages.iter().enumerate() {
            for annot in &page.annots {
                // Escape URL: parentheses must be escaped inside PDF literal strings
                let escaped_url = annot.url.replace('\\', "\\\\").replace('(', "\\(").replace(')', "\\)");
                let obj = format!(
                    "<< /Type /Annot /Subtype /Link /Rect [{:.2} {:.2} {:.2} {:.2}] /Border [0 0 0] /A << /Type /Action /S /URI /URI ({escaped_url}) >> >>",
                    annot.x,
                    annot.y,
                    annot.x + annot.width,
                    annot.y + annot.height,
                );
                let _ = page_idx; // used implicitly through iteration order
                objects.push(obj.into_bytes());
            }
        }

        // Image objects (/XObject /Image /Filter /DCTDecode)
        for image in &self.images {
            let mut img_obj = format!(
                "<< /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
                image.width, image.height, image.data.len()
            ).into_bytes();
            img_obj.extend_from_slice(&image.data);
            img_obj.extend_from_slice(b"\nendstream");
            objects.push(img_obj);
        }

        // ── Phase 3: serialise objects & cross-reference table ──
        let mut out = Vec::with_capacity(
            self.pages.iter().map(|p| p.stream.len()).sum::<usize>() + 4096,
        );
        out.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
        let mut offsets = Vec::with_capacity(objects.len());
        for (index, object) in objects.iter().enumerate() {
            offsets.push(out.len());
            out.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
            out.extend_from_slice(object);
            out.extend_from_slice(b"\nendobj\n");
        }

        let xref_pos = out.len();
        let total_objs = offsets.len() + 1;
        out.extend_from_slice(format!("xref\n0 {total_objs}\n0000000000 65535 f \n").as_bytes());
        for offset in offsets {
            out.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
        }
        let trailer = format!(
            "trailer\n<< /Size {total_objs} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n"
        );
        out.extend_from_slice(trailer.as_bytes());
        out
    }
}

#[cfg(test)]
mod tests {
    use super::{PdfCanvas, PdfFont};

    #[test]
    fn builds_a_valid_two_page_pdf() {
        let mut canvas = PdfCanvas::new_a4_portrait();
        canvas.draw_string(PdfFont::Helvetica, 12.0, 30.0, 800.0, "Page one");
        canvas.new_page();
        canvas.draw_string(PdfFont::Helvetica, 12.0, 30.0, 800.0, "Page two");
        let pdf = String::from_utf8_lossy(&canvas.build_pdf()).into_owned();

        assert!(pdf.starts_with("%PDF-1.4"));
        assert!(pdf.contains("/Count 2"));
        assert_eq!(pdf.matches("/Type /Page ").count(), 2);
        assert!(pdf.contains("Page one"));
        assert!(pdf.contains("Page two"));
        assert!(pdf.contains("%%EOF"));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helvetica Glyph Width Tables (Standard Type 1 font metrics in 1/1000 units)
// ─────────────────────────────────────────────────────────────────────────────

fn char_width(font: PdfFont, c: char) -> f64 {
    let code = c as u32;
    if code < 32 || code > 126 {
        return 500.0;
    }

    match font {
        PdfFont::Helvetica => match c {
            ' ' | '!' | '\'' | ',' | '.' | '/' | ':' | ';' => 278.0,
            '"' => 355.0,
            '#'
            | '$'
            | '?'
            | '0'..='9'
            | 'a'
            | 'b'
            | 'd'
            | 'e'
            | 'g'
            | 'h'
            | 'n'
            | 'o'
            | 'p'
            | 'q'
            | 'u' => 556.0,
            '%' => 889.0,
            '&' => 667.0,
            '(' | ')' | '-' | 'r' => 333.0,
            '*' => 389.0,
            '+' | '<' | '=' | '>' => 584.0,
            '@' => 1015.0,
            'A' | 'B' | 'E' | 'K' | 'P' | 'R' | 'S' | 'V' | 'X' | 'Y' => 667.0,
            'C' | 'D' | 'H' | 'N' | 'U' => 722.0,
            'F' | 'T' | 'Z' => 611.0,
            'G' | 'O' | 'Q' => 778.0,
            'I' => 278.0,
            'J' => 500.0,
            'L' => 556.0,
            'M' => 833.0,
            'W' => 944.0,
            'c' | 'k' | 's' | 'v' | 'x' | 'y' | 'z' => 500.0,
            'f' | 't' => 278.0,
            'i' | 'j' | 'l' => 222.0,
            'm' => 833.0,
            'w' => 722.0,
            _ => 500.0,
        },
        PdfFont::HelveticaBold => match c {
            ' ' | '!' | '\'' | ',' | '.' | '/' | ':' | ';' => 278.0,
            '"' => 474.0,
            '#' | '$' | '0'..='9' => 556.0,
            '%' => 1000.0,
            '&' => 722.0,
            '(' | ')' | '-' | 'r' => 333.0,
            '*' => 389.0,
            '+' | '<' | '=' | '>' => 584.0,
            '?' => 611.0,
            '@' => 975.0,
            'A' | 'B' | 'E' | 'K' | 'P' | 'R' | 'S' | 'V' | 'X' | 'Y' => 722.0,
            'C' | 'D' | 'G' | 'H' | 'N' | 'O' | 'Q' | 'U' => 778.0,
            'F' | 'T' | 'Z' => 667.0,
            'I' => 278.0,
            'J' => 556.0,
            'L' => 611.0,
            'M' => 889.0,
            'W' => 1000.0,
            'a' | 'b' | 'd' | 'e' | 'g' | 'h' | 'n' | 'o' | 'p' | 'q' | 'u' => 611.0,
            'c' | 'k' | 's' | 'v' | 'x' | 'y' | 'z' => 556.0,
            'f' | 't' => 333.0,
            'i' | 'j' | 'l' => 278.0,
            'm' => 889.0,
            'w' => 778.0,
            _ => 556.0,
        },
    }
}

pub fn parse_jpeg_size(data: &[u8]) -> Option<(u32, u32)> {
    let mut i = 2;
    let len = data.len();
    if len < 4 || data[0] != 0xFF || data[1] != 0xD8 {
        return None;
    }
    while i + 4 < len {
        if data[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = data[i + 1];
        i += 2;
        if marker == 0xFF || marker == 0x00 {
            continue;
        }
        if matches!(marker, 0xC0..=0xC3 | 0xC5..=0xC7 | 0xC9..=0xCB | 0xCD..=0xCF) {
            if i + 7 < len {
                let h = u16::from_be_bytes([data[i + 3], data[i + 4]]) as u32;
                let w = u16::from_be_bytes([data[i + 5], data[i + 6]]) as u32;
                if w > 0 && h > 0 {
                    return Some((w, h));
                }
            }
            return None;
        }
        if marker == 0xDA || marker == 0xD9 {
            break;
        }
        if i + 2 <= len {
            let seg_len = u16::from_be_bytes([data[i], data[i + 1]]) as usize;
            if seg_len < 2 {
                break;
            }
            i += seg_len;
        } else {
            break;
        }
    }
    None
}
