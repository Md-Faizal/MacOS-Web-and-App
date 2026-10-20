use crate::documents::pdf::LetterheadDocRequest;

pub fn render_letterhead_document_docx(req: &LetterheadDocRequest) -> Result<Vec<u8>, String> {
    let mut zip = SimpleZipWriter::new();

    // Check for images
    let header_bytes = if !req.header_image_base64.trim().is_empty() {
        base64_decode(&req.header_image_base64)
    } else {
        None
    };

    let sig_bytes = if !req.signature_image_base64.trim().is_empty() {
        base64_decode(&req.signature_image_base64)
    } else {
        None
    };

    let second_sig_bytes = if !req.second_signature_image_base64.trim().is_empty() {
        base64_decode(&req.second_signature_image_base64)
    } else {
        None
    };

    let company = if req.company_name.trim().is_empty() {
        "UTKAL CHEMICAL AUSHADHALAYA"
    } else {
        req.company_name.trim()
    };
    let date_str = if req.date.trim().is_empty() { "October 18, 2026" } else { req.date.trim() };

    // 1. [Content_Types].xml
    let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#;
    zip.add_file("[Content_Types].xml", content_types.as_bytes().to_vec());

    // 2. _rels/.rels
    let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;
    zip.add_file("_rels/.rels", root_rels.as_bytes().to_vec());

    // 3. word/_rels/document.xml.rels
    let mut doc_rels = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
"#);

    if let Some(ref s_bytes) = sig_bytes {
        doc_rels.push_str(r#"  <Relationship Id="rIdSig" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/sig.jpg"/>"#);
        doc_rels.push('\n');
        zip.add_file("word/media/sig.jpg", s_bytes.clone());
    }

    if let Some(ref s2_bytes) = second_sig_bytes {
        doc_rels.push_str(r#"  <Relationship Id="rIdSecondSig" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/second_sig.jpg"/>"#);
        doc_rels.push('\n');
        zip.add_file("word/media/second_sig.jpg", s2_bytes.clone());
    }

    doc_rels.push_str("</Relationships>");
    zip.add_file("word/_rels/document.xml.rels", doc_rels.into_bytes());

    // 4. word/_rels/header1.xml.rels
    let mut hdr_rels = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
"#);

    if let Some(ref h_bytes) = header_bytes {
        hdr_rels.push_str(r#"  <Relationship Id="rIdHeaderImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/header.jpg"/>"#);
        hdr_rels.push('\n');
        zip.add_file("word/media/header.jpg", h_bytes.clone());
    }

    hdr_rels.push_str("</Relationships>");
    zip.add_file("word/_rels/header1.xml.rels", hdr_rels.into_bytes());

    // 5. word/styles.xml (matching PDF Helvetica / Arial 9pt typography)
    let styles_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
        <w:sz w:val="18"/>
        <w:color w:val="1F242E"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:line="280" w:lineRule="exact" w:after="160"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>"#;
    zip.add_file("word/styles.xml", styles_xml.as_bytes().to_vec());

    // 6. word/header1.xml (Authentic edge-to-edge letterhead header & overlaid Ref/Date)
    let mut hdr_xml = String::with_capacity(4096);
    hdr_xml.push_str(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
"#);

    if header_bytes.is_some() {
        // Exact 595.28 pt width (7560056 EMU) x 163.4 pt height (2075180 EMU) edge-to-edge
        hdr_xml.push_str(r#"  <w:p>
    <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="left"/></w:pPr>
    <w:r>
      <w:drawing>
        <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">
          <wp:simplePos x="0" y="0"/>
          <wp:positionH relativeFrom="page">
            <wp:posOffset>0</wp:posOffset>
          </wp:positionH>
          <wp:positionV relativeFrom="page">
            <wp:posOffset>0</wp:posOffset>
          </wp:positionV>
          <wp:extent cx="7560056" cy="2075180"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:wrapNone/>
          <wp:docPr id="1" name="Letterhead Header"/>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="1" name="header.jpg"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rIdHeaderImg"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="7560056" cy="2075180"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:anchor>
      </w:drawing>
    </w:r>
  </w:p>
"#);

        // Ref & Date Overlaid Line (y = 104 pt from top = 1740 dxa; x = 75 pt Ref, x = 466 pt Date)
        hdr_xml.push_str(&format!(r#"  <w:p>
    <w:pPr>
      <w:ind w:left="500"/>
      <w:spacing w:before="1740" w:after="0"/>
      <w:tabs>
        <w:tab w:val="left" w:pos="8320"/>
      </w:tabs>
    </w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="17"/><w:color w:val="141F33"/></w:rPr>
      <w:t>{}</w:t>
    </w:r>
    <w:r>
      <w:tab/>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="17"/><w:color w:val="141F33"/></w:rPr>
      <w:t>{}</w:t>
    </w:r>
  </w:p>
"#, xml_escape(&req.doc_ref_no), xml_escape(date_str)));
    } else {
        // Fallback Vector Header
        hdr_xml.push_str(&format!(r#"  <w:p>
    <w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr>
    <w:r>
      <w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0D3366"/></w:rPr>
      <w:t>{}</w:t>
    </w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr>
    <w:r>
      <w:rPr><w:sz w:val="17"/><w:color w:val="59616B"/></w:rPr>
      <w:t>Ayurvedic &amp; Herbal Pharmaceuticals • Schedule T GMP Certified</w:t>
    </w:r>
  </w:p>
  <w:p>
    <w:pPr>
      <w:spacing w:before="0" w:after="0"/>
      <w:tabs><w:tab w:val="right" w:pos="9906"/></w:tabs>
    </w:pPr>
    <w:r>
      <w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="141F33"/></w:rPr>
      <w:t>REF: {}</w:t>
    </w:r>
    <w:r>
      <w:tab/>
      <w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="141F33"/></w:rPr>
      <w:t>DATE: {}</w:t>
    </w:r>
  </w:p>
"#, xml_escape(company), xml_escape(&req.doc_ref_no), xml_escape(date_str)));
    }

    hdr_xml.push_str("</w:hdr>");
    zip.add_file("word/header1.xml", hdr_xml.into_bytes());

    // 7. word/document.xml
    let mut doc_xml = String::with_capacity(8192);
    doc_xml.push_str(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
"#);

    // Recipient Block (matches PDF coordinates and 10.5/11.0pt typography)
    if !req.recipient_name.trim().is_empty() {
        doc_xml.push_str(r#"    <w:p>
      <w:pPr><w:spacing w:before="0" w:after="20"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="000000"/></w:rPr><w:t>To,</w:t></w:r>
    </w:p>
"#);
        doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:spacing w:before="0" w:after="20"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="142647"/></w:rPr><w:t>{}</w:t></w:r>
    </w:p>
"#, xml_escape(&req.recipient_name)));

        if !req.recipient_title.trim().is_empty() {
            doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:spacing w:before="0" w:after="20"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="19"/><w:color w:val="404752"/></w:rPr><w:t>{}</w:t></w:r>
    </w:p>
"#, xml_escape(&req.recipient_title)));
        }

        if !req.recipient_address.trim().is_empty() {
            for line in req.recipient_address.split('\n') {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:spacing w:before="0" w:after="20"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="19"/><w:color w:val="4D5761"/></w:rPr><w:t>{}</w:t></w:r>
    </w:p>
"#, xml_escape(trimmed)));
                }
            }
        }
    }

    // Subject Line (prominent 10pt bold, fits on 1 line)
    if !req.subject.trim().is_empty() {
        doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:spacing w:before="140" w:after="100"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="142E59"/></w:rPr><w:t>SUB: {}</w:t></w:r>
    </w:p>
"#, xml_escape(&req.subject.to_uppercase())));
    }

    // Title Line (matching studio and PDF engine)
    if !req.title.trim().is_empty() && req.title.trim() != req.subject.trim() {
        doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:spacing w:before="120" w:after="100"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="142E59"/></w:rPr><w:t>TITLE: {}</w:t></w:r>
    </w:p>
"#, xml_escape(&req.title.to_uppercase())));
    }

    // Salutation
    let salutation = if req.salutation.trim().is_empty() { "Dear Sir / Madam," } else { req.salutation.trim() };
    doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:spacing w:before="0" w:after="40"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="000000"/></w:rPr><w:t>{}</w:t></w:r>
    </w:p>
"#, xml_escape(salutation)));

    // Body Paragraphs (line="280" = 14pt line height matching PDF exactly)
    for (p_idx, para) in req.paragraphs.iter().enumerate() {
        let trimmed = para.trim();
        let lower = trimmed.to_lowercase();
        if p_idx == 0 && (lower == "dear sir / madam," || lower == "dear sir/madam," || lower == "dear sir / madam" || lower.starts_with("dear sir") || lower.starts_with("dear madam") || lower == salutation.to_lowercase()) {
            continue;
        }
        if !trimmed.is_empty() {
            doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:spacing w:before="0" w:after="160" w:line="280" w:lineRule="exact"/><w:jc w:val="both"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="1F242E"/></w:rPr><w:t>{}</w:t></w:r>
    </w:p>
"#, xml_escape(trimmed)));
        }
    }

    // Terms & Clauses
    if !req.terms_clauses.is_empty() {
        doc_xml.push_str(r#"    <w:p>
      <w:pPr><w:spacing w:before="140" w:after="80"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="142E59"/></w:rPr><w:t>Terms &amp; Statutory Declarations:</w:t></w:r>
    </w:p>
"#);
        for (idx, clause) in req.terms_clauses.iter().enumerate() {
            let trimmed = clause.trim();
            if !trimmed.is_empty() {
                doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:ind w:left="320" w:hanging="320"/><w:spacing w:before="0" w:after="80" w:line="240" w:lineRule="exact"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="000000"/></w:rPr><w:t>{}. </w:t></w:r>
      <w:r><w:rPr><w:sz w:val="17"/><w:color w:val="2E384D"/></w:rPr><w:t>{}</w:t></w:r>
    </w:p>
"#, idx + 1, xml_escape(trimmed)));
            }
        }
    }

    // Dynamic vertical anchoring: calculate content height to land Signatory block at bottom margin
    let mut content_h: f64 = 0.0;
    if !req.recipient_name.trim().is_empty() {
        content_h += 29.0; // To, + Name
        if !req.recipient_title.trim().is_empty() { content_h += 13.0; }
        for line in req.recipient_address.split('\n') {
            if !line.trim().is_empty() { content_h += 12.0; }
        }
    }
    if !req.subject.trim().is_empty() {
        let subj_text = format!("SUB: {}", req.subject.trim());
        let est_lines = ((subj_text.len() as f64) / 72.0).ceil().max(1.0);
        content_h += 10.0 + (est_lines * 14.0);
    }
    if !req.title.trim().is_empty() && req.title.trim() != req.subject.trim() {
        let title_text = format!("TITLE: {}", req.title.trim());
        let est_lines = ((title_text.len() as f64) / 72.0).ceil().max(1.0);
        content_h += 10.0 + (est_lines * 14.0);
    }
    content_h += 15.0; // Salutation
    for para in &req.paragraphs {
        let trimmed = para.trim();
        if !trimmed.is_empty() {
            let lines = (trimmed.len() as f64 / 95.0).ceil().max(1.0);
            content_h += lines * 14.0 + 8.0;
        }
    }
    for clause in &req.terms_clauses {
        let trimmed = clause.trim();
        if !trimmed.is_empty() {
            let lines = (trimmed.len() as f64 / 90.0).ceil().max(1.0);
            content_h += lines * 12.0 + 4.0;
        }
    }

    let target_sign_y_pt = 571.6; // Distance to anchor signatory block near bottom margin matching PDF baseline
    let gap_pt = (target_sign_y_pt - content_h).max(15.0);
    let before_spacing_dxa = (gap_pt * 20.0) as i32;

    let signer = if req.signatory_name.trim().is_empty() { "Authorized Signatory" } else { req.signatory_name.trim() };
    let title = if req.signatory_title.trim().is_empty() { "Proprietor" } else { req.signatory_title.trim() };

    let (for_spacing_after, signer_spacing_before) = if sig_bytes.is_some() {
        ("60", "60")
    } else {
        ("0", "440") // Generous 44pt blank room for manual pen signature
    };

    let layout = req.signature_layout.trim().to_lowercase();
    if layout != "none" && layout != "disabled" {
        if layout == "dual" || layout == "double" || layout == "2" {
            let left_label = if req.second_signatory_label.trim().is_empty() {
                "Accepted & Agreed By:"
            } else {
                req.second_signatory_label.trim()
            };
            let left_name = if req.second_signatory_name.trim().is_empty() {
                if !req.recipient_name.trim().is_empty() {
                    req.recipient_name.trim()
                } else {
                    "Signature of Employee / Candidate"
                }
            } else {
                req.second_signatory_name.trim()
            };
            let left_title = if req.second_signatory_title.trim().is_empty() {
                "Date: ____________________"
            } else {
                req.second_signatory_title.trim()
            };

            doc_xml.push_str(&format!(r#"    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="4600"/>
        <w:gridCol w:w="4400"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="4600" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:spacing w:before="{}" w:after="80"/><w:jc w:val="left"/></w:pPr>
            <w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="0D3366"/></w:rPr><w:t>{}</w:t></w:r>
          </w:p>
"#, before_spacing_dxa, xml_escape(left_label)));

            if second_sig_bytes.is_some() {
                doc_xml.push_str(r#"          <w:p>
            <w:pPr><w:spacing w:before="40" w:after="40"/><w:jc w:val="left"/></w:pPr>
            <w:r>
              <w:drawing>
                <wp:inline distT="0" distB="0" distL="0" distR="0">
                  <wp:extent cx="1905000" cy="635000"/>
                  <wp:docPr id="3" name="second_sig.jpg"/>
                  <wp:cNvGraphicFramePr>
                    <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
                  </wp:cNvGraphicFramePr>
                  <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                      <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                        <pic:nvPicPr>
                          <pic:cNvPr id="3" name="second_sig.jpg"/>
                          <pic:cNvPicPr/>
                        </pic:nvPicPr>
                        <pic:blipFill>
                          <a:blip r:embed="rIdSecondSig"/>
                          <a:stretch><a:fillRect/></a:stretch>
                        </pic:blipFill>
                        <pic:spPr>
                          <a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="635000"/></a:xfrm>
                          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                        </pic:spPr>
                      </pic:pic>
                    </a:graphicData>
                  </a:graphic>
                </wp:inline>
              </w:drawing>
            </w:r>
          </w:p>
"#);
            } else {
                doc_xml.push_str(r#"          <w:p>
            <w:pPr><w:spacing w:before="60" w:after="80"/><w:jc w:val="left"/></w:pPr>
            <w:r><w:rPr><w:i/><w:sz w:val="16"/><w:color w:val="94A3B8"/></w:rPr><w:t>(Signature of Employee / Candidate)</w:t></w:r>
          </w:p>
"#);
            }

            doc_xml.push_str(&format!(r#"          <w:p>
            <w:pPr><w:spacing w:before="40" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="left"/></w:pPr>
            <w:r><w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="000000"/></w:rPr><w:t>{}</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="left"/></w:pPr>
            <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="59616B"/></w:rPr><w:t>{}</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4400" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:pPr><w:spacing w:before="{}" w:after="{}"/><w:jc w:val="left"/></w:pPr>
            <w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="0D3366"/></w:rPr><w:t>For {},</w:t></w:r>
          </w:p>
"#, xml_escape(left_name), xml_escape(left_title), before_spacing_dxa, for_spacing_after, xml_escape(company)));

            if sig_bytes.is_some() {
                doc_xml.push_str(r#"          <w:p>
            <w:pPr><w:spacing w:before="40" w:after="40"/><w:jc w:val="left"/></w:pPr>
            <w:r>
              <w:drawing>
                <wp:inline distT="0" distB="0" distL="0" distR="0">
                  <wp:extent cx="1905000" cy="635000"/>
                  <wp:docPr id="2" name="Authorized Signature"/>
                  <a:graphic>
                    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                      <pic:pic>
                        <pic:nvPicPr>
                          <pic:cNvPr id="2" name="sig.jpg"/>
                          <pic:cNvPicPr/>
                        </pic:nvPicPr>
                        <pic:blipFill>
                          <a:blip r:embed="rIdSig"/>
                          <a:stretch><a:fillRect/></a:stretch>
                        </pic:blipFill>
                        <pic:spPr>
                          <a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="635000"/></a:xfrm>
                          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                        </pic:spPr>
                      </pic:pic>
                    </a:graphicData>
                  </a:graphic>
                </wp:inline>
              </w:drawing>
            </w:r>
          </w:p>
"#);
            }

            doc_xml.push_str(&format!(r#"          <w:p>
            <w:pPr><w:spacing w:before="{}" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="left"/></w:pPr>
            <w:r><w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="000000"/></w:rPr><w:t>{}</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="left"/></w:pPr>
            <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="59616B"/></w:rPr><w:t>{}</w:t></w:r>
          </w:p>
"#, signer_spacing_before, xml_escape(signer), xml_escape(title)));

            if !req.signatory_reg_no.trim().is_empty() {
                doc_xml.push_str(&format!(r#"          <w:p>
            <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="left"/></w:pPr>
            <w:r><w:rPr><w:b/><w:sz w:val="15"/><w:color w:val="14664D"/></w:rPr><w:t>Reg: {}</w:t></w:r>
          </w:p>
"#, xml_escape(&req.signatory_reg_no)));
            }

            doc_xml.push_str(r#"        </w:tc>
      </w:tr>
    </w:tbl>
"#);
        } else {
            doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:ind w:left="6000"/><w:spacing w:before="{}" w:after="{}"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="0D3366"/></w:rPr><w:t>For {},</w:t></w:r>
    </w:p>
"#, before_spacing_dxa, for_spacing_after, xml_escape(company)));

            if sig_bytes.is_some() {
                // Generous signature size: max 150 pt width x 50 pt height = 1905000 x 635000 EMU
                // Left indented to center horizontally over the signatory column
                doc_xml.push_str(r#"    <w:p>
      <w:pPr><w:ind w:left="6600"/><w:spacing w:before="40" w:after="40"/><w:jc w:val="left"/></w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="1905000" cy="635000"/>
            <wp:docPr id="2" name="Authorized Signature"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="2" name="sig.jpg"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="rIdSig"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="635000"/></a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
"#);
            }

            doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:ind w:left="6000"/><w:spacing w:before="{}" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="000000"/></w:rPr><w:t>{}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="6000"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="59616B"/></w:rPr><w:t>{}</w:t></w:r>
    </w:p>
"#, signer_spacing_before, xml_escape(signer), xml_escape(title)));

            if !req.signatory_reg_no.trim().is_empty() {
                doc_xml.push_str(&format!(r#"    <w:p>
      <w:pPr><w:ind w:left="6000"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="left"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="15"/><w:color w:val="14664D"/></w:rPr><w:t>Reg: {}</w:t></w:r>
    </w:p>
"#, xml_escape(&req.signatory_reg_no)));
            }
        }
    }

    // Section Properties (A4 Portrait, top margin 2746 dxa = 137.3 pt matching PDF page_height - 150pt body start)
    doc_xml.push_str(r#"    <w:sectPr>
      <w:headerReference r:id="rIdHeader" w:type="default"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="2746" w:right="1000" w:bottom="720" w:left="1000" w:header="0" w:footer="0"/>
    </w:sectPr>
  </w:body>
</w:document>"#);

    zip.add_file("word/document.xml", doc_xml.into_bytes());

    Ok(zip.finish())
}

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let clean = if let Some(idx) = input.find(";base64,") {
        &input[idx + 8..]
    } else {
        input.trim()
    };
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for b in clean.bytes() {
        let val = match b {
            b'A'..=b'Z' => (b - b'A') as u32,
            b'a'..=b'z' => (b - b'a' + 26) as u32,
            b'0'..=b'9' => (b - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\r' | b'\n' | b' ' => continue,
            _ => return None,
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

struct SimpleZipEntry {
    name: String,
    data: Vec<u8>,
    crc: u32,
}

struct SimpleZipWriter {
    entries: Vec<SimpleZipEntry>,
}

impl SimpleZipWriter {
    fn new() -> Self {
        Self { entries: Vec::new() }
    }

    fn add_file(&mut self, name: &str, data: Vec<u8>) {
        let crc = crc32_compute(&data);
        self.entries.push(SimpleZipEntry {
            name: name.to_string(),
            data,
            crc,
        });
    }

    fn finish(self) -> Vec<u8> {
        let mut out = Vec::new();
        let mut central_dir = Vec::new();

        for entry in &self.entries {
            let offset = out.len() as u32;
            let name_bytes = entry.name.as_bytes();
            let size = entry.data.len() as u32;

            // Local file header: 0x04034b50
            out.extend_from_slice(&0x04034b50u32.to_le_bytes());
            out.extend_from_slice(&20u16.to_le_bytes()); // version needed: 2.0
            out.extend_from_slice(&0u16.to_le_bytes());  // flags
            out.extend_from_slice(&0u16.to_le_bytes());  // compression: 0 (Stored)
            out.extend_from_slice(&0u16.to_le_bytes());  // mod time
            out.extend_from_slice(&0x5421u16.to_le_bytes()); // mod date
            out.extend_from_slice(&entry.crc.to_le_bytes());
            out.extend_from_slice(&size.to_le_bytes());  // comp size
            out.extend_from_slice(&size.to_le_bytes());  // uncomp size
            out.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());  // extra len
            out.extend_from_slice(name_bytes);
            out.extend_from_slice(&entry.data);

            // Central directory header: 0x02014b50
            central_dir.extend_from_slice(&0x02014b50u32.to_le_bytes());
            central_dir.extend_from_slice(&20u16.to_le_bytes()); // version made by
            central_dir.extend_from_slice(&20u16.to_le_bytes()); // version needed
            central_dir.extend_from_slice(&0u16.to_le_bytes());  // flags
            central_dir.extend_from_slice(&0u16.to_le_bytes());  // compression: 0 (Stored)
            central_dir.extend_from_slice(&0u16.to_le_bytes());  // mod time
            central_dir.extend_from_slice(&0x5421u16.to_le_bytes()); // mod date
            central_dir.extend_from_slice(&entry.crc.to_le_bytes());
            central_dir.extend_from_slice(&size.to_le_bytes());
            central_dir.extend_from_slice(&size.to_le_bytes());
            central_dir.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
            central_dir.extend_from_slice(&0u16.to_le_bytes());  // extra len
            central_dir.extend_from_slice(&0u16.to_le_bytes());  // comment len
            central_dir.extend_from_slice(&0u16.to_le_bytes());  // disk num start
            central_dir.extend_from_slice(&0u16.to_le_bytes());  // internal attr
            central_dir.extend_from_slice(&0u32.to_le_bytes());  // external attr
            central_dir.extend_from_slice(&offset.to_le_bytes());// relative offset
            central_dir.extend_from_slice(name_bytes);
        }

        let cd_offset = out.len() as u32;
        let cd_size = central_dir.len() as u32;
        out.extend_from_slice(&central_dir);

        // End of central directory record: 0x06054b50
        out.extend_from_slice(&0x06054b50u32.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        let num_entries = self.entries.len() as u16;
        out.extend_from_slice(&num_entries.to_le_bytes());
        out.extend_from_slice(&num_entries.to_le_bytes());
        out.extend_from_slice(&cd_size.to_le_bytes());
        out.extend_from_slice(&cd_offset.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());

        out
    }
}

fn crc32_compute(data: &[u8]) -> u32 {
    let mut crc = 0xFFFFFFFFu32;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            let mask = if (crc & 1) != 0 { 0xEDB88320 } else { 0 };
            crc = (crc >> 1) ^ mask;
        }
    }
    !crc
}
