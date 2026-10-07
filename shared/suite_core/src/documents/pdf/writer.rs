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

pub struct PdfCanvas {
    pub width: f64,
    pub height: f64,
    stream: String,
    pages: Vec<PdfPage>,
    current_stroke: PdfColor,
    current_fill: PdfColor,
    current_line_width: f64,
}

struct PdfPage {
    stream: String,
    width: f64,
    height: f64,
}

impl PdfCanvas {
    pub fn new_a4_landscape() -> Self {
        // A4 Landscape: 841.89 pt x 595.28 pt (297mm x 210mm)
        Self {
            width: 841.89,
            height: 595.28,
            stream: String::with_capacity(16384),
            pages: Vec::new(),
            current_stroke: PdfColor::BLACK,
            current_fill: PdfColor::BLACK,
            current_line_width: 1.0,
        }
    }

    pub fn new_a4_portrait() -> Self {
        Self {
            width: 595.28,
            height: 841.89,
            stream: String::with_capacity(16384),
            pages: Vec::new(),
            current_stroke: PdfColor::BLACK,
            current_fill: PdfColor::BLACK,
            current_line_width: 1.0,
        }
    }

    pub fn new_page(&mut self) {
        self.pages.push(PdfPage {
            stream: std::mem::take(&mut self.stream),
            width: self.width,
            height: self.height,
        });
        self.current_stroke = PdfColor::BLACK;
        self.current_fill = PdfColor::BLACK;
        self.current_line_width = 1.0;
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

    /// Compile into final valid PDF 1.4 byte buffer
    pub fn build_pdf(self) -> Vec<u8> {
        let mut page_streams = self.pages;
        page_streams.push(PdfPage {
            stream: self.stream,
            width: self.width,
            height: self.height,
        });

        let mut objects = Vec::<Vec<u8>>::with_capacity(4 + page_streams.len() * 2);
        objects.push(b"<< /Type /Catalog /Pages 2 0 R >>".to_vec());
        let page_object_ids: Vec<usize> =
            (0..page_streams.len()).map(|index| 5 + index * 2).collect();
        let kids = page_object_ids
            .iter()
            .map(|id| format!("{id} 0 R"))
            .collect::<Vec<_>>()
            .join(" ");
        objects.push(
            format!(
                "<< /Type /Pages /Kids [{kids}] /Count {} >>",
                page_streams.len()
            )
            .into_bytes(),
        );
        objects.push(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_vec());
        objects.push(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>".to_vec());

        let ext_gstate = "<< \
            /GS_a12 << /Type /ExtGState /ca 0.12 /CA 0.12 >> \
            /GS_a09 << /Type /ExtGState /ca 0.09 /CA 0.09 >> \
            /GS_a15 << /Type /ExtGState /ca 0.15 /CA 0.15 >> \
            /GS_a18 << /Type /ExtGState /ca 0.18 /CA 0.18 >> \
            /GS_a08 << /Type /ExtGState /ca 0.08 /CA 0.08 >> \
            /GS_a04 << /Type /ExtGState /ca 0.04 /CA 0.04 >> \
            /GS_a100 << /Type /ExtGState /ca 1.00 /CA 1.00 >> \
        >>";

        for (index, stream) in page_streams.iter().enumerate() {
            let page_id = page_object_ids[index];
            let stream_id = page_id + 1;
            objects.push(
                format!(
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /ExtGState {ext_gstate} >> /Contents {stream_id} 0 R >>",
                    stream.width, stream.height
                )
                .into_bytes(),
            );
            let stream_bytes = stream.stream.as_bytes();
            let mut stream_object =
                format!("<< /Length {} >>\nstream\n", stream_bytes.len()).into_bytes();
            stream_object.extend_from_slice(stream_bytes);
            stream_object.extend_from_slice(b"\nendstream");
            objects.push(stream_object);
        }

        let mut out = Vec::with_capacity(
            page_streams
                .iter()
                .map(|page| page.stream.len())
                .sum::<usize>()
                + 1024,
        );
        out.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
        let mut offsets = Vec::with_capacity(objects.len());
        for (index, object) in objects.iter().enumerate() {
            offsets.push(out.len());
            out.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
            out.extend_from_slice(object);
            out.extend_from_slice(b"\nendobj\n");
        }

        // XRef Table
        let xref_pos = out.len();
        let total_objs = offsets.len() + 1;
        out.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", total_objs).as_bytes());
        for offset in offsets {
            out.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
        }

        // Trailer
        let trailer = format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
            total_objs, xref_pos
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
