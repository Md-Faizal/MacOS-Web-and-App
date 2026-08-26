#!/usr/bin/env python3
"""
Payment, Credit Note & Opening Balance PDF Generator
Generates professional payment receipts, credit notes, and opening balance vouchers in portrait A4 format
Usage: python payment-credit-note-generator.py --db <db_path> --payment <payment_id> --out <output_path>
       python payment-credit-note-generator.py --db <db_path> --opening-balance <customer_name> --out <output_path>
"""

import sys
import sqlite3
import argparse
import re
from datetime import datetime
from reportlab.lib.pagesizes import A4, portrait
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics


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


def export_payment_pdf(payment_data, output_path):
    """
    Generates the PDF for payment receipt or credit note.
    This function is purely for rendering and contains NO database logic.
    """
    width, height = portrait(A4)
    left_margin = mm_to_pt(15)
    right_margin = mm_to_pt(15)
    top_margin = mm_to_pt(15)
    bottom_margin = mm_to_pt(15)
    page_width = width - left_margin - right_margin

    c = canvas.Canvas(output_path, pagesize=portrait(A4))

    # --- Outer Border ---
    c.setStrokeColor(colors.black)
    c.setLineWidth(1.5)
    c.rect(left_margin, bottom_margin, page_width, height - mm_to_pt(30), stroke=1, fill=0)

    # --- Header Section ---
    header_y = height - top_margin

    # Company Name
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor('#1a237e'))
    c.drawCentredString(width / 2, header_y - mm_to_pt(8), "UTKAL CHEMICAL AUSHADHALAYA")

    # Company Details
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.black)
    c.drawCentredString(width / 2, header_y - mm_to_pt(13), "FACT ADD::Binaba Marg, Aska, Ganjam, Pin.761110")
    c.drawCentredString(width / 2, header_y - mm_to_pt(16), "COMP ADD::D1, Basera Comple,Dumduma,BBSR, PIN CODE::751019")
    c.drawCentredString(width / 2, header_y - mm_to_pt(19), "Phone: 06822273304 / 943933330")

    # Document Type & Number
    if payment_data.get('is_opening_balance'):
        doc_type = "OPENING BALANCE VOUCHER"
    elif payment_data.get('is_credit_note'):
        doc_type = "CREDIT NOTE"
    else:
        doc_type = "PAYMENT RECEIPT"
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(colors.HexColor('#1a237e'))
    c.drawCentredString(width / 2, header_y - mm_to_pt(26), doc_type)

    # Horizontal Line
    c.line(left_margin, header_y - mm_to_pt(28), width - right_margin, header_y - mm_to_pt(28))

    # --- Customer & Payment Details Grid ---
    detail_y = header_y - mm_to_pt(35)
    col1_x = left_margin + mm_to_pt(3)
    col2_x = left_margin + page_width / 2 + mm_to_pt(3)
    line_height = mm_to_pt(6)

    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(colors.black)

    # Left Column
    c.drawString(col1_x, detail_y, "Customer Name:")
    c.setFont("Helvetica", 9)
    c.drawString(col1_x + mm_to_pt(40), detail_y, payment_data.get('customer_name', 'N/A'))

    detail_y -= line_height
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col1_x, detail_y, "Reference No.:")
    c.setFont("Helvetica", 9)
    ref_no = payment_data.get('reference_number', payment_data.get('payment_id', 'N/A'))
    c.drawString(col1_x + mm_to_pt(40), detail_y, str(ref_no))

    detail_y -= line_height
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col1_x, detail_y, "Date:")
    c.setFont("Helvetica", 9)
    payment_date = payment_data.get('created_at', datetime.now().isoformat())[:10]
    c.drawString(col1_x + mm_to_pt(40), detail_y, payment_date)

    # Right Column
    right_detail_y = header_y - mm_to_pt(35)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col2_x, right_detail_y, "Payment Method:")
    c.setFont("Helvetica", 9)
    method = payment_data.get('payment_method', payment_data.get('payment_medium', 'Cash'))
    c.drawString(col2_x + mm_to_pt(40), right_detail_y, str(method))

    right_detail_y -= line_height
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col2_x, right_detail_y, "Status:")
    c.setFont("Helvetica", 9)
    if payment_data.get('is_opening_balance'):
        status = "Carryover"
    elif payment_data.get('is_credit_note'):
        status = "Credit"
    else:
        status = "Completed"
    c.drawString(col2_x + mm_to_pt(40), right_detail_y, status)

    right_detail_y -= line_height
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col2_x, right_detail_y, "Notes:")
    c.setFont("Helvetica", 9)
    notes = payment_data.get('notes', payment_data.get('reason', ''))
    c.drawString(col2_x + mm_to_pt(40), right_detail_y, str(notes)[:40])

    # --- Horizontal Line ---
    table_top_y = detail_y - mm_to_pt(10)
    c.line(left_margin, table_top_y, width - right_margin, table_top_y)

    # --- Amount Section ---
    amount_section_y = table_top_y - mm_to_pt(25)
    
    c.setFont("Helvetica-Bold", 10)
    c.drawString(col1_x, amount_section_y, "Amount:")
    
    amount = float(payment_data.get('amount', payment_data.get('credit_amount', 0)))
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.HexColor('#1a237e'))
    c.drawString(col1_x + mm_to_pt(35), amount_section_y, f"Rs. {amount:,.2f}")
    c.setFillColor(colors.black)

    # Amount in Words
    amount_words_y = amount_section_y - mm_to_pt(8)
    c.setFont("Helvetica", 8)
    c.drawString(col1_x, amount_words_y, "Amount in Words:")
    
    words = amount_in_words(amount)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(col1_x + mm_to_pt(40), amount_words_y, words)

    # --- Transaction Details (if applicable) ---
    trans_detail_y = amount_words_y - mm_to_pt(15)
    
    # Skip transaction details section - not available in payments table
    desc_top_y = trans_detail_y - mm_to_pt(5)
    if payment_data.get('is_opening_balance'):
        description = "This represents the opening balance carried forward from the previous system."
    elif payment_data.get('is_credit_note'):
        description = "This Credit Note represents a credit adjustment to the customer account."
    else:
        description = f"Payment of Rs.{amount:,.2f} has been received and recorded in the system."
    
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col1_x, desc_top_y, "Description:")
    
    desc_y = desc_top_y - mm_to_pt(5)
    c.setFont("Helvetica", 8)
    c.drawString(col1_x, desc_y, description)

    # --- Signature Section ---
    sig_y = bottom_margin + mm_to_pt(20)
    c.line(left_margin + mm_to_pt(10), sig_y, width/2 - mm_to_pt(10), sig_y)
    c.line(width/2 + mm_to_pt(10), sig_y, width - right_margin - mm_to_pt(10), sig_y)
    
    c.setFont("Helvetica", 8)
    c.drawString(left_margin + mm_to_pt(10), sig_y - mm_to_pt(4), "Authorized Signatory")
    c.drawRightString(width - right_margin - mm_to_pt(10), sig_y - mm_to_pt(4), "For UTKAL CHEMICAL AUSHADHALAYA")

    # --- Footer ---
    c.setFont("Helvetica", 7)
    c.setFillColor(colors.HexColor('#666666'))
    footer_text = "This is a computer-generated document. No signature or stamp is required."
    c.drawCentredString(width / 2, bottom_margin + mm_to_pt(3), footer_text)
    
    software_text = "MARG ERP - Contact: 9437026823, 7978789800"
    c.drawCentredString(width / 2, bottom_margin + mm_to_pt(0.5), software_text)

    c.save()


def fetch_payment_data(db_path, payment_id):
    """
    Connects to SQLite DB and retrieves payment data from the payments table.
    """
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Fetch from payments table with customer details
        # Columns: id, customer_id, type, amount, credit_amount, payment_medium, reference_number, payment_date, reason, notes, created_at, updated_at
        query = """
            SELECT 
                p.id as payment_id,
                p.reference_number,
                p.amount,
                p.credit_amount,
                p.payment_medium,
                p.notes,
                p.reason,
                p.created_at,
                p.type,
                c.name as customer_name
            FROM payments p
            LEFT JOIN contacts c ON p.customer_id = c.id
            WHERE p.id = ? OR CAST(p.id AS TEXT) = ?
        """
        cursor.execute(query, (payment_id, payment_id))
        payment_row = cursor.fetchone()
        
        if payment_row:
            data = dict(payment_row)
            # Determine if it's a credit note
            data['is_credit_note'] = data.get('type') == 'CREDIT_NOTE'
            # Use appropriate amount field
            if data['is_credit_note']:
                data['amount'] = data.get('credit_amount', 0)
            else:
                data['amount'] = data.get('amount', 0)
            # Use notes or reason
            if not data.get('notes'):
                data['notes'] = data.get('reason', '')
            # Map payment_medium to payment_method for display
            data['payment_method'] = data.get('payment_medium', 'Cash')
            conn.close()
            return data

        print(f"Error: Payment {payment_id} not found in database.")
        conn.close()
        return None

    except sqlite3.Error as e:
        print(f"Database Error: {e}")
        sys.exit(1)


def fetch_opening_balance_data(db_path, customer_name):
    """
    Fetches opening balance data for a customer from the contacts table.
    """
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Fetch from contacts table
        query = """
            SELECT 
                id as customer_id,
                name as customer_name,
                opening_balance
            FROM contacts
            WHERE name = ?
        """
        cursor.execute(query, (customer_name,))
        contact_row = cursor.fetchone()
        
        if contact_row:
            data = dict(contact_row)
            data['is_opening_balance'] = True
            data['is_credit_note'] = False
            data['amount'] = data.get('opening_balance', 0)
            data['reference_number'] = 'OPENING-BALANCE'
            data['payment_method'] = 'Initial Balance'
            data['notes'] = 'Carryover balance from previous ERP system'
            data['reason'] = 'Opening Balance'
            data['type'] = 'OPENING_BALANCE'
            data['created_at'] = datetime.now().isoformat()
            conn.close()
            return data

        print(f"Error: Customer '{customer_name}' not found in database.")
        conn.close()
        return None

    except sqlite3.Error as e:
        print(f"Database Error: {e}")
        sys.exit(1)





if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate PDF Payment Receipt, Credit Note, or Opening Balance Voucher")
    parser.add_argument("--db", required=True, help="Path to SQLite database file")
    parser.add_argument("--payment", help="Payment ID to generate PDF for")
    parser.add_argument("--opening-balance", help="Customer name to generate opening balance voucher for")
    parser.add_argument("--out", required=True, help="Output PDF file path")
    
    args = parser.parse_args()

    # Determine which type of document to generate
    if args.payment:
        # Fetch Payment Data
        payment_data = fetch_payment_data(args.db, args.payment)
        
        if not payment_data:
            sys.exit(1)
        
        # Generate PDF
        try:
            export_payment_pdf(payment_data, args.out)
            print(f"Success: PDF generated at {args.out}")
        except Exception as e:
            print(f"Error generating PDF: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
    
    elif args.opening_balance:
        # Fetch Opening Balance Data
        opening_balance_data = fetch_opening_balance_data(args.db, args.opening_balance)
        
        if not opening_balance_data:
            sys.exit(1)
        
        # Generate PDF
        try:
            export_payment_pdf(opening_balance_data, args.out)
            print(f"Success: Opening Balance Voucher generated at {args.out}")
        except Exception as e:
            print(f"Error generating PDF: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
    
    else:
        parser.error("Either --payment or --opening-balance must be specified")
