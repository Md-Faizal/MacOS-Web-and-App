#!/usr/bin/env python3
"""
Convert PDF to JPG image using PyMuPDF
Usage: python pdf-to-jpg.py --pdf <pdf_path> --out <jpg_path> [--quality <1-100>] [--dpi <dpi>]
"""

import sys
import argparse

def convert_pdf_to_jpg(pdf_path, output_path, quality=90, dpi=150):
    """Convert PDF to JPG image using PyMuPDF (fitz)"""
    try:
        import fitz  # PyMuPDF
        
        print(f"Converting {pdf_path} to JPG (DPI: {dpi})...", file=sys.stderr)
        
        # Open PDF document
        pdf_document = fitz.open(pdf_path)
        
        if pdf_document.page_count == 0:
            print(f"Error: PDF has no pages", file=sys.stderr)
            return False
        
        # Get first page
        page = pdf_document[0]
        
        # Convert page to image with specified DPI
        # DPI scaling factor: default is 72 DPI
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        # Save as JPEG with quality
        pix.save(output_path, "jpeg")
        
        pdf_document.close()
        
        print(f"✓ Converted {pdf_path} to {output_path} (Quality: {quality}%)", file=sys.stderr)
        return True
        
    except ImportError as e:
        print(f"Error: PyMuPDF not installed - {str(e)}", file=sys.stderr)
        print("Install with: pip install PyMuPDF", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return False

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert PDF to JPG')
    parser.add_argument('--pdf', required=True, help='Path to PDF file')
    parser.add_argument('--out', required=True, help='Output JPG path')
    parser.add_argument('--quality', type=int, default=90, help='JPEG quality (1-100)')
    parser.add_argument('--dpi', type=int, default=150, help='DPI for conversion')
    
    args = parser.parse_args()
    success = convert_pdf_to_jpg(args.pdf, args.out, args.quality, args.dpi)
    sys.exit(0 if success else 1)
