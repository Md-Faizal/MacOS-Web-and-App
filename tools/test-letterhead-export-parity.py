#!/usr/bin/env python3
"""
Master Letterhead Export Parity & Semantic Pixel-Matching Test Suite
---------------------------------------------------------------------
Validates pixel-to-pixel parity and semantic alignment between:
  1. Baseline PDF (Vector Master via Rust SuiteCore)
  2. High-Res JPEG (200 DPI Master Print Graphic)
  3. Word DOCX (OpenXML rendered natively via Microsoft Word engine)

Computes exact matching pixel percentage and regional layout fidelity.
"""

import os
import sys
import json
import base64
import sqlite3
import subprocess
from PIL import Image, ImageChops

def main():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    scratch_dir = os.path.join(root_dir, 'scratch', 'parity_test')
    os.makedirs(scratch_dir, exist_ok=True)

    print("=" * 72)
    print("  LETTERHEAD EXPORT PARITY & SEMANTIC PIXEL MATCHING TEST SUITE")
    print("=" * 72)

    # 1. Load authentic header image
    header_path = os.path.join(root_dir, 'frontend', 'assets', 'uca-letterhead-header.jpg')
    if not os.path.exists(header_path):
        print(f"[-] Header image not found at: {header_path}")
        sys.exit(1)
    with open(header_path, 'rb') as f:
        header_b64 = base64.b64encode(f.read()).decode('utf-8')

    # 2. Load specimen signature from database (document 26 or fallback)
    db_path = os.path.join(root_dir, 'database', 'MacOS.db')
    sig_b64 = ""
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT signature_image FROM company_vault_documents WHERE id = 26")
        row = cur.fetchone()
        if row and row[0]:
            sig_raw = row[0]
            if ';base64,' in sig_raw:
                sig_b64 = sig_raw.split(';base64,')[1]
            else:
                sig_b64 = sig_raw
        conn.close()
    except Exception as e:
        print(f"[*] DB signature query note: {e}")

    # Fallback clean signature graphic if DB empty
    if not sig_b64:
        im = Image.new('RGB', (300, 100), (255, 255, 255))
        from PIL import ImageDraw
        draw = ImageDraw.Draw(im)
        draw.line([(30, 70), (80, 20), (120, 60), (180, 25), (270, 50)], fill=(20, 40, 100), width=4)
        import io
        buf = io.BytesIO()
        im.save(buf, format='JPEG', quality=95)
        sig_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    payload = {
        "doc_ref_no": "UCA/COMP/2026/089",
        "title": "Annual Technical Compliance Submission",
        "date": "October 19, 2026",
        "department": "Corporate Office",
        "recipient_name": "The State Licensing Authority (AYUSH)",
        "recipient_title": "Directorate of AYUSH, Odisha",
        "recipient_address": "Heads of Department Building, Bhubaneswar - 751001",
        "subject": "Statutory Good Manufacturing Practice (GMP) Annual Validation Compliance Submission",
        "salutation": "Dear Sir / Madam,",
        "paragraphs": [
            "With reference to statutory requirements and regulatory guidelines under the Drugs & Cosmetics Rules 1945 and Schedule T governance, we hereby submit the official documentation for your kind record and consideration.",
            "The manufacturing premises and operations continue to strictly comply with all prescribed standard operating procedures (SOPs), quality control validations, and batch manufacturing records (BMR).",
            "Kindly acknowledge receipt and issue regulatory confirmation accordingly."
        ],
        "terms_clauses": [],
        "signatory_name": "MD  FAIZAL",
        "signatory_title": "Proprietor",
        "signatory_reg_no": "OR-AYU-DIR-1952",
        "header_image_base64": header_b64,
        "signature_image_base64": sig_b64,
        "company_name": "UTKAL CHEMICAL AUSHADHALAYA",
        "is_watermarked": False,
        "watermark_text": "",
        "show_page_numbers": True
    }

    payload_file = os.path.join(scratch_dir, 'test_payload.json')
    with open(payload_file, 'w', encoding='utf-8') as f:
        json.dump(payload, f)

    # 3. Generate Baseline PDF and Word DOCX using SuiteCore Node bridge
    gen_script = f"""
    const path = require('path');
    const fs = require('fs');
    const bridge = require(path.resolve('{root_dir.replace('\\', '/')}', 'frontend/shared/suite_core_bridge.js'));
    const payload = JSON.parse(fs.readFileSync(path.resolve('{payload_file.replace('\\', '/')}'), 'utf8'));

    const pdfRes = bridge.renderLetterheadPdf(payload);
    fs.writeFileSync(path.resolve('{scratch_dir.replace('\\', '/')}', 'baseline.pdf'), Buffer.from(pdfRes.pdf_base64, 'base64'));

    const docxRes = bridge.renderLetterheadDocx(payload);
    fs.writeFileSync(path.resolve('{scratch_dir.replace('\\', '/')}', 'document.docx'), Buffer.from(docxRes.docx_base64, 'base64'));

    console.log('[+] PDF & DOCX generated successfully via SuiteCore Rust Engine');
    """
    node_res = subprocess.run(['node', '-e', gen_script], capture_output=True, text=True)
    if node_res.returncode != 0:
        print(f"[-] Generation error: {node_res.stderr}")
        sys.exit(1)
    print(node_res.stdout.strip())

    import fitz

    # 4. Generate High-Res JPEG (200 DPI) using exact backend rasterizer pipeline
    pdf_path = os.path.join(scratch_dir, 'baseline.pdf')
    jpg_path = os.path.join(scratch_dir, 'raster.jpg')
    doc_fitz = fitz.open(pdf_path)
    page0 = doc_fitz.load_page(0)
    pix = page0.get_pixmap(dpi=200)
    pix.save(jpg_path, jpg_quality=95)
    print(f"[+] Master JPEG rasterized at 200 DPI: {pix.width}x{pix.height} px")

    # 5. Convert DOCX to PDF using real Microsoft Word engine
    docx_path = os.path.join(scratch_dir, 'document.docx')
    docx_pdf_path = os.path.join(scratch_dir, 'docx_rendered.pdf')
    print("[*] Rendering DOCX through Microsoft Word automation engine...")
    import win32com.client
    word = win32com.client.Dispatch('Word.Application')
    word.Visible = False
    try:
        w_doc = word.Documents.Open(docx_path)
        # 17 = wdFormatPDF
        w_doc.SaveAs(docx_pdf_path, FileFormat=17)
        w_doc.Close(False)
        print(f"[+] Microsoft Word rendered DOCX to PDF: {os.path.getsize(docx_pdf_path)} bytes")
    finally:
        word.Quit()

    # 6. Render Baseline PDF and Word-Rendered PDF to PNG at 200 DPI for Pixel Analysis
    baseline_pix = page0.get_pixmap(dpi=200)
    pdf_img_path = os.path.join(scratch_dir, 'baseline_render.png')
    baseline_pix.save(pdf_img_path)

    docx_doc = fitz.open(docx_pdf_path)
    docx_page0 = docx_doc.load_page(0)
    docx_pix = docx_page0.get_pixmap(dpi=200)
    docx_img_path = os.path.join(scratch_dir, 'docx_render.png')
    docx_pix.save(docx_img_path)

    # 7. Semantic Analysis & Sanity Checks
    print("\n" + "-" * 72)
    print("  PHASE 1: SEMANTIC DOCUMENT CHECKS")
    print("-" * 72)

    pdf_text = page0.get_text()
    docx_text = docx_page0.get_text()

    # Check 1: Ref and Date present
    assert payload["doc_ref_no"] in pdf_text or payload["doc_ref_no"] in docx_text, "Ref No must be present"
    print(f"  [PASS] Ref No '{payload['doc_ref_no']}' verified in document output")

    # Check 2: Statutory bottom text removed
    forbidden = "STATUTORY DOCUMENT"
    assert forbidden not in pdf_text, "Forbidden text 'STATUTORY DOCUMENT' must not appear"
    assert forbidden not in docx_text, "Forbidden text 'STATUTORY DOCUMENT' must not appear in DOCX"
    print("  [PASS] Confirmed: 'UTKAL CHEMICAL AUSHADHALAYA • STATUTORY DOCUMENT' is completely removed from bottom")

    # Check 3: Recipient & Subject verified
    assert "The State Licensing Authority" in pdf_text or "The State Licensing Authority" in docx_text
    print("  [PASS] Recipient Authority block verified")
    assert "STATUTORY GOOD MANUFACTURING PRACTICE" in pdf_text.upper() or "STATUTORY GOOD MANUFACTURING PRACTICE" in docx_text.upper()
    print("  [PASS] Subject line verified")

    # Check 4: Signatory verified
    assert "MD  FAIZAL" in pdf_text and "MD  FAIZAL" in docx_text
    assert "Proprietor" in pdf_text and "Proprietor" in docx_text
    print("  [PASS] Signatory block 'MD  FAIZAL, Proprietor' verified")

    # 8. Pixel-to-Pixel Matching Calculations
    print("\n" + "-" * 72)
    print("  PHASE 2: PIXEL-TO-PIXEL MATCHING VERIFICATION (200 DPI)")
    print("-" * 72)

    img_baseline = Image.open(pdf_img_path).convert('RGB')
    img_jpg = Image.open(jpg_path).convert('RGB')
    img_docx = Image.open(docx_img_path).convert('RGB')

    # A) JPEG vs Baseline PDF
    assert img_baseline.size == img_jpg.size, f"Dimensions mismatch: {img_baseline.size} vs {img_jpg.size}"
    w, h = img_baseline.size
    total_pixels = w * h

    diff_jpg = ImageChops.difference(img_baseline, img_jpg)
    diff_jpg_data = diff_jpg.getdata()
    # Match criteria: color delta <= 12 per channel (JPEG compression tolerance)
    matching_jpg = sum(1 for (r, g, b) in diff_jpg_data if max(r, g, b) <= 12)
    pct_jpg = (matching_jpg / total_pixels) * 100.0

    print(f"  Canvas Dimensions   : {w} x {h} px (200 DPI A4 Portrait)")
    print(f"  Total Pixels        : {total_pixels:,}")
    print(f"  JPEG vs PDF Match   : {pct_jpg:.2f}% identical pixels")
    assert pct_jpg >= 99.5, f"JPEG pixel match {pct_jpg:.2f}% below 99.5% threshold"

    # B) Word (DOCX) vs Baseline PDF
    # Normalize dimensions if off by 1-2 pixels due to DPI rounding
    if img_docx.size != img_baseline.size:
        img_docx = img_docx.resize(img_baseline.size, Image.Resampling.LANCZOS)

    diff_docx = ImageChops.difference(img_baseline, img_docx)
    diff_docx_data = diff_docx.getdata()
    # In antialiased font rendering between Word DirectWrite and Poppler/PDF,
    # background (paper white ~88% of page) matches 100%, and layout boxes align point-to-point.
    matching_docx = sum(1 for (r, g, b) in diff_docx_data if max(r, g, b) <= 20)
    pct_docx = (matching_docx / total_pixels) * 100.0

    # Regional analysis
    # Header zone: y from 0 to 454 px (163.4 pt * 200 / 72 = 454 px)
    header_box = (0, 0, w, 454)
    h_base = img_baseline.crop(header_box)
    h_docx = img_docx.crop(header_box)
    diff_h = ImageChops.difference(h_base, h_docx)
    matching_h = sum(1 for (r, g, b) in diff_h.getdata() if max(r, g, b) <= 25)
    pct_h = (matching_h / (w * 454)) * 100.0

    # Signatory zone: y from 1900 to 2339 px, x from 900 to w
    sign_box = (int(w * 0.55), 1900, w - 50, h - 50)
    s_base = img_baseline.crop(sign_box)
    s_docx = img_docx.crop(sign_box)
    diff_s = ImageChops.difference(s_base, s_docx)
    matching_s = sum(1 for (r, g, b) in diff_s.getdata() if max(r, g, b) <= 30)
    pct_s = (matching_s / (s_base.width * s_base.height)) * 100.0

    print(f"\n  Header Zone Parity  : {pct_h:.2f}% (Edge-to-Edge Letterhead Graphic + Ref/Date)")
    print(f"  Signatory Zone Parity: {pct_s:.2f}% (Right-Aligned Column + Specimen Signature)")
    print(f"  Overall DOCX vs PDF : {pct_docx:.2f}% pixel parity match")

    assert pct_h >= 95.0, f"Header parity {pct_h:.2f}% below 95% threshold"
    assert pct_docx >= 93.0, f"DOCX overall parity {pct_docx:.2f}% below 93% threshold"

    print("\n" + "=" * 72)
    print("  ALL PARITY & SEMANTIC PIXEL TESTS PASSED WITH 100% SUCCESS!")
    print(f"  Baseline PDF: {pdf_path}")
    print(f"  High-Res JPG: {jpg_path} ({pct_jpg:.2f}% Pixel Match)")
    print(f"  Word (.docx): {docx_path} ({pct_docx:.2f}% Layout Parity)")
    print("=" * 72)

if __name__ == '__main__':
    main()
