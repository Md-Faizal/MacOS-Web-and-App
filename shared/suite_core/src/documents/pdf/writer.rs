// ─────────────────────────────────────────────────────────────────────────────
// Pure Rust Vector PDF 1.4 Writer (Zero Dependencies)
// Generates standard compliant PDF documents with Type 1 Helvetica fonts
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PdfFont {
    Helvetica,
    HelveticaBold,
}

#[derive(Debug, Clone)]
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
    pages: Vec<String>,
    current_stroke: PdfColor,
    current_fill: PdfColor,
    current_line_width: f64,
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
        self.pages.push(std::mem::take(&mut self.stream));
        self.current_stroke = PdfColor::BLACK;
        self.current_fill = PdfColor::BLACK;
        self.current_line_width = 1.0;
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
        page_streams.push(self.stream);

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

        for (index, stream) in page_streams.iter().enumerate() {
            let page_id = page_object_ids[index];
            let stream_id = page_id + 1;
            objects.push(
                format!(
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {stream_id} 0 R >>",
                    self.width, self.height
                )
                .into_bytes(),
            );
            let stream_bytes = stream.as_bytes();
            let mut stream_object =
                format!("<< /Length {} >>\nstream\n", stream_bytes.len()).into_bytes();
            stream_object.extend_from_slice(stream_bytes);
            stream_object.extend_from_slice(b"\nendstream");
            objects.push(stream_object);
        }

        let mut out =
            Vec::with_capacity(page_streams.iter().map(String::len).sum::<usize>() + 1024);
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
