const path = require('path');
const fs = require('fs');

async function run() {
  console.log('--- Testing Payment Voucher Rust WASM & Due Bills / Payment QR ---');

  const SuiteCoreBridge = require(path.resolve(__dirname, '../../frontend/shared/suite_core_bridge.js'));
  if (!SuiteCoreBridge.isWasmLoaded()) {
    throw new Error('Failed to load suite_core.wasm');
  }
  console.log('✓ suite_core.wasm loaded successfully');

  // Test 1: Payment Receipt with Dues, Due Bills, and Export Mode (⚡ PAY VIA UPI APP)
  const testDataWithDues = {
    voucher_type: 'payment_receipt',
    reference_number: 'PAY-2026-0042',
    payment_date: '2026-10-07',
    customer_name: 'Mahaveer Medical Store',
    customer_gstin: '21AABCM1234D1Z2',
    customer_licence_no: '20B-1122, 21B-3344',
    customer_pan: 'AABCM1234D',
    customer_phone: '9437112233',
    customer_address: 'Main Market, Cuttack',
    amount: 5000.0,
    payment_method: 'UPI',
    // Long allocation string - previously truncated to 25 chars
    linked_invoice_no: 'GST-2026-00042',
    linked_invoice_amount: 5000.0,
    current_outstanding_due: 3450.0,
    account_status: 'DUE',
    aging_days: 18,
    due_percentage: 40.8,
    settlement_percentage: 59.2,
    total_billed_amount: 8450.0,
    total_settled_amount: 5000.0,
    overdue_since_date: '2026-09-10',
    export_mode: true,
    due_bills: [
      {
        invoice_no: 'GST-2026-00039',
        date: '2026-09-10',
        amount: 2500.0,
        due_amount: 1450.0,
        status: 'PARTIAL',
        days_overdue: 27
      },
      {
        invoice_no: 'GST-2026-00040',
        date: '2026-09-22',
        amount: 2000.0,
        due_amount: 2000.0,
        status: 'UNPAID',
        days_overdue: 15
      }
    ],
    remarks: 'Settlement towards pending bills',
    customer_ledger_token: 'test_ledger_token_xyz',
    customer_id: 15,
    app_settings: {
      company_name: 'UTKAL CHEMICAL AUSHADHALAYA',
      company_gstin: '21AIDPF4446J1ZL',
      company_pan: 'AIDPF4446J',
      payment_upi_id: '7749089400@hdfc',
      portal_base_url: 'https://mac.faizal.uk',
      invoice_auto_sign_disclaimer: 'true'
    }
  };

  const res = SuiteCoreBridge.renderPaymentPdf(testDataWithDues);
  if (!res || !res.success || !res.pdf_base64) {
    throw new Error('renderPaymentPdf failed: ' + (res ? res.error : 'unknown'));
  }
  console.log(`✓ PDF Generated successfully (${res.byte_count} bytes)`);

  const pdfStr = Buffer.from(res.pdf_base64, 'base64').toString('utf8');

  // Verify Allocation is NOT truncated
  if (!pdfStr.includes('Bill #GST-2026-00042 \\(Rs. 5,000.00\\)')) {
    throw new Error('FAILED: Allocation was truncated! Expected "Bill #GST-2026-00042 \\(Rs. 5,000.00\\)"');
  }
  console.log('✓ Allocation text is untruncated: Bill #GST-2026-00042 (Rs. 5,000.00)');

  // Verify Balance Due is rendered with actual overdue date value
  if (!pdfStr.includes('Rs. 3,450.00 \\(DUE • SINCE 10-09-2026\\)')) {
    throw new Error('FAILED: Balance Due formatting incorrect');
  }
  console.log('✓ Balance due text is colored & formatted with actual overdue date: Rs. 3,450.00 (DUE • SINCE 10-09-2026)');

  // Verify Amount Settlement Progress Bar shows active cycle gamification amounts
  if (!pdfStr.includes('ACTIVE DUES SETTLEMENT: Rs. 5,000.00 OF Rs. 8,450.00 \\(Rs. 3,450.00 REMAINING\\)')) {
    throw new Error('FAILED: Settlement progress bar missing or incorrect');
  }
  console.log('✓ Amount Settlement progress bar rendered active cycle gamification: ACTIVE DUES SETTLEMENT: Rs. 5,000.00 OF Rs. 8,450.00 (Rs. 3,450.00 REMAINING)');

  // Verify Courteous Customer Appreciation Note
  if (!pdfStr.includes('Thank you for your prompt payment! We look forward to serving you again.')) {
    throw new Error('FAILED: Customer thank you note missing');
  }
  console.log('✓ Customer appreciation note rendered: "Thank you for your prompt payment! We look forward to serving you again."');

  // Verify Untruncated Ledger Link
  if (!pdfStr.includes('https://mac.faizal.uk/ledger/test_ledger_token_xyz')) {
    throw new Error('FAILED: Ledger link was truncated!');
  }
  console.log('✓ Ledger link is untruncated: https://mac.faizal.uk/ledger/test_ledger_token_xyz');

  // Verify Pending Invoices Card with AGING days
  if (!pdfStr.includes('PENDING INVOICES & OUTSTANDING DUES BREAKDOWN')) {
    throw new Error('FAILED: Pending Invoices card header missing');
  }
  if (!pdfStr.includes('GST-2026-00039') || !pdfStr.includes('GST-2026-00040')) {
    throw new Error('FAILED: Due bills missing from table');
  }
  if (!pdfStr.includes('TOTAL DUE: Rs. 3,450.00')) {
    throw new Error('FAILED: Total due summary missing');
  }
  if (!pdfStr.includes('AGING') || !pdfStr.includes('27 DAYS') || !pdfStr.includes('15 DAYS')) {
    throw new Error('FAILED: AGING days passed missing from pending invoices table');
  }
  console.log('✓ Pending Invoices table rendered with AGING days (27 DAYS, 15 DAYS) and due amounts');

  // Verify Dual QR Section
  if (!pdfStr.includes('ONLINE CUSTOMER LEDGER')) {
    throw new Error('FAILED: Online Customer Ledger card missing');
  }
  if (!pdfStr.includes('QUICK SETTLEMENT \\(UPI\\)')) {
    throw new Error('FAILED: Quick Settlement (UPI) card missing');
  }
  if (!pdfStr.includes('Pay Due: Rs. 3,450.00')) {
    throw new Error('FAILED: Pay Due amount missing beside UPI QR');
  }
  if (!pdfStr.includes('⚡ PAY VIA UPI APP')) {
    throw new Error('FAILED: Interactive ⚡ PAY VIA UPI APP button missing in export mode');
  }
  console.log('✓ Dual QR rendered: Ledger Portal QR + Quick Pay UPI QR with ⚡ PAY VIA UPI APP button');

  // Test 2: Print Mode (without export mode)
  testDataWithDues.export_mode = false;
  const resPrint = SuiteCoreBridge.renderPaymentPdf(testDataWithDues);
  const pdfPrintStr = Buffer.from(resPrint.pdf_base64, 'base64').toString('utf8');
  if (!pdfPrintStr.includes('Scan with GPay / PhonePe / Paytm')) {
    throw new Error('FAILED: Print mode scan instruction missing');
  }
  if (pdfPrintStr.includes('⚡ PAY VIA UPI APP')) {
    throw new Error('FAILED: Interactive app button should NOT be shown in print mode');
  }
  console.log('✓ Print mode correctly renders scan instructions without interactive button');

  // Test 3: Settled Account (no dues)
  const settledData = { ...testDataWithDues, current_outstanding_due: 0.0, account_status: 'SETTLED', due_bills: [] };
  const resSettled = SuiteCoreBridge.renderPaymentPdf(settledData);
  const pdfSettledStr = Buffer.from(resSettled.pdf_base64, 'base64').toString('utf8');
  if (pdfSettledStr.includes('PENDING INVOICES & OUTSTANDING DUES BREAKDOWN')) {
    throw new Error('FAILED: Settled account should not render pending dues breakdown');
  }
  if (!pdfSettledStr.includes('REAL-TIME CUSTOMER LEDGER PORTAL')) {
    throw new Error('FAILED: Settled account should render clean single ledger portal QR');
  }
  console.log('✓ Settled account renders clean single Ledger portal card without dues breakdown');

  // Test 4: Invoice Toggle: Classic Authority Signature & No Payment QR
  const testInvoiceClassic = {
    invoice_no: 'GST-2026-0099',
    invoice_date: '2026-10-07',
    party_name: 'Mahaveer Medical Store',
    address: 'Main Market, Cuttack',
    phone: '9437112233',
    licence_no: '20B-1122',
    pan: 'AABCM1234D',
    gstin: '21AABCM1234D1Z2',
    total_amount: 3000.0,
    total_discount: 0.0,
    total_sgst: 180.0,
    total_cgst: 180.0,
    round_off: 0.0,
    grand_total: 3360.0,
    previous_due: 4200.0,
    products: [{
      name: 'CALPOL 650MG',
      pack: '15T',
      hsn: '30049011',
      mfg: 'GSK',
      batch_no: 'B22',
      exp_date: '12/28',
      qty: 10,
      free: 0,
      rate: 300.0,
      mrp: 350.0,
      dis1: 0.0,
      dis2: 0.0,
      sgst_per: 6.0,
      sgst_val: 18.0,
      cgst_per: 6.0,
      cgst_val: 18.0,
      amount: 3000.0,
      final_amt: 3360.0,
      is_gold: false
    }],
    duplex_print: false,
    export_mode: false,
    app_settings: {
      invoice_authority_sign_no_qr: 'true',
      company_name: 'UTKAL CHEMICAL AUSHADHALAYA'
    }
  };
  const invRes = SuiteCoreBridge.renderInvoicePdf(testInvoiceClassic);
  const invPdfStr = Buffer.from(invRes.pdf_base64, 'base64').toString('utf8');
  if (!invPdfStr.includes('Authorised Signatory')) {
    throw new Error('FAILED: Invoice classic mode missing Authorised Signatory');
  }
  if (invPdfStr.includes('OUTSTANDING DUES & QUICK PAY')) {
    throw new Error('FAILED: Invoice classic mode should NOT show payment QR/dues widget');
  }
  console.log('✓ Invoice classic mode toggle correctly renders Authorised Signatory without payment QR');

  console.log('\nALL PAYMENT & INVOICE PARITY CHECKS PASSED PERFECTLY!');
}

run().catch(err => {
  console.error('Test Failed:', err.message);
  process.exit(1);
});
