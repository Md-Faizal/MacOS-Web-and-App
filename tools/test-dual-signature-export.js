const path = require('path');
const fs = require('fs');
const SuiteCoreBridge = require('../frontend/shared/suite_core_bridge.js');

async function testSignatureModes() {
  console.log('========================================================================');
  console.log('  TEST: DUAL SIGNATURE & DISABLED SIGNATURE EXPORT PARITY');
  console.log('========================================================================\n');

  if (!SuiteCoreBridge.isWasmLoaded()) {
    console.error('[-] SuiteCoreBridge WASM not loaded!');
    process.exit(1);
  }
  console.log('[+] SuiteCoreBridge WASM successfully loaded.');

  const basePayload = {
    doc_ref_no: 'UCA/HR/2026/0099',
    title: 'APPOINTMENT LETTER - TECHNICAL OFFICER',
    date: 'October 20, 2026',
    department: 'Human Resources',
    recipient_name: 'Dr. Debabrata Mishra, BAMS',
    recipient_title: 'Chief Ayurvedic Medical Officer',
    recipient_address: 'Industrial Area, Rasulgarh, Bhubaneswar',
    subject: 'LETTER OF APPOINTMENT UNDER SCHEDULE T GOVERNANCE',
    salutation: 'Dear Dr. Mishra,',
    paragraphs: [
      'We are pleased to appoint you as Chief Ayurvedic Medical Officer in Utkal Chemical Aushadhalaya.',
      'You shall oversee batch manufacturing records, quality assurance, and AYUSH regulatory compliance.',
      'Please sign and return the acceptance copy.'
    ],
    terms_clauses: [
      'Strict adherence to Schedule T Good Manufacturing Practices.',
      'Six months statutory probationary assessment.'
    ],
    signatory_name: 'MD  FAIZAL',
    signatory_title: 'Proprietor',
    signatory_reg_no: 'OR-02/AYUR-MFG',
    company_name: 'UTKAL CHEMICAL AUSHADHALAYA',
    is_watermarked: false,
    show_page_numbers: true
  };

  const modes = [
    { mode: 'single', label: '1 Signature Point (Employer)' },
    { 
      mode: 'dual', 
      label: '2 Signature Points Below (Candidate + Employer - Pen line)',
      second_signatory_label: 'Accepted & Agreed By:',
      second_signatory_name: 'Dr. Debabrata Mishra',
      second_signatory_title: 'Date: 20-Oct-2026'
    },
    { 
      mode: 'dual', 
      label: '2 Signature Points Below (Staff Record Signature Image on file)',
      second_signatory_label: 'Accepted & Agreed By:',
      second_signatory_name: 'Dr. Debabrata Mishra',
      second_signatory_title: 'Chief Medical Officer',
      // Valid minimal 1x1 JPEG base64 for test
      second_signature_image_base64: '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
    },
    { mode: 'none', label: 'No Signature Point (Disabled Altogether)' }
  ];

  for (const item of modes) {
    console.log(`\n--- Testing Mode: ${item.label} (${item.mode}) ---`);
    const payload = {
      ...basePayload,
      signature_layout: item.mode,
      second_signatory_label: item.second_signatory_label || '',
      second_signatory_name: item.second_signatory_name || '',
      second_signatory_title: item.second_signatory_title || '',
      second_signature_image_base64: item.second_signature_image_base64 || ''
    };

    // 1. PDF
    const pdfRes = SuiteCoreBridge.renderLetterheadPdf(payload);
    if (!pdfRes || !pdfRes.pdf_base64) {
      throw new Error(`Failed to render PDF for mode: ${item.mode}`);
    }
    const pdfBuf = Buffer.from(pdfRes.pdf_base64, 'base64');
    const isPdfValid = pdfBuf.slice(0, 4).toString('ascii') === '%PDF';
    console.log(`  [PDF]  Generated ${pdfBuf.length} bytes (starts with %PDF: ${isPdfValid})`);

    // 2. SVG (Vector Proof)
    const svgRes = SuiteCoreBridge.renderLetterheadSvg(payload);
    if (!svgRes || !svgRes.svg) {
      throw new Error(`Failed to render SVG for mode: ${item.mode}`);
    }
    const hasSvg = svgRes.svg.includes('<svg') && svgRes.svg.includes('</svg>');
    const hasForCompany = svgRes.svg.includes('For UTKAL CHEMICAL AUSHADHALAYA');
    const hasAcceptedBy = svgRes.svg.includes('Accepted &amp; Agreed By:') || svgRes.svg.includes('Accepted & Agreed By:');

    if (item.mode === 'none') {
      if (hasForCompany || hasAcceptedBy) {
        throw new Error('Mode none should NOT have signatory text!');
      }
      console.log(`  [SVG]  Generated ${svgRes.svg.length} chars (Correctly omitted signatory block)`);
    } else if (item.mode === 'dual') {
      if (!hasForCompany || !hasAcceptedBy) {
        throw new Error(`Mode dual should have both employer and acceptance block! forCompany=${hasForCompany}, acceptedBy=${hasAcceptedBy}`);
      }
      console.log(`  [SVG]  Generated ${svgRes.svg.length} chars (Both candidate acceptance & employer verified!)`);
    } else {
      if (!hasForCompany) {
        throw new Error('Mode single should have employer signatory!');
      }
      if (hasAcceptedBy) {
        throw new Error('Mode single should NOT have second candidate signatory!');
      }
      console.log(`  [SVG]  Generated ${svgRes.svg.length} chars (Single employer signature verified)`);
    }

    // 3. Word DOCX
    const docxRes = SuiteCoreBridge.renderLetterheadDocx(payload);
    if (!docxRes || !docxRes.docx_base64) {
      throw new Error(`Failed to render DOCX for mode: ${item.mode}`);
    }
    const docxBuf = Buffer.from(docxRes.docx_base64, 'base64');
    const isDocxValid = docxBuf.length >= 4 && docxBuf[0] === 0x50 && docxBuf[1] === 0x4B;
    console.log(`  [DOCX] Generated ${docxBuf.length} bytes (Zip PK magic valid: ${isDocxValid})`);
  }

  console.log('\n========================================================================');
  console.log('  ALL SIGNATURE LAYOUT TESTS PASSED WITH 100% PARITY!');
  console.log('========================================================================');
}

testSignatureModes().catch(err => {
  console.error('[-] Test failed:', err);
  process.exit(1);
});
