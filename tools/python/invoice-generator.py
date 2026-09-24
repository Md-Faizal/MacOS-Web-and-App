#!/usr/bin/env python3
"""
Invoice PDF Generator for Utkal Chemical Aushadhalaya
Generates GST-compliant invoices in landscape A4 format
Usage: python invoice-generator.py --db <db_path> --invoice <invoice_no> --out <output_path>
"""

import sys
import sqlite3
import argparse
import re
import json
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
import os
import tempfile
import base64
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.pdfbase.pdfdoc import PDFDictionary, PDFName, PDFStream

def mm_to_pt(mm_val):
    """Convert millimeters to points."""
    return mm_val * mm

def num_to_indian_words(n):
    """Converts a number to Indian currency words (Lakhs/Crores)."""
    units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", 
             "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    
    def two_digits(n):
        if n < 20: 
            return units[n]
        return tens[n // 10] + (" " + units[n % 10] if n % 10 != 0 else "")

    if n == 0: 
        return "Zero"
    
    parts = []
    
    crore = int(n // 10000000)
    n = n % 10000000
    if crore: 
        parts.append(two_digits(crore) + " Crore")
    
    lakh = int(n // 100000)
    n = n % 100000
    if lakh: 
        parts.append(two_digits(lakh) + " Lakh")
    
    thousand = int(n // 1000)
    n = n % 1000
    if thousand: 
        parts.append(two_digits(thousand) + " Thousand")
    
    hundred = int(n // 100)
    rest = int(n % 100)
    if hundred: 
        parts.append(units[hundred] + " Hundred")
    
    if rest:
        if parts: 
            parts.append("and " + two_digits(rest))
        else: 
            parts.append(two_digits(rest))
        
    return " ".join(parts)

def amount_in_words(val):
    """Convert amount to Indian currency words."""
    val = round(float(val), 2)
    rupees = int(val)
    paise = int(round((val - rupees) * 100))
    words = num_to_indian_words(rupees)
    if paise:
        words += f" and {num_to_indian_words(paise)} Paise"
    words += " Only"
    return words

def format_date(date_str):
    """Formats date from YYYY-MM-DD to DD-MM-YYYY."""
    if not date_str:
        return ""
    date_part = str(date_str)[:10]
    if len(date_part) == 10 and date_part[4] == '-' and date_part[7] == '-':
        y, m, d = date_part.split('-')
        return f"{d}-{m}-{y}"
    return date_part


def export_invoice_pdf(invoice_data, output_path):
    """
    Generates the PDF based on the dictionary 'invoice_data'.
    This function is purely for rendering and contains NO database logic.
    """
    products = invoice_data.get('products', [])

    # Layout Definitions
    left_margin = mm_to_pt(5)
    right_margin = mm_to_pt(5)
    top_margin = mm_to_pt(5)
    bottom_margin = mm_to_pt(5)
    width, height = landscape(A4)
    table_width = width - left_margin - right_margin

    # Precise column widths (19 columns)
    column_widths = [
        14.91, 37.69, 26.50, 159.03, 33.96, 64.19, 30.23, 37.69, 
        30.23, 45.56, 40.17, 46.38, 30.23, 26.92, 30.23, 41.41, 
        30.23, 41.83, 45.14
    ]

    c = canvas.Canvas(output_path, pagesize=landscape(A4))
    
    # --- Outer Border ---
    c.setStrokeColor(colors.black)
    c.setLineWidth(1)
    c.rect(left_margin, bottom_margin, table_width, height - mm_to_pt(10), stroke=1, fill=0)

    # --- Header Section Setup ---
    header_top = height - mm_to_pt(5)
    header_height = mm_to_pt(32)
    left_w = mm_to_pt(98)
    center_w = mm_to_pt(120)
    right_x = left_margin + left_w + center_w
    right_w = width - left_margin - right_margin - (left_w + center_w)
    
    header_y = header_top - header_height

    # Draw Header Boxes
    c.rect(left_margin, header_y, left_w, header_height, stroke=1, fill=0)
    c.rect(left_margin + left_w, header_y, center_w, header_height, stroke=1, fill=0)
    c.rect(right_x, header_y, right_w, header_height, stroke=1, fill=0)

    # --- Left: Company Info (Hardcoded as per request) ---
    c.setFont("Helvetica-Bold", 13)
    c.setFillColor(colors.HexColor('#1a237e'))
    c.drawString(left_margin + mm_to_pt(2), header_y + header_height - mm_to_pt(5), "UTKAL CHEMICAL AUSHADHALAYA")
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 7.5)
    c.drawString(left_margin + mm_to_pt(2), header_y + header_height - mm_to_pt(11), "FACT ADD::Binaba Marg, Aska, Ganjam, Pin.761110")
    c.drawString(left_margin + mm_to_pt(2), header_y + header_height - mm_to_pt(15), "COMP ADD::D1, Basera Comple,Dumduma,BBSR")
    c.drawString(left_margin + mm_to_pt(2), header_y + header_height - mm_to_pt(19), "PIN CODE::751019     Phone : 06822273304 / 943933330")
    c.setFillColor(colors.HexColor('#1a237e'))
    c.drawString(left_margin + mm_to_pt(2), header_y + header_height - mm_to_pt(23), "GSTIN : 21BOCPM8229J2ZWPAN :")

    # --- Right: Customer Info ---
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 8)
    label = "Party Name :"
    value = invoice_data.get('party_name', '')
    party_x = right_x + mm_to_pt(2)
    party_y = header_y + header_height - mm_to_pt(5)
    c.drawString(party_x, party_y, label)
    
    # Auto-fit party name
    max_party_width = right_w - c.stringWidth(label, "Helvetica", 8) - 12
    font_size = 8.5
    label_width = c.stringWidth(label, "Helvetica", 8)
    while c.stringWidth(value, "Helvetica-Bold", font_size) > max_party_width and font_size > 4:
        font_size -= 0.1
    c.setFont("Helvetica-Bold", font_size)
    c.drawString(party_x + label_width + 4, party_y, value)
    
    c.setFont("Helvetica", 8)
    address = invoice_data.get('address', '')
    line1 = address[:60].strip() if len(address) > 60 else address.strip()
    c.drawString(right_x + mm_to_pt(2), header_y + header_height - mm_to_pt(10), line1)
    c.drawString(right_x + mm_to_pt(2), header_y + header_height - mm_to_pt(14), f"PHONE : {invoice_data.get('phone', '')}")
    c.drawString(right_x + mm_to_pt(2), header_y + header_height - mm_to_pt(18), f"Licence No. : {invoice_data.get('licence_no', '')}")
    c.drawString(right_x + mm_to_pt(2), header_y + header_height - mm_to_pt(22), f"PAN : {invoice_data.get('pan', '')}")
    c.drawString(right_x + mm_to_pt(2), header_y + header_height - mm_to_pt(26), f"GSTIN : {invoice_data.get('gstin', '')}")

    # --- Center: Title ---
    c.setFont("Helvetica-Bold", 15)
    c.setFillColor(colors.HexColor('#1a237e'))
    c.drawCentredString(left_margin + left_w + center_w/2, header_y + header_height - mm_to_pt(8), "GST INVOICE")
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(left_margin + left_w + center_w/2, header_y + header_height - mm_to_pt(15), "CREDIT")
    c.setFillColor(colors.black)

    # --- Invoice Info Grid (Center) ---
    header_bottom_line_y = header_y - 12
    
    # Gray bar
    c.setFillColor(colors.HexColor("#c4c4c4"))
    c.rect(left_margin, header_bottom_line_y, table_width, 12, stroke=0, fill=1)
    c.setFillColor(colors.black)
    c.line(left_margin, header_bottom_line_y, left_margin + table_width, header_bottom_line_y)

    table_x = left_margin + left_w
    table_y = header_y + header_height - mm_to_pt(18) - mm_to_pt(14)
    table_w = center_w
    table_h = mm_to_pt(14)
    
    # Draw internal invoice grid
    c.rect(table_x, table_y, table_w, table_h, stroke=1, fill=0)
    for i in range(1, 4):
        x = table_x + i * (table_w / 4.0)
        c.line(x, table_y, x, table_y + table_h)
    c.line(table_x, table_y + table_h/2, table_x + table_w, table_y + table_h/2)

    # Helper for cell data
    cell_w = table_w / 4.0
    cell_h = table_h / 2.0
    def cell_vcenter(row): 
        return table_y + (1 - row) * cell_h + cell_h / 2 - 3.5

    c.setFont("Helvetica", 7)
    pad_x = mm_to_pt(1.5)
    
    # Row 0
    c.drawString(table_x + pad_x, cell_vcenter(0) + 3, "Invoice No")
    c.drawString(table_x + cell_w + pad_x, cell_vcenter(0) + 3, str(invoice_data.get('invoice_no', '')))
    c.drawString(table_x + 2*cell_w + pad_x, cell_vcenter(0) + 6, "Order No.")
    c.setFont("Helvetica", 7)
    c.drawString(table_x + 2*cell_w + pad_x, cell_vcenter(0) - 2, "Order Date")
    c.setFont("Helvetica-Bold", 7)
    c.drawString(table_x + 3*cell_w + pad_x, cell_vcenter(0) + 3, "Cases   0")

    # Row 1
    c.setFont("Helvetica-Bold", 7)
    c.drawString(table_x + pad_x, cell_vcenter(1) + 6, "Invoice Date")
    c.setFont("Helvetica", 7)
    c.drawString(table_x + pad_x, cell_vcenter(1) - 2, "Due Date")
    
    c.drawString(table_x + cell_w + pad_x, cell_vcenter(1) + 6, format_date(invoice_data.get('invoice_date', '')))
    c.drawString(table_x + cell_w + pad_x, cell_vcenter(1) - 2, format_date(invoice_data.get('due_date', '')))

    
    c.setFont("Helvetica-Bold", 7)
    c.drawString(table_x + 2*cell_w + pad_x, cell_vcenter(1) + 6, "L.R. No.")
    c.setFont("Helvetica", 7)
    c.drawString(table_x + 2*cell_w + pad_x, cell_vcenter(1) - 2, f"L.R. Date {format_date(invoice_data.get('lr_date', ''))}")

    c.setFont("Helvetica-Bold", 7)
    c.drawString(table_x + 3*cell_w + pad_x, cell_vcenter(1) + 3, "Transport")

    c.line(left_margin, table_y, width - right_margin, table_y)

    # --- Footer Grid Lines ---
    y1 = bottom_margin + 174
    y2 = bottom_margin + 162
    y3 = bottom_margin + 112
    y4 = bottom_margin + 100
    y5 = bottom_margin + 70
    
    vertical_x = left_margin + left_w + center_w
    vertical_x2 = width - right_margin - 340

    # Horizontal Lines
    c.line(left_margin, y1, width - right_margin, y1)
    c.line(left_margin, y2, width - right_margin, y2)
    c.line(left_margin, y3, vertical_x, y3)
    c.line(left_margin, y4, vertical_x, y4)
    c.line(left_margin, y5, width - right_margin, y5)

    # Vertical Lines
    c.line(vertical_x, y1, vertical_x, y5)
    c.line(vertical_x2, y1, vertical_x2, y4)

    # 6 Equidistant vertical lines in bottom left quadrant
    x_gap = (vertical_x2 - left_margin) / 7
    equi_xs = [left_margin + i * x_gap for i in range(1, 7)]
    for x in equi_xs:
        c.line(x, y1, x, y4)
    
    gst_col_xs = equi_xs + [vertical_x2]

    # --- Column Headers ---
    table_header_y = header_y - (header_y - header_bottom_line_y)/2 - 4
    c.setFont("Helvetica-Bold", 8)
    col_titles = ["SL", "HSN", "MFG", "PRODUCT NAME", "PACK", "BATCH NO.", "EXP", "QTY.", "FREE", "M.R.P", "RATE", "AMOUNT", "DIS1", "DIS2", "SGST", "Value", "CGST", "Value", "FINAL AMT"]
    
    x_curr = left_margin
    c.line(left_margin, header_y, left_margin, y1)
    
    for i, w in enumerate(column_widths):
        if i < len(col_titles) and col_titles[i]:
            if i in [0, 1, 2, 5, 7, 8, 12, 13, 14, 15, 16, 17]:
                text_width = c.stringWidth(col_titles[i], "Helvetica-Bold", 8)
                c.drawString(x_curr + (w - text_width)/2, table_header_y, col_titles[i])
            else:
                c.drawString(x_curr + 2, table_header_y, col_titles[i])
        
        x_curr += w
        if i < len(column_widths) - 1:
            c.line(x_curr, header_y, x_curr, y1)

    # --- Product Rows ---
    product_table_top = header_bottom_line_y
    product_row_height = 10
    
    for row_idx, prod in enumerate(products):
        y = product_table_top - 12 - (row_idx * product_row_height) + 3
        
        # Use pack value directly as-is from database (e.g., "16 TAB")
        pack_str = str(prod.get('pack', '')) if prod.get('pack') else ''
        
        # Handle exp_date - show "--" if None or empty
        exp_date_str = str(prod.get('exp_date', '')) if prod.get('exp_date') else '--'
        
        row_data = [
            str(row_idx + 1),
            "30049011",
            "FINI",
            str(prod.get('name', '') + (" (G)" if prod.get('is_gold') else "")),
            pack_str,
            str(prod.get('batch_no', '')),
            exp_date_str,
            str(int(prod.get('qty', 0))),
            str(int(prod.get('free', 0))),
            f"{float(prod.get('mrp', 0)):.2f}",
            f"{float(prod.get('rate', 0)):.2f}",
            f"{float(prod.get('amount', 0)):.2f}",
            f"{float(prod.get('dis1', 0)):.2f}%",
            f"{float(prod.get('dis2', 0)):.2f}%",
            f"{float(prod.get('sgst_per', 0)):.2f}%",
            f"{float(prod.get('sgst_val', 0)):.2f}",
            f"{float(prod.get('cgst_per', 0)):.2f}%",
            f"{float(prod.get('cgst_val', 0)):.2f}",
            f"{float(prod.get('final_amt', 0)):.2f}"
        ]

        x_curr = left_margin
        c.setFont("Helvetica", 8)
        
        for col_idx, value in enumerate(row_data):
            col_w = column_widths[col_idx]
            
            # Product Name Auto-Scaling
            if col_idx == 3: 
                max_name_width = col_w - 3
                font_size = 8
                while c.stringWidth(value, "Helvetica", font_size) > max_name_width and font_size > 4:
                    font_size -= 0.1
                c.setFont("Helvetica", font_size)
                c.drawString(x_curr + 2, y, value)
                c.setFont("Helvetica", 8)
            # Center Align
            elif col_idx in [0, 1, 2, 5, 6, 7, 8, 12, 13, 14, 15, 16, 17]:
                c.drawCentredString(x_curr + col_w / 2, y, value)
            # Right Align
            elif col_idx in [4, 9, 10, 11, 18]:
                c.drawRightString(x_curr + col_w - 2, y, value)
            # Left Align
            else:
                c.drawString(x_curr + 2, y, value)
            
            x_curr += col_w

    # --- Footer Calculations & Labels ---
    
    # GST Grid Setup - calculate values from invoice data
    # total_value should be sum of amounts in product table (same as Grand Total)
    total_value = sum(float(p.get('amount', 0)) for p in products)
    dis_amt = float(invoice_data.get('total_discount', 0))
    sgst_pay = float(invoice_data.get('total_sgst', 0))
    cgst_pay = float(invoice_data.get('total_cgst', 0))
    
    # Use proper equidistant columns (2nd to 6th equidistant line, then vertical_x2)
    gst_col_xs = equi_xs[1:6] + [vertical_x2]  # 2nd to 6th line (indices 1:6 gives us 1,2,3,4,5), then vertical_x2
    
    num_gst_rows = 4
    row_height = (y2 - y3 - 20) / num_gst_rows
    extra_space = 4
    
    # --- GST GRID COLUMN HEADERS (using fixed column widths like reference) ---
    col_headers = ["CLASS", "TOTAL", "SCHEME", "DISCOUNT", "SGST", "CGST", "TOTAL GST"]
    class_col_widths = [90, 60, 60, 88, 66, 44, 146]  # Column widths matching reference
    header_x = left_margin + 15  # Start position for headers (15pt from left margin like reference)
    c.setFont("Helvetica-Bold", 7)
    for j, header in enumerate(col_headers):
        c.drawString(header_x + 2, y2 + 2, header)
        header_x += class_col_widths[j]
    
    # --- GST GRID ROW LABELS ---
    gst_labels = ["GST 5.00%", "GST 12.00%", "GST 18.00%", "GST 28.00%"]
    label_x = left_margin + 5
    
    # --- GST GRID VALUES (4 rows x 6 columns) ---
    # First row has values, other rows are 0.00
    for i in range(num_gst_rows):
        y = y2 - 10 - (i + 0.5) * row_height - i * extra_space
        
        # Draw row label
        c.setFont("Helvetica-Bold", 8)
        c.drawString(label_x, y, gst_labels[i])
        
        # Draw values
        for j in range(6):
            if j < len(gst_col_xs):
                c.setFont("Helvetica-Bold", 9)
                c.setFillColor(colors.black)
                # Only draw values in first row (i = 0), zeros for others
                if i == 0:
                    if j == 0:
                        value = f"{total_value:,.2f}"
                    elif j == 1:
                        value = "0.00"
                    elif j == 2:
                        value = f"{dis_amt:,.2f}"
                    elif j == 3:
                        value = f"{sgst_pay:,.2f}"
                    elif j == 4:
                        value = f"{cgst_pay:,.2f}"
                    elif j == 5:
                        value = f"{sgst_pay + cgst_pay:,.2f}"
                    else:
                        value = "0.00"
                    c.drawRightString(gst_col_xs[j] - 7, y, value)
                else:
                    c.drawRightString(gst_col_xs[j] - 7, y, "0.00")

    # Draw TOTAL row in GST grid (below GST 28.00%)
    total_row_y = y2 - 10 - (num_gst_rows + 0.5) * row_height - num_gst_rows * extra_space
    
    # Draw TOTAL values
    for j in range(6):
        if j < len(gst_col_xs):
            c.setFont("Helvetica-Bold", 9)
            c.setFillColor(colors.black)
            if j == 0:
                value = f"{total_value:,.2f}"
            elif j == 1:
                value = "0.00"
            elif j == 2:
                value = f"{dis_amt:,.2f}"
            elif j == 3:
                value = f"{sgst_pay:,.2f}"
            elif j == 4:
                value = f"{cgst_pay:,.2f}"
            elif j == 5:
                value = f"{sgst_pay + cgst_pay:,.2f}"
            else:
                value = "0.00"
            c.drawRightString(gst_col_xs[j] - 7, total_row_y, value)

    # Draw DIS AMT value between y1 and y2, vertically centered, 40pt right of vertical_x2
    c.setFont("Helvetica", 10)  # Unbold
    dis_amt_x = vertical_x2 + 40
    dis_amt_y = (y1 + y2) / 2 - 3.5
    c.drawString(dis_amt_x, dis_amt_y, f"{dis_amt:,.2f}")

    # Draw dummy text "0.00" at 60pt right of vertical_x2, same vertical position
    c.drawString(vertical_x2 + 100, dis_amt_y, "0.00")

    # Totals (Bottom Left Strip)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left_margin + 15, y4 + 1.5, "TOTAL")
    
    grand_total = float(invoice_data.get('grand_total', 0))
    amount_words = f"Rs. {amount_in_words(grand_total)}"
    c.drawString(left_margin + 15, y4 + (y5 - y4)/2 - 4.5, amount_words)

    # --- Right Side Summary ---
    items_x = vertical_x2 + 10
    items_y = y3 + (y2 - y3)/2
    c.setFont("Helvetica", 9)  # Unbold
    c.drawString(items_x, items_y + 6, f"Total Items :-     {len(products)}")
    total_qty = sum(int(p.get('qty', 0)) + int(p.get('free', 0)) for p in products)
    c.drawString(items_x, items_y - 6, f"Total Qty  :-     {total_qty:.2f}")
    c.setFont("Helvetica-Bold", 9)  # Restore bold

    # Previous Due
    prev_due = float(invoice_data.get('previous_due', 0))
    c.drawString(items_x, y4 + (y5 - y4)/2, f"Previous Due: Rs. {prev_due:,.2f}")

    # Summary Numbers (Right Column)
    right_labels = [
        ("DIS AMT.", f"{float(invoice_data.get('total_discount', 0)):.2f}"),
        ("SGST PAYBLE", f"{float(invoice_data.get('total_sgst', 0)):.2f}"),
        ("CGST PAYBLE", f"{float(invoice_data.get('total_cgst', 0)):.2f}"),
        ("CR/DR NOTE", "0.00"),
        ("ROUND OFF", f"{float(invoice_data.get('round_off', 0)):.2f}")
    ]
    
    label_x = vertical_x + 10
    value_x = width - right_margin - 10
    for i, (lbl, val) in enumerate(right_labels):
        y = y2 - 15 - (i * 12)
        c.drawString(label_x, y, lbl)
        c.drawRightString(value_x, y, val)

    # Grand Total (Bottom Right)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(label_x, y5 + 15, "Grand Total")
    c.setFont("Helvetica-Bold", 13)
    c.drawRightString(value_x, y5 + 15, f"{grand_total:,.2f}")

    # "TOTAL" Header and Value (Middle Strip)
    total_label_y = (y1 + y2) / 2 - 3.5
    c.setFont("Helvetica-Bold", 10)
    c.drawString(label_x, total_label_y, "TOTAL:")
    
    total_amt = sum(float(p.get('amount', 0)) for p in products)
    c.drawRightString(value_x, total_label_y, f"{total_amt:,.2f}")

    # Footer Notes & Signature
    footer_note_y = y5 - 10
    c.setFont("Helvetica-Bold", 9)
    notes = [
        "Note:Goods once sold will not be taken back or exchanged.",
        "Bills not paid due date will attract 24% interest.",
        "All disputes subject to BHUBANESWAR Jurisdiction only.",
        "Prescribed Sales Tax declaration will be given."
    ]
    for i, note in enumerate(notes):
        c.drawString(left_margin + 10, footer_note_y - i * 13, note)
    
    # Dotted line below the notes, ending at the right edge of the last line of text
    note_left = left_margin + 10
    line_height = 13
    footer_note_end_y = footer_note_y - len(notes) * line_height - 2
    # Calculate max text width
    c.setFont("Helvetica-Bold", 9)
    max_text_width = 0
    for note in notes:
        text_width = c.stringWidth(note, "Helvetica-Bold", 9)
        max_text_width = max(max_text_width, text_width)
    c.setDash(2, 2)
    c.line(note_left, footer_note_end_y, note_left + max_text_width, footer_note_end_y)
    c.setDash()  # Reset dash
    c.setFillColor(colors.black)
    
    # Right-align FOR and Signatory text to the right margin
    for_text = "FOR  UTKAL CHEMICAL AUSHADHALAYA"
    signatory_text = "Authorised Signatory"
    c.drawRightString(width - right_margin - 10, y5 - 15, for_text)
    c.drawRightString(width - right_margin - 10, bottom_margin + 10, signatory_text)

    # --- Software credit ---
    software_text = "Our Software MARG Erp 9437026823,7978789800"
    font_name = "Helvetica"
    font_size = 7
    c.setFont(font_name, font_size)
    c.setFillColor(colors.black)
    # Vertically center between page bottom (y=0) and bottom_margin
    center_y = bottom_margin / 2.0
    ascent = pdfmetrics.getAscent(font_name) * font_size / 1000.0
    descent = abs(pdfmetrics.getDescent(font_name) * font_size / 1000.0)
    text_height = ascent + descent
    baseline_y = center_y - (ascent - descent) / 2.0
    c.drawCentredString(width / 2.0, baseline_y, software_text)

    # Duplex check
    app_settings = invoice_data.get('app_settings', {})
    is_duplex = invoice_data.get('duplex_print', None)
    if isinstance(is_duplex, str):
        is_duplex = is_duplex.lower() in ('true', '1', 'yes')
    elif is_duplex is None:
        is_duplex = str(app_settings.get('invoice_duplex_print', 'true')).lower() in ('true', '1', 'yes')
        
    if is_duplex:
        draw_back_page(c, invoice_data, width, height, left_margin, right_margin, top_margin, bottom_margin)

    c.save()

def draw_spaced_string(c, x, y, text, font_name, font_size, spacing=0, align='left'):
    c.setFont(font_name, font_size)
    if spacing <= 0:
        if align == 'center':
            c.drawCentredString(x, y, text)
        elif align == 'right':
            c.drawRightString(x, y, text)
        else:
            c.drawString(x, y, text)
        return
    total_w = sum(c.stringWidth(ch, font_name, font_size) + (spacing if i < len(text) - 1 else 0) for i, ch in enumerate(text))
    start_x = x
    if align == 'center':
        start_x = x - total_w / 2.0
    elif align == 'right':
        start_x = x - total_w
    cur_x = start_x
    for i, ch in enumerate(text):
        c.drawString(cur_x, y, ch)
        cur_x += c.stringWidth(ch, font_name, font_size) + spacing

def draw_back_page(c, invoice_data, width, height, left_margin, right_margin, top_margin, bottom_margin):
    c.showPage()
    # Switch to Portrait (Vertical) A4 for the back page
    from reportlab.lib.pagesizes import A4
    page_w, page_h = A4[0], A4[1]
    c.setPageSize((page_w, page_h))
    
    app_settings = invoice_data.get('app_settings', {})
    
    # -------------------------------------------------------------
    # 1. LEFT SIDEBAR (`.sidebar` - width 75mm, height 297mm)
    # -------------------------------------------------------------
    sidebar_w = mm_to_pt(75) # ~212.60 pt
    c.setFillColor(colors.HexColor('#0b1c17'))
    c.rect(0, 0, sidebar_w, page_h, fill=1, stroke=0)
    
    # Sidebar Background SVGs (`sidebar_svg` exact coordinates: viewBox="0 0 200 800")
    # scale_x = 212.598 / 200 = 1.0630, scale_y = 841.89 / 800 = 1.0524
    c.saveState()
    # Path 1: M-50,50 C150,200 -50,350 150,500 C350,650 -50,800 150,950
    p1 = c.beginPath()
    p1.moveTo(-53.15, page_h - 52.62)
    p1.curveTo(159.45, page_h - 210.47, -53.15, page_h - 368.33, 159.45, page_h - 526.18)
    p1.curveTo(372.05, page_h - 684.04, -53.15, page_h - 841.89, 159.45, page_h - 999.74)
    c.setStrokeColor(colors.HexColor('#c59b27'))
    c.setLineWidth(2)
    c.setStrokeAlpha(0.25)
    c.drawPath(p1, fill=0, stroke=1)
    
    # Path 2: M250,-50 C50,100 300,250 100,400 C-100,550 300,700 50,850
    p2 = c.beginPath()
    p2.moveTo(265.75, page_h + 52.62)
    p2.curveTo(53.15, page_h - 105.24, 318.90, page_h - 263.09, 106.30, page_h - 420.94)
    p2.curveTo(-106.30, page_h - 578.80, 318.90, page_h - 736.65, 53.15, page_h - 894.51)
    c.setLineWidth(1.5)
    c.setStrokeAlpha(0.15)
    c.drawPath(p2, fill=0, stroke=1)
    
    # Circles
    c.setFillColor(colors.HexColor('#c59b27'))
    c.setFillAlpha(0.4)
    c.circle(31.89, page_h - 157.85, 3.19, fill=1, stroke=0) # cx=30, cy=150, r=3
    c.setFillAlpha(0.5)
    c.circle(180.71, page_h - 473.56, 4.25, fill=1, stroke=0) # cx=170, cy=450, r=4
    c.setFillAlpha(0.4)
    c.circle(53.15, page_h - 684.04, 2.66, fill=1, stroke=0) # cx=50, cy=650, r=2.5
    c.setFillAlpha(0.3)
    c.circle(170.08, page_h - 210.47, 2.13, fill=1, stroke=0) # cx=160, cy=200, r=2
    c.restoreState()
    
    # Top Chevron Logo Icon (margin-top: 10mm inside 15mm top padding -> 25mm from top)
    # 30x30 scaled viewBox 0 0 24 24 -> scale 1.25
    chev_y = page_h - mm_to_pt(25) - 15 # center at 25mm + 15px top
    chev_x = sidebar_w / 2.0
    c.saveState()
    c.setStrokeColor(colors.HexColor('#c59b27'))
    c.setLineWidth(2)
    p_chev = c.beginPath()
    # M12 2L2 7l10 5 10-5-10-5z
    p_chev.moveTo(chev_x, chev_y + 12.5)
    p_chev.lineTo(chev_x - 12.5, chev_y + 6.25)
    p_chev.lineTo(chev_x, chev_y)
    p_chev.lineTo(chev_x + 12.5, chev_y + 6.25)
    p_chev.close()
    # M2 17l10 5 10-5
    p_chev.moveTo(chev_x - 12.5, chev_y - 6.25)
    p_chev.lineTo(chev_x, chev_y - 12.5)
    p_chev.lineTo(chev_x + 12.5, chev_y - 6.25)
    # M2 12l10 5 10-5
    p_chev.moveTo(chev_x - 12.5, chev_y)
    p_chev.lineTo(chev_x, chev_y - 6.25)
    p_chev.lineTo(chev_x + 12.5, chev_y)
    c.drawPath(p_chev, fill=0, stroke=1)
    c.restoreState()
    
    # --- Sidebar QR Container 1: PAYMENT QR (margin-top: 25mm below chevron div) ---
    qr1_title_y = page_h - mm_to_pt(59) # ~675 pt
    c.setFillColor(colors.HexColor('#c59b27'))
    draw_spaced_string(c, sidebar_w / 2.0, qr1_title_y, "PAYMENT QR", "Helvetica-Bold", 8.5, spacing=2, align='center')
    
    qr_box_size = mm_to_pt(42) + 16 # 42mm + 16px padding = ~131.06 pt
    qr1_box_x = (sidebar_w - qr_box_size) / 2.0
    qr1_box_y = qr1_title_y - 12 - qr_box_size # margin-bottom: 12px
    
    c.setFillColor(colors.HexColor('#ffffff'))
    c.roundRect(qr1_box_x, qr1_box_y, qr_box_size, qr_box_size, radius=12, fill=1, stroke=0)
    
    qr_inner_size = mm_to_pt(42) # ~119.06 pt
    qr1_x = qr1_box_x + 8 # 8px padding
    qr1_y = qr1_box_y + 8
    
    payment_qr_img = app_settings.get('payment_qr_image', '')
    payment_upi_id = app_settings.get('payment_upi_id', '7749089400@hdfc')
    
    grand_total = float(invoice_data.get('grand_total', 0))
    prev_due = float(invoice_data.get('previous_due', 0))
    total_due = grand_total + prev_due
    invoice_no = invoice_data.get('invoice_no', '')
    
    if not payment_upi_id.startswith('upi://'):
        upi_str = f"upi://pay?pa={payment_upi_id}&pn=Utkal%20Chemical%20Aushadhalaya"
        display_upi = payment_upi_id
    else:
        upi_str = payment_upi_id
        import urllib.parse as up
        parsed = up.urlparse(display_upi_raw := payment_upi_id)
        params = up.parse_qs(parsed.query)
        display_upi = params.get('pa', [display_upi_raw])[0]
        
    if '&cu=' not in upi_str and '?cu=' not in upi_str:
        upi_str += "&cu=INR"
    if invoice_no and '&tn=' not in upi_str and '?tn=' not in upi_str:
        from urllib.parse import quote
        note_text = f"Inv:{invoice_no} (Bill:{grand_total:,.0f}|Due:{total_due:,.0f})"
        note_text = note_text[:52]
        upi_str += f"&tn={quote(note_text)}"
    
    img_drawn = False
    temp_img_path = None
    try:
        # If a static image is provided AND no dynamic amount is needed, or if static image preference applies
        if payment_qr_img and not (grand_total > 0):
            if payment_qr_img.startswith('data:image/'):
                header_part, base64_data = payment_qr_img.split(',', 1)
                img_bytes = base64.b64decode(base64_data)
                ext = '.webp'
                if 'jpeg' in header_part or 'jpg' in header_part: ext = '.jpg'
                elif 'png' in header_part: ext = '.png'
                tf = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
                tf.write(img_bytes)
                tf.close()
                temp_img_path = tf.name
                c.drawImage(temp_img_path, qr1_x, qr1_y, width=qr_inner_size, height=qr_inner_size, preserveAspectRatio=True)
                img_drawn = True
            elif payment_qr_img:
                candidates = [
                    payment_qr_img,
                    os.path.join(os.path.dirname(__file__), '..', payment_qr_img),
                    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', payment_qr_img)
                ]
                for cand in candidates:
                    if os.path.exists(cand) and os.path.isfile(cand):
                        c.drawImage(cand, qr1_x, qr1_y, width=qr_inner_size, height=qr_inner_size, preserveAspectRatio=True)
                        img_drawn = True
                        break
    except Exception as e:
        print(f"[QR Warning] Could not draw payment QR image: {e}")
    finally:
        if temp_img_path and os.path.exists(temp_img_path):
            try: os.unlink(temp_img_path)
            except: pass
            
    if not img_drawn:
        try:
            w = qr.QrCodeWidget(upi_str, barFillColor=colors.HexColor('#0b1c17'), barStrokeColor=colors.HexColor('#0b1c17'))
            bounds = w.getBounds()
            w_w = bounds[2] - bounds[0]
            w_h = bounds[3] - bounds[1]
            d = Drawing(qr_inner_size, qr_inner_size, transform=[qr_inner_size/w_w, 0, 0, qr_inner_size/w_h, 0, 0])
            d.add(w)
            renderPDF.draw(d, c, qr1_x, qr1_y)
        except Exception as e:
            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor('#0b1c17'))
            c.drawString(qr1_x + 5, qr1_y + qr_inner_size/2, f"UPI: {display_upi}")
            
    draw_spaced_string(c, sidebar_w / 2.0, qr1_box_y - 18, f"UPI: {display_upi}", "Helvetica-Bold", 8, spacing=0.5, align='center')
    
    # Render Dues Summary below the UPI ID in light readable colors
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(colors.HexColor('#ffffff')) # White contrast on dark green sidebar
    c.drawCentredString(sidebar_w / 2.0, qr1_box_y - 30, f"Bill Amt: Rs. {grand_total:,.2f}")
    c.drawCentredString(sidebar_w / 2.0, qr1_box_y - 41, f"Prev Due: Rs. {prev_due:,.2f}")
    
    # Standout Total Due in brand gold
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#c59b27'))
    c.drawCentredString(sidebar_w / 2.0, qr1_box_y - 54, f"TOTAL DUE: Rs. {total_due:,.2f}")
    
    # Draw digital clickable "PAY VIA UPI APP" button if mode is export
    if invoice_data.get('export_mode', False):
        c.saveState()
        c.setFillColor(colors.HexColor('#c59b27'))
        btn_w = 85
        btn_h = 16
        btn_x = (sidebar_w / 2.0) - (btn_w / 2.0)
        btn_y = (qr1_box_y - 78) - (btn_h / 2.0)
        c.roundRect(btn_x, btn_y, btn_w, btn_h, radius=4, fill=1, stroke=0)
        c.setFillColor(colors.HexColor('#0b1c17'))
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(sidebar_w / 2.0, btn_y + 4.5, "PAY VIA UPI APP")
        c.linkURL(upi_str, (btn_x, btn_y, btn_x + btn_w, btn_y + btn_h), thickness=0)
        c.restoreState()
        
    # --- Sidebar QR Container 2: PORTAL ACCESS (margin-top: 35mm below qr1 sub) ---
    qr2_title_y = qr1_box_y - 18 - mm_to_pt(35)
    c.setFillColor(colors.HexColor('#c59b27'))
    draw_spaced_string(c, sidebar_w / 2.0, qr2_title_y, "PORTAL ACCESS", "Helvetica-Bold", 8.5, spacing=2, align='center')
    
    qr2_box_y = qr2_title_y - 12 - qr_box_size
    c.setFillColor(colors.HexColor('#ffffff'))
    c.roundRect(qr1_box_x, qr2_box_y, qr_box_size, qr_box_size, radius=12, fill=1, stroke=0)
    
    qr2_x = qr1_box_x + 8
    qr2_y = qr2_box_y + 8
    
    portal_base = app_settings.get('portal_base_url', 'https://mac.faizal.uk').rstrip('/')
    customer_id = invoice_data.get('customer_id') or invoice_data.get('i_customer_id') or 3
    portal_url = f"{portal_base}/customer-ledger.html?id={customer_id}"
    
    try:
        w_p = qr.QrCodeWidget(portal_url, barFillColor=colors.HexColor('#0b1c17'), barStrokeColor=colors.HexColor('#0b1c17'))
        bounds_p = w_p.getBounds()
        w_pw = bounds_p[2] - bounds_p[0]
        w_ph = bounds_p[3] - bounds_p[1]
        d_p = Drawing(qr_inner_size, qr_inner_size, transform=[qr_inner_size/w_pw, 0, 0, qr_inner_size/w_ph, 0, 0])
        d_p.add(w_p)
        renderPDF.draw(d_p, c, qr2_x, qr2_y)
    except Exception as e:
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor('#0b1c17'))
        c.drawString(qr2_x + 5, qr2_y + qr_inner_size/2, "Portal QR")
        
    draw_spaced_string(c, sidebar_w / 2.0, qr2_box_y - 18, "SCAN TO OPEN", "Helvetica-Bold", 8, spacing=0.5, align='center')
    
    # -------------------------------------------------------------
    # 2. MAIN CONTENT (`.main` - left 75mm, width 135mm, height 297mm)
    # -------------------------------------------------------------
    main_left = sidebar_w
    main_w = page_w - sidebar_w # ~382.68 pt
    c.setFillColor(colors.HexColor('#ffffff'))
    c.rect(main_left, 0, main_w, page_h, fill=1, stroke=0)
    
    # Main Background SVGs (`main_svg` exact coordinates: viewBox="0 0 500 800")
    # scale_x = 382.68 / 500 = 0.7654, scale_y = 1.0524
    c.saveState()
    # Top accent line: M 400 0 L 500 0 L 500 100 Z
    p_acc = c.beginPath()
    p_acc.moveTo(main_left + 400 * 0.7654, page_h)
    p_acc.lineTo(main_left + 500 * 0.7654, page_h)
    p_acc.lineTo(main_left + 500 * 0.7654, page_h - 100 * 1.0524)
    p_acc.close()
    c.setFillColor(colors.HexColor('#c59b27'))
    c.setFillAlpha(0.08)
    c.drawPath(p_acc, fill=1, stroke=0)
    
    # Decorative flower group: transform="translate(480, 780) scale(4)" opacity="0.04"
    # We use a Knockout Transparency Group Form XObject to ensure all 5 overlapping paths
    # at the stem composite as one uniform flat transparency layer without any dark overlap spots.
    c.beginForm('flower_bg')
    c.setStrokeColor(colors.HexColor('#0b1c17'))
    c.setFillColor(colors.HexColor('#0b1c17'))
    c.setLineWidth(3.65)
    # Origin of <g> in ReportLab: X = main_left + 480 * 0.7654 = main_left + 367.37, Y = page_h - 780 * 1.0524 = 21.05
    # Scale of <g> in ReportLab: S_x = 4 * 0.7654 = 3.0614, S_y = 4 * 1.0524 = 4.2094
    gx = main_left + 367.37
    gy = 21.05
    sx, sy = 3.0614, 4.2094

    def svg_to_rl(x, y):
        return (gx + sx * x, gy - sy * y)

    def q_to_c(path, x0, y0, xc, yc, x2, y2):
        rl_x0, rl_y0 = svg_to_rl(x0, y0)
        rl_xc, rl_yc = svg_to_rl(xc, yc)
        rl_x2, rl_y2 = svg_to_rl(x2, y2)
        c1x = rl_x0 + (2.0/3.0) * (rl_xc - rl_x0)
        c1y = rl_y0 + (2.0/3.0) * (rl_yc - rl_y0)
        c2x = rl_x2 + (2.0/3.0) * (rl_xc - rl_x2)
        c2y = rl_y2 + (2.0/3.0) * (rl_yc - rl_y2)
        path.curveTo(c1x, c1y, c2x, c2y, rl_x2, rl_y2)

    # Path 1: M0,0 Q-20,-40 0,-80 Q20,-40 0,0
    pg1 = c.beginPath()
    pg1.moveTo(*svg_to_rl(0, 0))
    q_to_c(pg1, 0, 0, -20, -40, 0, -80)
    q_to_c(pg1, 0, -80, 20, -40, 0, 0)
    pg1.close()
    c.drawPath(pg1, fill=1, stroke=1)

    # Path 2: M0,0 Q-40,-30 -60,-60 Q-20,-10 0,0
    pg2 = c.beginPath()
    pg2.moveTo(*svg_to_rl(0, 0))
    q_to_c(pg2, 0, 0, -40, -30, -60, -60)
    q_to_c(pg2, -60, -60, -20, -10, 0, 0)
    pg2.close()
    c.drawPath(pg2, fill=1, stroke=1)

    # Path 3: M0,0 Q40,-30 60,-60 Q20,-10 0,0
    pg3 = c.beginPath()
    pg3.moveTo(*svg_to_rl(0, 0))
    q_to_c(pg3, 0, 0, 40, -30, 60, -60)
    q_to_c(pg3, 60, -60, 20, -10, 0, 0)
    pg3.close()
    c.drawPath(pg3, fill=1, stroke=1)

    # Path 4: M0,0 Q-60,0 -80,-20 Q-30,10 0,0
    pg4 = c.beginPath()
    pg4.moveTo(*svg_to_rl(0, 0))
    q_to_c(pg4, 0, 0, -60, 0, -80, -20)
    q_to_c(pg4, -80, -20, -30, 10, 0, 0)
    pg4.close()
    c.drawPath(pg4, fill=0, stroke=1)

    # Path 5: M0,0 Q60,0 80,-20 Q30,10 0,0
    pg5 = c.beginPath()
    pg5.moveTo(*svg_to_rl(0, 0))
    q_to_c(pg5, 0, 0, 60, 0, 80, -20)
    q_to_c(pg5, 80, -20, 30, 10, 0, 0)
    pg5.close()
    c.drawPath(pg5, fill=0, stroke=1)
    c.endForm()

    # Attach Knockout Transparency Group dictionary to the Form XObject
    form_obj = c._doc.idToObject['FormXob.flower_bg']
    form_obj.Contents = PDFStream()
    form_obj.Contents.content = form_obj.stream
    form_obj.Contents.dictionary['Group'] = PDFDictionary({'Type': PDFName('Group'), 'S': PDFName('Transparency'), 'I': 'true', 'K': 'true'})

    c.saveState()
    c.setStrokeAlpha(0.04)
    c.setFillAlpha(0.04)
    c.doForm('flower_bg')
    c.restoreState()
    
    # Padding: 18mm top, 12mm left/right
    main_pad_x = main_left + mm_to_pt(12) # ~246.61 pt
    main_content_w = main_w - mm_to_pt(24) # ~314.65 pt
    cur_main_y = page_h - mm_to_pt(18) # ~790.87 pt
    
    # --- Header Block (.header) ---
    cur_main_y -= 26 # baseline for 26pt
    c.setFillColor(colors.HexColor('#0b1c17'))
    draw_spaced_string(c, main_pad_x, cur_main_y, "UTKAL CHEMICAL", "Helvetica-Bold", 26, spacing=1)
    
    cur_main_y -= 24 # margin-top: 4px + 19pt text
    c.setFillColor(colors.HexColor('#c59b27'))
    draw_spaced_string(c, main_pad_x, cur_main_y, "AUSHADHALAYA", "Helvetica-Bold", 19, spacing=3)
    
    cur_main_y -= 22 # margin-bottom: 12px + 9pt
    c.setStrokeColor(colors.HexColor('#c59b27'))
    c.setLineWidth(3)
    c.line(main_pad_x, cur_main_y - 12, main_pad_x, cur_main_y + 11)
    
    c.setFillColor(colors.HexColor('#666666'))
    draw_spaced_string(c, main_pad_x + 10, cur_main_y + 1, "PAYMENT QR CODE, BANK ACCOUNT", "Helvetica-Bold", 9, spacing=0.5)
    draw_spaced_string(c, main_pad_x + 10, cur_main_y - 11.6, "DETAILS & DIGITAL LEDGER PORTAL", "Helvetica-Bold", 9, spacing=0.5)
    
    # --- Meta Bar (.meta-bar: margin-top 15px, padding-top 12px) ---
    cur_main_y -= 26.6 # 15px (~11.25 pt) below bottom of desc
    c.setStrokeColor(colors.HexColor('#eaeaea'))
    c.setLineWidth(1)
    c.line(main_pad_x, cur_main_y, main_pad_x + main_content_w, cur_main_y)
    
    cur_main_y -= 17.5 # padding-top 12px + 8.5pt text
    inv_no = invoice_data.get('invoice_no', 'GST-260010')
    date_str = format_date(invoice_data.get('invoice_date', '15-07-2026'))
    
    c.setFont("Helvetica", 8.5)
    c.setFillColor(colors.HexColor('#888888'))
    c.drawString(main_pad_x, cur_main_y, "INVOICE NO: ")
    w_inv = c.stringWidth("INVOICE NO: ", "Helvetica", 8.5)
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#111111'))
    c.drawString(main_pad_x + w_inv, cur_main_y, str(inv_no))
    
    date_lbl = "DATE: "
    w_d_val = c.stringWidth(str(date_str), "Helvetica-Bold", 8.5)
    w_d_lbl = c.stringWidth(date_lbl, "Helvetica", 8.5)
    rx = main_pad_x + main_content_w - w_d_val - w_d_lbl
    c.setFont("Helvetica", 8.5)
    c.setFillColor(colors.HexColor('#888888'))
    c.drawString(rx, cur_main_y, date_lbl)
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#111111'))
    c.drawString(rx + w_d_lbl, cur_main_y, str(date_str))
    
    # --- Section 1: BANK TRANSFER DETAILS (margin-top: 22mm) ---
    cur_main_y -= mm_to_pt(22) # ~62.36 pt
    
    # .section-num watermark "01" (top: -16px (~12pt), left: -10px (~7.5pt))
    c.saveState()
    c.setFillColor(colors.HexColor('#c59b27'))
    c.setFillAlpha(0.15)
    draw_spaced_string(c, main_pad_x - 7.5, cur_main_y - 11, "01", "Helvetica-Bold", 45, spacing=-1.5)
    c.restoreState()
    
    # .section-title
    c.setFillColor(colors.HexColor('#0b1c17'))
    title_s1 = "BANK TRANSFER DETAILS"
    draw_spaced_string(c, main_pad_x, cur_main_y, title_s1, "Helvetica-Bold", 13, spacing=1)
    w_ts1 = sum(c.stringWidth(ch, "Helvetica-Bold", 13) + (1 if i < len(title_s1)-1 else 0) for i, ch in enumerate(title_s1))
    
    # border-bottom: 2px solid #c59b27, padding-bottom: 5px (~3.75pt)
    c.setStrokeColor(colors.HexColor('#c59b27'))
    c.setLineWidth(2)
    c.line(main_pad_x, cur_main_y - 3.75, main_pad_x + w_ts1, cur_main_y - 3.75)
    
    # .data-table (margin-bottom: 15px below title border)
    cur_main_y -= (3.75 + 11.25 + 12) # border pad + margin + first td pad
    
    bank_fields = [
        ("Account Holder", app_settings.get('bank_account_holder', 'MD FAIZAL')),
        ("Account Number", app_settings.get('bank_account_number', '50100673684509')),
        ("IFSC Code", app_settings.get('bank_ifsc', 'HDFC0000236')),
        ("Branch", app_settings.get('bank_branch', 'CUTTACK - ODISHA'))
    ]
    show_mmid = str(app_settings.get('bank_show_mmid', 'true')).strip().lower() in ('true', '1', 'yes')
    mmid_val = str(app_settings.get('bank_mmid', '9240072')).strip()
    if show_mmid and mmid_val:
        bank_fields.append(("MMID", mmid_val))
    
    account_type = app_settings.get('bank_account_type', 'Savings Account')
    if account_type:
        bank_fields.append(("Account Type", str(account_type)))
    
    for i, (label, val) in enumerate(bank_fields):
        c.setFont("Helvetica", 10.5)
        c.setFillColor(colors.HexColor('#777777'))
        c.drawString(main_pad_x, cur_main_y, label)
        
        c.setFont("Helvetica-Bold", 10.5)
        c.setFillColor(colors.HexColor('#111111'))
        c.drawString(main_pad_x + main_content_w * 0.42, cur_main_y, str(val))
        
        # td padding bottom 12px (~9pt) + border
        if i < len(bank_fields) - 1:
            c.setStrokeColor(colors.HexColor('#f0f0f0'))
            c.setLineWidth(1)
            c.line(main_pad_x, cur_main_y - 9, main_pad_x + main_content_w, cur_main_y - 9)
            cur_main_y -= 28.5 # 9pt bottom pad + 1px border + 9pt top pad + 10.5pt text
        else:
            cur_main_y -= 9 # last row no border
            
    # --- Section 2: CUSTOMER PORTAL (margin-top: 25mm) ---
    cur_main_y -= mm_to_pt(25)
    
    # .section-num watermark "02"
    c.saveState()
    c.setFillColor(colors.HexColor('#c59b27'))
    c.setFillAlpha(0.15)
    draw_spaced_string(c, main_pad_x - 7.5, cur_main_y - 11, "02", "Helvetica-Bold", 45, spacing=-1.5)
    c.restoreState()
    
    # .section-title
    c.setFillColor(colors.HexColor('#0b1c17'))
    title_s2 = "CUSTOMER PORTAL"
    draw_spaced_string(c, main_pad_x, cur_main_y, title_s2, "Helvetica-Bold", 13, spacing=1)
    w_ts2 = sum(c.stringWidth(ch, "Helvetica-Bold", 13) + (1 if i < len(title_s2)-1 else 0) for i, ch in enumerate(title_s2))
    
    c.setStrokeColor(colors.HexColor('#c59b27'))
    c.setLineWidth(2)
    c.line(main_pad_x, cur_main_y - 3.75, main_pad_x + w_ts2, cur_main_y - 3.75)
    
    # .portal-desc (margin-bottom: 15px from title + 10.5pt)
    cur_main_y -= (3.75 + 11.25 + 10.5)
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(colors.HexColor('#222222'))
    c.drawString(main_pad_x, cur_main_y, "24/7 Online Ledger & Portal Benefits:")
    
    # .portal-list (margin-bottom: 12px, line-height: 1.9 -> 19pt)
    cur_main_y -= (9 + 10)
    bullets = [
        "View real-time account ledger balances",
        "Download copies of previous invoices and receipts",
        "Track pending dues and payment history instantly",
        "Secure digital access powered by Utkal Chemical"
    ]
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor('#444444'))
    for b in bullets:
        c.saveState()
        c.setFillColor(colors.HexColor('#444444'))
        c.circle(main_pad_x + 5, cur_main_y + 3.5, 2, fill=1, stroke=0)
        c.restoreState()
        c.drawString(main_pad_x + 14, cur_main_y, b)
        cur_main_y -= 19
        
    # Link Box (.link-box: margin-top: 20px (~15pt), padding: 15px (~11.25pt))
    cur_main_y -= 15
    box_h = 45
    box_y = cur_main_y - box_h
    c.setFillColor(colors.HexColor('#f8faf9'))
    c.rect(main_pad_x, box_y, main_content_w, box_h, fill=1, stroke=0)
    c.setFillColor(colors.HexColor('#0b1c17'))
    c.rect(main_pad_x, box_y, 4, box_h, fill=1, stroke=0)
    
    c.setFillColor(colors.HexColor('#666666'))
    draw_spaced_string(c, main_pad_x + 14, box_y + 28, "DIRECT WEB LINK", "Helvetica-Bold", 8, spacing=1)
    
    c.setFont("Helvetica-Bold", 9.5)
    c.setFillColor(colors.HexColor('#111111'))
    c.drawString(main_pad_x + 14, box_y + 12, portal_url)

def fetch_invoice_data(db_path, invoice_no):
    """
    Connects to SQLite DB and retrieves structured invoice data.
    Supports both 'invoices' table with 'contacts' table naming convention.
    """
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Check if 'invoices' table exists (primary schema)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'")
        has_invoices_table = cursor.fetchone() is not None

        if has_invoices_table:
            # Schema with invoices table and contacts table
            invoice_query = """
                SELECT 
                    i.invoice_no, 
                    COALESCE(i.invoice_date, i.created_at) as invoice_date, 
                    i.due_date, 
                    COALESCE(i.invoice_date, i.created_at) as lr_date,

                    c.name as party_name, 
                    c.address, 
                    c.phone, 
                    c.licence_no, 
                    c.pan, 
                    c.gstin,
                    c.id as customer_id,
                    i.customer_id as i_customer_id,
                    i.total_amount, 
                    i.total_discount, 
                    (i.total_gst * 0.5) as total_sgst, 
                    (i.total_gst * 0.5) as total_cgst, 
                    i.round_off, 
                    i.grand_total,
                    i.previous_due
                FROM invoices i
                JOIN contacts c ON i.customer_id = c.id
                WHERE i.invoice_no = ? OR CAST(i.id AS TEXT) = ?
            """
            cursor.execute(invoice_query, (invoice_no, invoice_no))
        else:
            # Fallback - shouldn't be reached but kept for compatibility
            return None
        
        inv_row = cursor.fetchone()
        
        if not inv_row:
            print(f"Error: Invoice {invoice_no} not found in database.")
            sys.exit(1)

        data = dict(inv_row)

        # Fetch Line Items from invoice_items table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_items'")
        has_invoice_items_table = cursor.fetchone() is not None

        if has_invoice_items_table:
            items_query = """
                SELECT 
                    p.name, p.classification as hsn, '' as mfg, 
                    COALESCE(CAST(CAST(ii.pack_value AS REAL) AS INTEGER) || ' ' || ii.pack_type, '') as pack, 
                    ii.batch_no, ii.exp_date, ii.qty, ii.free,
                    ii.mrp, ii.rate, ii.amount, 
                    ii.discount_1_percent as dis1, ii.discount_2_percent as dis2,
                    (ii.gst_percent / 2.0) as sgst_per, ii.sgst_amount as sgst_val,
                    (ii.gst_percent / 2.0) as cgst_per, ii.cgst_amount as cgst_val,
                    ii.final_amount as final_amt,
                    0 as is_gold
                FROM invoice_items ii
                JOIN products p ON ii.product_id = p.id
                WHERE ii.invoice_id = (SELECT id FROM invoices WHERE invoice_no = ? OR CAST(id AS TEXT) = ?)
            """
            cursor.execute(items_query, (invoice_no, invoice_no))
        else:
            # Fallback - no items
            items = []
            cursor.execute("SELECT COUNT(*) FROM invoice_items")
        
        if has_invoice_items_table:
            items = [dict(row) for row in cursor.fetchall()]
        else:
            items = []
        
        data['products'] = items
        
        # Query app_settings table for billing / duplex / bank settings
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'")
            if cursor.fetchone():
                cursor.execute("SELECT setting_key, setting_value FROM app_settings")
                app_settings = dict(cursor.fetchall())
            else:
                app_settings = {}
        except Exception:
            app_settings = {}
            
        defaults = {
            'invoice_duplex_print': 'true',
            'payment_qr_image': '',
            'payment_upi_id': '7749089400@hdfc',
            'bank_account_holder': 'MD  FAIZAL',
            'bank_account_number': '50100673684509',
            'bank_ifsc': 'HDFC0000236',
            'bank_branch': 'CUTTACK - ODISHA',
            'bank_mmid': '9240072',
            'bank_show_mmid': 'true',
            'bank_account_type': 'Savings Account',
            'portal_base_url': 'https://mac.faizal.uk'
        }
        for k, v in defaults.items():
            if k not in app_settings or app_settings[k] == '':
                app_settings[k] = v
                
        data['app_settings'] = app_settings
        
        conn.close()
        return data

    except sqlite3.Error as e:
        print(f"Database Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate PDF Invoice from SQLite DB")
    parser.add_argument("--db", required=True, help="Path to SQLite database file")
    parser.add_argument("--invoice", required=True, help="Invoice Number to generate")
    parser.add_argument("--out", required=True, help="Output PDF file path")
    parser.add_argument("--duplex", default=None, help="Override duplex printing (true/false)")
    parser.add_argument("--mode", default="print", help="Mode: print or export")
    
    args = parser.parse_args()
 
    # Fetch Data
    invoice_data = fetch_invoice_data(args.db, args.invoice)
    if invoice_data is None:
        invoice_data = {}
    if args.duplex is not None:
        invoice_data['duplex_print'] = args.duplex.lower() in ('true', '1', 'yes')
    invoice_data['export_mode'] = args.mode.lower() == 'export'
    
    # Generate PDF
    try:
        export_invoice_pdf(invoice_data, args.out)
        print(f"Success: PDF generated at {args.out}")
    except Exception as e:
        print(f"Error generating PDF: {e}")
        sys.exit(1)
