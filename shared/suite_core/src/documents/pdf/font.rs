use rustybuzz::{Face, UnicodeBuffer};
use std::collections::BTreeMap;

pub const LATIN_FONT_BYTES: &[u8] = include_bytes!("../../../fonts/PlusJakartaSans-ExtraBold.ttf");
pub const ODIA_FONT_BYTES: &[u8] = include_bytes!("../../../fonts/NotoSansOriya-Bold.ttf");

#[derive(Debug, Clone)]
pub struct EmbeddedTrueType {
    pub postscript_name: String,
    pub font_data: &'static [u8],
    pub units_per_em: f64,
    pub ascent: i16,
    pub descent: i16,
    pub cap_height: i16,
    pub bbox: [i16; 4],
    pub widths: Vec<u16>,
    pub to_unicode_cmap: String,
}

impl EmbeddedTrueType {
    pub fn parse(tag: &str, data: &'static [u8]) -> Self {
        let face = ttf_parser::Face::parse(data, 0).expect("Valid TTF font data");
        let upem = face.units_per_em() as f64;
        let num_glyphs = face.number_of_glyphs();

        let mut widths = Vec::with_capacity(num_glyphs as usize);
        for gid in 0..num_glyphs {
            let gid_obj = ttf_parser::GlyphId(gid);
            let raw_w = face.glyph_hor_advance(gid_obj).unwrap_or(0);
            let pdf_w = ((raw_w as f64 * 1000.0) / upem).round() as u16;
            widths.push(pdf_w);
        }

        let ps_name = face
            .names()
            .into_iter()
            .find(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME && n.is_unicode())
            .and_then(|n| n.to_string())
            .unwrap_or_else(|| tag.to_string());

        let bbox = face.global_bounding_box();
        let scale = 1000.0 / upem;

        // Build ToUnicode CMap
        let mut gid_to_unicode = BTreeMap::<u16, u32>::new();
        if let Some(subtable) = face.tables().cmap.and_then(|cmap| {
            cmap.subtables.into_iter().find(|st| st.is_unicode())
        }) {
            subtable.codepoints(|cp| {
                if let Some(gid) = subtable.glyph_index(cp) {
                    gid_to_unicode.entry(gid.0).or_insert(cp);
                }
            });
        }

        let mut cmap_body = String::from(
            "/CIDInit /ProcSet findresource begin\n\
             12 dict begin\n\
             begincmap\n\
             /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n\
             /CMapName /Custom-ToUnicode def\n\
             /CMapType 2 def\n\
             1 begincodespacerange\n\
             <0000> <FFFF>\n\
             endcodespacerange\n",
        );

        let entries: Vec<(u16, u32)> = gid_to_unicode.into_iter().collect();
        for chunk in entries.chunks(100) {
            cmap_body.push_str(&format!("{} beginbfchar\n", chunk.len()));
            for (gid, cp) in chunk {
                if *cp <= 0xFFFF {
                    cmap_body.push_str(&format!("<{:04X}> <{:04X}>\n", gid, cp));
                } else {
                    let v = *cp - 0x10000;
                    let hi = 0xD800 + (v >> 10);
                    let lo = 0xDC00 + (v & 0x3FF);
                    cmap_body.push_str(&format!("<{:04X}> <{:04X}{:04X}>\n", gid, hi, lo));
                }
            }
            cmap_body.push_str("endbfchar\n");
        }

        cmap_body.push_str(
            "endcmap\n\
             CMapName currentdict /CMap defineresource pop\n\
             end\n\
             end\n",
        );

        Self {
            postscript_name: ps_name,
            font_data: data,
            units_per_em: upem,
            ascent: (face.ascender() as f64 * scale).round() as i16,
            descent: (face.descender() as f64 * scale).round() as i16,
            cap_height: (face.capital_height().unwrap_or(face.ascender()) as f64 * scale).round()
                as i16,
            bbox: [
                (bbox.x_min as f64 * scale).round() as i16,
                (bbox.y_min as f64 * scale).round() as i16,
                (bbox.x_max as f64 * scale).round() as i16,
                (bbox.y_max as f64 * scale).round() as i16,
            ],
            widths,
            to_unicode_cmap: cmap_body,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ShapedChunk {
    /// 3 for Plus Jakarta Sans ExtraBold, 4 for Noto Sans Oriya Bold
    pub font_number: usize,
    pub hex_gids: String,
    pub advance_width_1000: f64,
}

pub fn is_odia_char(c: char) -> bool {
    let u = c as u32;
    u >= 0x0B00 && u <= 0x0B7F
}

/// Segments text into alternating Latin vs. Odia runs and shapes them with rustybuzz
pub fn segment_and_shape(text: &str) -> Vec<ShapedChunk> {
    if text.is_empty() {
        return Vec::new();
    }

    let mut chunks: Vec<(bool, String)> = Vec::new();
    let mut current_is_odia = false;
    let mut current_buf = String::new();

    for c in text.chars() {
        let odia = is_odia_char(c);
        if current_buf.is_empty() {
            current_is_odia = odia;
            current_buf.push(c);
        } else if odia == current_is_odia {
            current_buf.push(c);
        } else {
            // Neutral punctuation or space can belong to current run unless switching script
            if c == ' ' || c == '(' || c == ')' || c == '/' || c == '-' || c == '.' || c == ',' {
                current_buf.push(c);
            } else {
                chunks.push((current_is_odia, std::mem::take(&mut current_buf)));
                current_is_odia = odia;
                current_buf.push(c);
            }
        }
    }
    if !current_buf.is_empty() {
        chunks.push((current_is_odia, current_buf));
    }

    let latin_face = Face::from_slice(LATIN_FONT_BYTES, 0).expect("Latin face");
    let odia_face = Face::from_slice(ODIA_FONT_BYTES, 0).expect("Odia face");

    let mut result = Vec::with_capacity(chunks.len());
    for (is_odia, run_str) in chunks {
        let mut ubuf = UnicodeBuffer::new();
        ubuf.push_str(&run_str);

        let (face, font_number) = if is_odia {
            (&odia_face, 4)
        } else {
            (&latin_face, 3)
        };

        let glyph_buffer = rustybuzz::shape(face, &[], ubuf);
        let mut hex = String::new();
        let mut total_advance = 0;

        for (info, pos) in glyph_buffer
            .glyph_infos()
            .iter()
            .zip(glyph_buffer.glyph_positions())
        {
            hex.push_str(&format!("{:04X}", info.glyph_id as u16));
            total_advance += pos.x_advance;
        }

        result.push(ShapedChunk {
            font_number,
            hex_gids: hex,
            advance_width_1000: total_advance as f64,
        });
    }

    result
}

/// Measures the precise width of bilingual text in PDF points
pub fn measure_bilingual_width(font_size: f64, text: &str) -> f64 {
    let chunks = segment_and_shape(text);
    let total_1000: f64 = chunks.iter().map(|c| c.advance_width_1000).sum();
    total_1000 * (font_size / 1000.0)
}

/// Word-wraps bilingual text up to max_width
pub fn wrap_bilingual_text(font_size: f64, text: &str, max_width: f64) -> Vec<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return vec![text.to_string()];
    }

    let mut lines = Vec::new();
    let mut current_line = String::new();

    for word in words {
        let candidate = if current_line.is_empty() {
            word.to_string()
        } else {
            format!("{} {}", current_line, word)
        };

        if measure_bilingual_width(font_size, &candidate) <= max_width {
            current_line = candidate;
        } else {
            if !current_line.is_empty() {
                lines.push(current_line);
            }
            current_line = word.to_string();
        }
    }

    if !current_line.is_empty() {
        lines.push(current_line);
    }

    lines
}
