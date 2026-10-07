const BillCalculator = require('../../../../frontend/shared/bill-calculator');
const calculator = require('../../../core/billing/calculator');
const billingDepartment = require('../service');
const { getOrCreateCustomerLedgerToken, generateLedgerToken } = require('../../../core/billing/ledger-token');
const { encryptInvoiceLedgerReference } = require('../../../core/billing/invoice-ledger-ref');
const dataBus = require('../../../core/sync/data-bus');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Detect whether this system uses 'python3' or 'python'
// Ubuntu/Linux uses python3; Windows uses python
function getPythonCmd() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  if (process.env.PYTHON_CMD) return process.env.PYTHON_CMD;
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    return 'python3';
  } catch {
    return 'python';
  }
}
const PYTHON_CMD = getPythonCmd();

// Helper to format date as "dd-mm-yyyy"
function formatDateStr(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// Helper to get temp directory
function getTempDir() {
  const tempDir = path.join(os.tmpdir(), 'macos-invoices');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

// Helper to get correct database path for dev and production
function getDatabasePath() {
  const candidates = [
    process.env.DB_PATH,
    path.join(__dirname, '../../../../database/MacOS.db'),
    path.join(process.cwd(), 'database/MacOS.db'),
    '/app/database/MacOS.db'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(__dirname, '../../../../database/MacOS.db');
}

// Helper to get correct tools/python path for dev and production
function getScriptsPath(scriptName) {
  const candidates = [
    process.env.TOOLS_PYTHON_DIR ? path.join(process.env.TOOLS_PYTHON_DIR, scriptName) : null,
    path.join(__dirname, '../../../../tools/python', scriptName),
    path.join(process.cwd(), 'tools/python', scriptName),
    path.join('/app/tools/python', scriptName)
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(__dirname, '../../../../tools/python', scriptName);
}

// Generate QR-complete invoice PDFs using native Rust SuiteCore WebAssembly engine.
function generateInvoicePDF(dbPath, invoiceNo, duplex = null, mode = "print") {
  try {
    if (!fs.existsSync(dbPath)) throw new Error(`Database not found at: ${dbPath}`);
    const tempDir = getTempDir();
    const pdfPath = path.join(tempDir, `invoice-${invoiceNo}-${Date.now()}.pdf`);

    const SuiteCoreBridge = require(path.resolve(__dirname, '../../../../frontend/shared/suite_core_bridge.js'));
    if (!SuiteCoreBridge || !SuiteCoreBridge.isWasmLoaded()) {
      throw new Error('[Billing] WebAssembly core (suite_core.wasm) not loaded for invoice generation.');
    }

    const Database = require('better-sqlite3');
    const invoiceDb = new Database(dbPath);

    let renderData;
    try {
      const invRow = invoiceDb.prepare(`
        SELECT 
          i.id,
          i.invoice_no, 
          COALESCE(i.invoice_date, i.created_at) as invoice_date, 
          i.due_date, 
          '' as lr_no,
          COALESCE(i.invoice_date, i.created_at) as lr_date,
          c.name as party_name, 
          COALESCE(c.address, '') as address, 
          COALESCE(c.phone, '') as phone, 
          COALESCE(c.licence_no, '') as licence_no, 
          COALESCE(c.pan, '') as pan, 
          COALESCE(c.gstin, '') as gstin,
          c.id as customer_id,
          c.ledger_token as customer_ledger_token,
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
        WHERE i.invoice_no = ? OR i.id = ? OR CAST(i.id AS TEXT) = ?
      `).get(String(invoiceNo), Number(invoiceNo) || 0, String(invoiceNo));

      if (!invRow) throw new Error(`Invoice not found: ${invoiceNo}`);

      const ledgerToken = getOrCreateCustomerLedgerToken(invoiceDb, invRow.customer_id);
      if (!ledgerToken) throw new Error('Unable to create a customer ledger access token for this invoice.');
      const invoiceLedgerRef = encryptInvoiceLedgerReference(invRow.customer_id, invRow.id);

      const items = invoiceDb.prepare(`
        SELECT 
          p.name, 
          COALESCE(p.classification, '30049011') as hsn, 
          '' as mfg, 
          COALESCE(CAST(CAST(ii.pack_value AS REAL) AS INTEGER) || ' ' || ii.pack_type, '') as pack, 
          ii.batch_no, 
          ii.exp_date, 
          ii.qty, 
          ii.free,
          ii.mrp, 
          ii.rate, 
          ii.amount, 
          ii.discount_1_percent as dis1, 
          ii.discount_2_percent as dis2,
          (ii.gst_percent / 2.0) as sgst_per, 
          ii.sgst_amount as sgst_val,
          (ii.gst_percent / 2.0) as cgst_per, 
          ii.cgst_amount as cgst_val,
          ii.final_amount as final_amt,
          0 as is_gold
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
        ORDER BY ii.id ASC
      `).all(invRow.id);

      const app_settings = {};
      try {
        const rows = invoiceDb.prepare('SELECT setting_key, setting_value FROM app_settings').all();
        for (const r of rows) {
          if (r.setting_key) app_settings[r.setting_key] = String(r.setting_value ?? '');
        }
      } catch (e) {
        // app_settings optional fallback
      }

      let duplexPrint = true;
      if (duplex !== null && duplex !== undefined && duplex !== '') {
        duplexPrint = String(duplex).toLowerCase() === 'true' || String(duplex).toLowerCase() === '1' || String(duplex).toLowerCase() === 'yes';
      } else if (app_settings['invoice_duplex_print'] !== undefined) {
        duplexPrint = String(app_settings['invoice_duplex_print']).toLowerCase() === 'true' || String(app_settings['invoice_duplex_print']).toLowerCase() === '1' || String(app_settings['invoice_duplex_print']).toLowerCase() === 'yes';
      }

      const exportMode = String(mode).toLowerCase() === 'export';

      renderData = {
        ...invRow,
        products: items || [],
        duplex_print: duplexPrint,
        export_mode: exportMode,
        app_settings,
        customer_ledger_token: ledgerToken,
        invoice_ledger_ref: invoiceLedgerRef,
      };
    } finally {
      invoiceDb.close();
    }

    const res = SuiteCoreBridge.renderInvoicePdf(renderData);
    if (!res || !res.success || !res.pdf_base64) {
      throw new Error(`Rust invoice rendering failed: ${res ? res.error : 'Unknown error'}`);
    }

    fs.writeFileSync(pdfPath, Buffer.from(res.pdf_base64, 'base64'));
    return pdfPath;
  } catch (error) {
    console.error(`PDF generation failed: ${error.message}`);
    throw error;
  }
}

// Generate Payment Receipt & Credit Note PDFs using native Rust SuiteCore WebAssembly engine.
function generatePaymentPDF(dbPath, paymentId, options = {}) {
  try {
    if (!fs.existsSync(dbPath)) throw new Error(`Database not found at: ${dbPath}`);
    const tempDir = getTempDir();
    const pdfPath = path.join(tempDir, `payment-${paymentId}-${Date.now()}.pdf`);

    const SuiteCoreBridge = require(path.resolve(__dirname, '../../../../frontend/shared/suite_core_bridge.js'));
    if (!SuiteCoreBridge || !SuiteCoreBridge.isWasmLoaded()) {
      throw new Error('[Billing] WebAssembly core (suite_core.wasm) not loaded for payment PDF generation.');
    }

    const exportMode = options && options.export_mode !== undefined ? Boolean(options.export_mode) : true;

    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });

    let renderData;
    try {
      const payment = db.prepare(`
        SELECT 
          p.id,
          p.customer_id,
          p.type,
          p.amount,
          p.credit_amount,
          p.payment_medium,
          p.reference_number,
          COALESCE(p.payment_date, p.created_at) as payment_date,
          p.invoice_id,
          p.notes,
          p.reason,
          c.name as customer_name,
          COALESCE(c.gstin, '') as customer_gstin,
          COALESCE(c.licence_no, '') as customer_licence_no,
          COALESCE(c.pan, '') as customer_pan,
          COALESCE(c.phone, '') as customer_phone,
          COALESCE(c.address, '') as customer_address,
          c.ledger_token as customer_ledger_token
        FROM payments p
        LEFT JOIN contacts c ON p.customer_id = c.id
        WHERE p.id = ? OR CAST(p.id AS TEXT) = ?
      `).get(paymentId, String(paymentId));

      if (!payment) throw new Error(`Payment not found: ${paymentId}`);

      const isCreditNote = payment.type === 'CREDIT_NOTE';
      const voucher_type = isCreditNote ? 'credit_note' : 'payment_receipt';
      const amount = isCreditNote ? (Number(payment.credit_amount) || 0) : (Number(payment.amount) || 0);
      const payment_method = payment.payment_medium || (isCreditNote ? 'Credit Adjustment' : 'Cash');
      const remarks = (payment.notes || payment.reason || '').trim() || null;

      let linked_invoice_no = null;
      let linked_invoice_amount = null;
      if (payment.invoice_id) {
        try {
          const inv = db.prepare('SELECT invoice_no, grand_total FROM invoices WHERE id = ?').get(payment.invoice_id);
          if (inv) {
            linked_invoice_no = inv.invoice_no;
            linked_invoice_amount = inv.grand_total;
          }
        } catch (_) {}
      }

      // Authoritative Ledger Statement Calculation (matches Customer Ledger exactly)
      let current_outstanding_due = null;
      let account_status = null;
      let aging_days = null;
      let due_percentage = null;
      let settlement_percentage = null;
      let total_billed_amount = null;
      let total_settled_amount = null;
      let overdue_since_date = null;
      let due_bills = [];

      if (payment.customer_id) {
        try {
          const calculator = require('../../../core/billing/calculator');
          const statement = calculator.calculateCustomerStatement(db, payment.customer_id);
          if (statement && statement.success) {
            const currentDue = Number(statement.customer?.current_due ?? statement.summary?.current_due ?? 0);
            current_outstanding_due = currentDue;
            account_status = currentDue > 0.01 ? 'DUE' : (currentDue < -0.01 ? 'ADVANCE' : 'SETTLED');

            // Extract unsettled bills with remaining amounts and days passed
            const rawBills = statement.bills || [];
            due_bills = rawBills
              .filter(b => !b.settled && Number(b.remaining_amount || 0) > 0.01)
              .sort((a, b) => new Date(a.invoice_date || a.created_at) - new Date(b.invoice_date || b.created_at))
              .map(b => {
                const bDate = b.invoice_date ? String(b.invoice_date).slice(0, 10) : '';
                let daysPassed = Number(b.days_overdue || b.settlement_days || 0);
                if (!daysPassed && bDate) {
                  const diffMs = Date.now() - new Date(bDate).getTime();
                  daysPassed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                }
                return {
                  invoice_no: b.invoice_no || `BILL-${b.id}`,
                  date: bDate,
                  amount: Number(b.amount || b.grand_total || 0),
                  due_amount: Number(b.remaining_amount || 0),
                  status: b.status || (Number(b.remaining_amount || 0) < Number(b.amount || b.grand_total || 0) ? 'PARTIAL' : 'UNPAID'),
                  days_overdue: daysPassed,
                };
              });

            if (due_bills.length > 0) {
              overdue_since_date = due_bills[0].date;
            }

            // Aging days from overdue bills or oldest unsettled bill
            if (due_bills.length > 0) {
              const maxOverdue = Math.max(...rawBills.filter(b => !b.settled).map(b => Number(b.days_overdue || b.settlement_days || 0)), 0);
              aging_days = Math.max(0, maxOverdue);
            } else {
              aging_days = 0;
            }

            // Active cycle settlement: Current payment + remaining due (gamifies active debt clearance)
            const pmtAmt = amount > 0 ? amount : 0;
            const activeCycleTotal = currentDue > 0.001 ? Number((pmtAmt + currentDue).toFixed(2)) : pmtAmt;
            total_billed_amount = activeCycleTotal > 0 ? activeCycleTotal : pmtAmt;
            total_settled_amount = pmtAmt;

            if (activeCycleTotal > 0 && currentDue > 0) {
              due_percentage = Math.min(100, Math.max(0, (currentDue / activeCycleTotal) * 100));
            } else {
              due_percentage = 0;
            }

            if (currentDue <= 0.001) {
              settlement_percentage = 100.0;
            } else if (activeCycleTotal > 0) {
              settlement_percentage = Math.max(0, Math.min(100, Number(((pmtAmt / activeCycleTotal) * 100).toFixed(1))));
            } else {
              settlement_percentage = 0.0;
            }

            // If linked_invoice_no is not explicitly set, see if notes mention an invoice
            if (!linked_invoice_no && payment.notes) {
              const match = payment.notes.match(/(?:INV(?:OICE)?|BILL)[#\s:-]*([A-Z0-9\/-]+)/i);
              if (match) {
                linked_invoice_no = match[1];
              }
            }
          }
        } catch (calcErr) {
          console.warn('[Billing] Fallback statement calculation for payment PDF:', calcErr.message);
          const contact = db.prepare('SELECT opening_balance FROM contacts WHERE id = ?').get(payment.customer_id);
          const opBal = Number((contact && contact.opening_balance) || 0);
          const invSum = db.prepare('SELECT COALESCE(SUM(grand_total), 0) as total FROM invoices WHERE customer_id = ?').get(payment.customer_id);
          const paySum = db.prepare(`
            SELECT 
              COALESCE(SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END), 0) as payments,
              COALESCE(SUM(CASE WHEN type = 'CREDIT_NOTE' THEN credit_amount ELSE 0 END), 0) as credits
            FROM payments WHERE customer_id = ?
          `).get(payment.customer_id);
          const debit = opBal + ((invSum && invSum.total) || 0);
          const credit = ((paySum && paySum.payments) || 0) + ((paySum && paySum.credits) || 0);
          const due = debit - credit;
          current_outstanding_due = due;
          account_status = due > 0.01 ? 'DUE' : (due < -0.01 ? 'ADVANCE' : 'SETTLED');
          aging_days = 0;
          const pmtAmt = amount > 0 ? amount : 0;
          const activeCycleTotal = due > 0.01 ? Number((pmtAmt + due).toFixed(2)) : pmtAmt;
          total_billed_amount = activeCycleTotal > 0 ? activeCycleTotal : pmtAmt;
          total_settled_amount = pmtAmt;
          due_percentage = activeCycleTotal > 0 && due > 0 ? Math.min(100, Math.max(0, (due / activeCycleTotal) * 100)) : 0;
          settlement_percentage = due <= 0.001 ? 100.0 : (activeCycleTotal > 0 ? Number(((pmtAmt / activeCycleTotal) * 100).toFixed(1)) : 0.0);
        }
      }

      const app_settings = {};
      try {
        const rows = db.prepare('SELECT setting_key, setting_value FROM app_settings').all();
        for (const r of rows) {
          if (r.setting_key) app_settings[r.setting_key] = String(r.setting_value ?? '');
        }
      } catch (_) {}

      renderData = {
        voucher_type,
        reference_number: payment.reference_number || (isCreditNote ? `CREDIT-${payment.id}` : `PAY-${payment.id}`),
        payment_date: payment.payment_date || new Date().toISOString().slice(0, 10),
        customer_name: payment.customer_name || 'N/A',
        customer_gstin: payment.customer_gstin,
        customer_licence_no: payment.customer_licence_no,
        customer_pan: payment.customer_pan,
        customer_phone: payment.customer_phone,
        customer_address: payment.customer_address,
        amount,
        payment_method,
        linked_invoice_no,
        linked_invoice_amount,
        current_outstanding_due,
        account_status,
        aging_days,
        due_percentage,
        settlement_percentage,
        total_billed_amount,
        total_settled_amount,
        overdue_since_date,
        export_mode: exportMode,
        due_bills,
        remarks,
        customer_ledger_token: payment.customer_ledger_token,
        customer_id: payment.customer_id,
        app_settings,
      };
    } finally {
      db.close();
    }

    const res = SuiteCoreBridge.renderPaymentPdf(renderData);
    if (!res || !res.success || !res.pdf_base64) {
      throw new Error(`Rust payment voucher rendering failed: ${res ? res.error : 'Unknown error'}`);
    }

    fs.writeFileSync(pdfPath, Buffer.from(res.pdf_base64, 'base64'));
    return pdfPath;
  } catch (error) {
    console.error(`Payment PDF generation failed: ${error.message}`);
    throw error;
  }
}

// Generate opening balance PDF using native Rust SuiteCore WebAssembly engine.
function generateOpeningBalancePDF(dbPath, customerName, options = {}) {
  try {
    if (!fs.existsSync(dbPath)) throw new Error(`Database not found at: ${dbPath}`);
    const tempDir = getTempDir();
    const sanitizedName = customerName.replace(/[\s\/\\:*?"<>|]+/g, '-');
    const pdfPath = path.join(tempDir, `opening-balance-${sanitizedName}-${Date.now()}.pdf`);

    const SuiteCoreBridge = require(path.resolve(__dirname, '../../../../frontend/shared/suite_core_bridge.js'));
    if (!SuiteCoreBridge || !SuiteCoreBridge.isWasmLoaded()) {
      throw new Error('[Billing] WebAssembly core (suite_core.wasm) not loaded for opening balance PDF generation.');
    }

    const exportMode = options && options.export_mode !== undefined ? Boolean(options.export_mode) : true;

    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });

    let renderData;
    try {
      const contact = db.prepare(`
        SELECT 
          id, name, opening_balance,
          COALESCE(gstin, '') as gstin,
          COALESCE(licence_no, '') as licence_no,
          COALESCE(pan, '') as pan,
          COALESCE(phone, '') as phone,
          COALESCE(address, '') as address,
          ledger_token
        FROM contacts
        WHERE name = ?
      `).get(customerName);

      if (!contact) throw new Error(`Customer not found: ${customerName}`);

      const app_settings = {};
      try {
        const rows = db.prepare('SELECT setting_key, setting_value FROM app_settings').all();
        for (const r of rows) {
          if (r.setting_key) app_settings[r.setting_key] = String(r.setting_value ?? '');
        }
      } catch (_) {}

      renderData = {
        voucher_type: 'opening_balance',
        reference_number: 'OPENING-BALANCE',
        payment_date: new Date().toISOString().slice(0, 10),
        customer_name: contact.name,
        customer_gstin: contact.gstin,
        customer_licence_no: contact.licence_no,
        customer_pan: contact.pan,
        customer_phone: contact.phone,
        customer_address: contact.address,
        amount: Number(contact.opening_balance) || 0,
        payment_method: 'Carryover Balance',
        linked_invoice_no: null,
        linked_invoice_amount: null,
        current_outstanding_due: Number(contact.opening_balance) || 0,
        account_status: 'CARRYOVER',
        aging_days: 0,
        due_percentage: 100.0,
        settlement_percentage: 0.0,
        export_mode: exportMode,
        due_bills: [],
        remarks: 'Opening ledger balance carried over to system.',
        customer_ledger_token: contact.ledger_token,
        customer_id: contact.id,
        app_settings,
      };
    } finally {
      db.close();
    }

    const res = SuiteCoreBridge.renderPaymentPdf(renderData);
    if (!res || !res.success || !res.pdf_base64) {
      throw new Error(`Rust opening balance rendering failed: ${res ? res.error : 'Unknown error'}`);
    }

    fs.writeFileSync(pdfPath, Buffer.from(res.pdf_base64, 'base64'));
    return pdfPath;
  } catch (error) {
    console.error(`Opening balance PDF generation failed: ${error.message}`);
    throw error;
  }
}

// Helper to convert PDF to JPG
function convertPDFToJPG(pdfPath) {
  try {
    const tempDir = getTempDir();
    const jpgPath = path.join(tempDir, `invoice-${Date.now()}.jpg`);
    const pythonScript = getScriptsPath('pdf-to-jpg.py');
    
    // Verify files exist
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF not found at: ${pdfPath}`);
    }
    if (!fs.existsSync(pythonScript)) {
      throw new Error(`Python script not found at: ${pythonScript}`);
    }
    
    // Call Python script with error capture
    const cmd = `${PYTHON_CMD} "${pythonScript}" --pdf "${pdfPath}" --out "${jpgPath}" --dpi 150 --quality 90`;
    let output, error;
    
    try {
      output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (execError) {
      error = execError;
      const stderr = execError.stderr ? execError.stderr.toString() : '';
      const stdout = execError.stdout ? execError.stdout.toString() : '';
      console.error(`Python script error - exit code ${execError.status}:`);
      console.error('STDERR:', stderr);
      console.error('STDOUT:', stdout);
      console.error('Command:', cmd);
      throw new Error(`Python execution failed (${execError.status}): ${stderr || stdout || execError.message}`);
    }
    
    if (!fs.existsSync(jpgPath)) {
      throw new Error(`JPG file was not created at ${jpgPath}. Script output: ${output}`);
    }
    
    return jpgPath;
  } catch (error) {
    console.error(`JPG conversion failed: ${error.message}`);
    throw error;
  }
}

// Helper to calculate annual serial number for a customer (calendar year)
function getAnnualSerialNumber(db, invoiceId) {
  try {
    // 1. Get the current invoice details
    const currentInvoice = db.prepare(`
      SELECT customer_id, COALESCE(invoice_date, created_at) as effective_date, id
      FROM invoices WHERE id = ?
    `).get(invoiceId);
    
    if (!currentInvoice) return 1;

    // 2. Extract year from effective date
    const date = new Date(currentInvoice.effective_date);
    const year = date.getFullYear();
    const startOfYear = `${year}-01-01 00:00:00`;
    const endOfYear = `${year}-12-31 23:59:59`;

    // 3. Count invoices for this customer in this calendar year up to this invoice
    // Logic: earlier date OR (same date AND earlier/same id)
    const result = db.prepare(`
      SELECT COUNT(*) as serial
      FROM invoices
      WHERE customer_id = ? 
      AND COALESCE(invoice_date, created_at) >= ? 
      AND COALESCE(invoice_date, created_at) <= ?
      AND (
        COALESCE(invoice_date, created_at) < ? 
        OR (COALESCE(invoice_date, created_at) = ? AND id <= ?)
      )
    `).get(
      currentInvoice.customer_id, 
      startOfYear, 
      endOfYear, 
      currentInvoice.effective_date, 
      currentInvoice.effective_date, 
      currentInvoice.id
    );

    return result ? result.serial : 1;
  } catch (err) {
    console.error('Error calculating annual serial number:', err);
    return 1;
  }
}

const createActivityLogger = require('../../../core/audit/activity-logger');
const { buildDashboardMetricsResponse, buildCustomerStatementResponse } = require('../../../shared/api/billing-contract');

module.exports = function(db) {
  const activityLogger = createActivityLogger(db);

  function getWorkerContactScope(req, tableAlias = 'c') {
    if (req.user && req.user.role === 'worker') {
      const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
      return `(${tableAlias}.id IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}') OR ${tableAlias}.created_by_user_id IN (SELECT id FROM users WHERE role = 'worker') OR ${tableAlias}.created_by_user_id = '${safeUserId}')`;
    }
    return null;
  }

  function isCustomerAccessible(req, customerId) {
    if (!req.user || req.user.role !== 'worker') return true;
    const workerScope = getWorkerContactScope(req, 'contacts');
    const row = db.prepare(`SELECT id FROM contacts WHERE id = ? AND ${workerScope}`).get(customerId);
    return Boolean(row);
  }

  function getCustomerDuplexPreference(req, customerId) {
    try {
      if (!customerId) return null;
      const isWorker = req.user && req.user.role === 'worker';
      const userId = req.user ? (req.user.id || req.user.userId) : null;

      if (isWorker && userId) {
        const uca = db.prepare('SELECT disable_duplex_export FROM user_contact_access WHERE user_id = ? AND contact_id = ?').get(userId, customerId);
        if (uca && uca.disable_duplex_export !== null && uca.disable_duplex_export !== undefined) {
          return Number(uca.disable_duplex_export) === 1 ? 'no' : 'yes';
        }
      }

      const contact = db.prepare('SELECT disable_duplex_export FROM contacts WHERE id = ?').get(customerId);
      if (contact && contact.disable_duplex_export !== null && contact.disable_duplex_export !== undefined) {
        return Number(contact.disable_duplex_export) === 1 ? 'no' : 'yes';
      }
    } catch (_) {}
    return null;
  }

  return {
    // ============= REAL-TIME DATA BUS & STATE FINGERPRINT =============
    subscribeSSE: (req, res) => {
      dataBus.handleSSEConnection(req, res, db);
    },

    getFingerprint: (req, res) => {
      dataBus.handleFingerprintRequest(req, res, db);
    },

    // ============= SERVER-AUTHORITATIVE CALCULATION =============

    // Authoritative bill calculation endpoint for Web and Mobile clients
    calculateBill: (req, res) => {
      try {
        const items = req.body.items || req.body.products || [];
        const result = calculator.calculateBillItemsAndSummary(db, {
          customerId: req.body.customer_id || req.body.customerId,
          customerName: req.body.customer_name || req.body.customerName,
          items,
          roundOffEnabled: req.body.round_off_enabled !== false && req.body.roundOffEnabled !== false,
          invoiceDate: req.body.invoice_date || req.body.invoiceDate,
          user: req.user
        });
        res.json(result);
      } catch (err) {
        console.error('Error in calculateBill:', err);
        res.status(500).json({ error: 'Calculation failed: ' + err.message });
      }
    },

    // ============= INVOICES (BILLS) =============
    
    // Create a new invoice/bill with line items using server-authoritative calculations
    createBill: (req, res) => {
      try {
        const { 
          customer_id, 
          customer_name,
          invoice_no, 
          due_date, 
          products, 
          round_off, 
          invoice_date 
        } = req.body;

        // Validate required fields
        if (!customer_id && !customer_name) {
          return res.status(400).json({ error: 'customer_id or customer_name is required' });
        }
        if (!products || !Array.isArray(products) || products.length === 0) {
          return res.status(400).json({ error: 'products array is required' });
        }

        // Get customer_id if only name provided
        let finalCustomerId = customer_id;
        if (!customer_id && customer_name) {
          try {
            const customer = db.prepare('SELECT id FROM contacts WHERE name = ? COLLATE NOCASE').get(customer_name);
            if (customer) {
              finalCustomerId = customer.id;
            } else {
              // Auto-create customer if doesn't exist
              const isWorker = req.user && req.user.role === 'worker';
              const creatorId = req.user ? (req.user.id || req.user.userId) : null;
              const ledgerToken = generateLedgerToken();
              const createStmt = db.prepare(`
                INSERT INTO contacts (name, type, active, exclude_from_stats, created_by_user_id, ledger_token, created_at, updated_at)
                VALUES (?, 'customer', 'INACTIVE', ?, ?, ?, datetime('now'), datetime('now'))
              `);
              const customerResult = createStmt.run(customer_name, isWorker ? 1 : 0, creatorId, ledgerToken);
              finalCustomerId = customerResult.lastInsertRowid;
              if (isWorker && creatorId) {
                try {
                  db.prepare('INSERT OR IGNORE INTO user_contact_access (user_id, contact_id) VALUES (?, ?)').run(creatorId, finalCustomerId);
                } catch (_) {}
              }
            }
          } catch (err) {
            console.error('Error finding/creating customer:', err);
            return res.status(500).json({ error: 'Failed to process customer' });
          }
        }

        // Check if customer is accessible to worker
        if (!isCustomerAccessible(req, finalCustomerId)) {
          return res.status(403).json({ error: 'Access denied: You do not have permission to bill this customer.' });
        }

        if (!finalCustomerId) {
          return res.status(400).json({ error: 'customer_id or customer_name is required' });
        }

        // Run server-authoritative calculation engine
        const serverCalc = calculator.calculateBillItemsAndSummary(db, {
          customerId: finalCustomerId,
          items: products,
          roundOffEnabled: round_off !== undefined ? (round_off !== 0 && round_off !== false) : true,
          invoiceDate: invoice_date || req.body.invoice_date || null,
          user: req.user
        });

        const calculatedSubtotal = serverCalc.summary.subtotal;
        const calculatedDiscount = serverCalc.summary.total_discount;
        const calculatedGst = serverCalc.summary.total_gst;
        const calculatedRoundOff = serverCalc.summary.round_off;
        const calculatedGrandTotal = serverCalc.summary.grand_total;
        const calculatedPreviousDue = serverCalc.previous_due;

        // Generate invoice number if not provided
        const finalInvoiceNo = invoice_no || generateNewInvoiceNumber(db, finalCustomerId, calculatedGst, req.body.invoice_date);

        const creatorId = req.user ? (req.user.id || req.user.userId) : null;

        // Create invoice record
        const invoiceStmt = db.prepare(`
          INSERT INTO invoices 
          (customer_id, invoice_no, due_date, total_amount, total_discount, total_gst, 
           round_off, grand_total, previous_due, invoice_date, created_by_user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        let invoiceId;
        try {
          const invoiceResult = invoiceStmt.run(
            finalCustomerId,
            finalInvoiceNo,
            due_date || null,
            calculatedSubtotal,
            calculatedDiscount,
            calculatedGst,
            calculatedRoundOff,
            calculatedGrandTotal,
            calculatedPreviousDue,
            req.body.invoice_date || null,
            creatorId
          );

          invoiceId = invoiceResult.lastInsertRowid;
        } catch (err) {
          console.error('Error creating invoice:', err.message);
          if (err.sql) console.error('   SQL:', err.sql);
          if (err.code) console.error('   Code:', err.code);
          return res.status(500).json({ error: 'Failed to create invoice: ' + err.message });
        }

        if (!invoiceId) {
          console.error('Invoice was created but no ID returned');
          return res.status(500).json({ error: 'Invoice created but no ID returned' });
        }

        // Insert invoice line items using server-calculated values
        const itemStmt = db.prepare(`
          INSERT INTO invoice_items
          (invoice_id, product_id, variant_id, batch_id, pack_value, pack_type, batch_no, 
           exp_date, qty, scheme, free, mrp, rate, amount, discount_1_percent, discount_1_amount,
           discount_2_percent, discount_2_amount, gst_percent, gst_amount, sgst_amount, cgst_amount,
           final_amount, gst_reverse, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        serverCalc.items.forEach((item, index) => {
          try {
            itemStmt.run(
              invoiceId,
              item.product_id,
              item.variant_id,
              item.batch_id,
              item.pack_value || null,
              item.pack_type || null,
              item.batch_no || null,
              item.exp_date || null,
              item.qty,
              item.scheme || null,
              item.free || 0,
              item.mrp || item.rate || 0,
              item.rate,
              item.amount,
              item.discount_1_percent,
              item.discount_1_amount,
              item.discount_2_percent,
              item.discount_2_amount,
              item.gst_percent,
              item.gst_amount,
              item.sgst_amount,
              item.cgst_amount,
              item.final_amount,
              item.gst_reverse ? 1 : 0
            );
          } catch (err) {
            console.error(`Error inserting line item ${index + 1}:`, err.message);
          }
        });

        // Update customer_item_memory (save preferences for each product)
        const prefStmt = db.prepare(`
          INSERT INTO customer_item_memory 
          (customer_id, product_id, discount_1, discount_2, scheme, tax_percent, gst_reverse, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(customer_id, product_id) DO UPDATE SET
            discount_1 = excluded.discount_1,
            discount_2 = excluded.discount_2,
            scheme = excluded.scheme,
            tax_percent = excluded.tax_percent,
            gst_reverse = excluded.gst_reverse,
            updated_at = datetime('now')
        `);

        serverCalc.items.forEach(item => {
          try {
            if (item.product_id) {
              prefStmt.run(
                finalCustomerId,
                item.product_id,
                item.discount_1_percent || 0,
                item.discount_2_percent || 0,
                item.scheme || null,
                item.gst_percent || 0,
                item.gst_reverse ? 1 : 0
              );
            }
          } catch (err) {
            console.error('Error saving preference:', err);
          }
        });

        // Calculate ledger totals for this customer
        const ledgerTotals = db.prepare(`
          SELECT 
            COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = ?), 0) as total_debit,
            COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = ? AND type = 'PAYMENT'), 0) as total_payments,
            COALESCE((SELECT SUM(credit_amount) FROM payments WHERE customer_id = ? AND type = 'CREDIT_NOTE'), 0) as total_credits,
            (SELECT COUNT(*) FROM invoices WHERE customer_id = ?) as total_bills,
            (SELECT COUNT(*) FROM payments WHERE customer_id = ?) as total_payments_count
        `).get(finalCustomerId, finalCustomerId, finalCustomerId, finalCustomerId, finalCustomerId);

        const total_credit = ledgerTotals.total_payments + ledgerTotals.total_credits;
        const current_due = ledgerTotals.total_debit - total_credit;
        
        // Determine current status based on current_due
        let current_status = 'PENDING';
        if (current_due < 0) {
          current_status = 'CREDIT';
        } else if (current_due === 0) {
          current_status = 'SETTLED';
        }

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'billing',
          action: 'create',
          resourceType: 'invoice',
          resourceId: invoiceId,
          resourceName: finalInvoiceNo,
          metadata: { customer_id: finalCustomerId, grand_total: calculatedGrandTotal, items_count: serverCalc.items.length }
        });

        const customerName = (function() {
          const cust = db.prepare('SELECT name FROM contacts WHERE id = ?').get(finalCustomerId);
          return cust?.name || customer_name || 'Customer';
        })();

        try {
          dataBus.broadcast('billing:invoice', 'created', {
            id: invoiceId,
            invoice_no: finalInvoiceNo,
            customer_id: finalCustomerId,
            customer_name: customerName,
            grand_total: calculatedGrandTotal
          });
          dataBus.broadcast('billing:ledger', 'updated', {
            customer_id: finalCustomerId
          });
        } catch (_) {}

        res.status(201).json({
          success: true,
          id: invoiceId,
          invoice_no: finalInvoiceNo,
          reference_no: finalInvoiceNo,
          customer_id: finalCustomerId,
          customer_name: customerName,
          due_date: due_date || null,
          invoice_date: req.body.invoice_date || new Date().toISOString().slice(0, 10),
          subtotal: calculatedSubtotal,
          total_discount: calculatedDiscount,
          total_gst: calculatedGst,
          round_off: calculatedRoundOff,
          grand_total: calculatedGrandTotal,
          previous_due: calculatedPreviousDue,
          projected_due: serverCalc.projected_due,
          status: 'completed',
          items: serverCalc.items,
          items_count: serverCalc.items.length,
          created_at: new Date().toISOString()
        });

      } catch (error) {
        console.error('Error creating bill:', error);
        res.status(500).json({ error: error.message });
      }
    },

    // Get all invoices
    getBills: (req, res) => {
      try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { customer_id, limit = 100, offset = 0 } = req.query;

        // Join with contacts to get customer names
        let sql = `
          SELECT i.*,
                 i.invoice_date,
                 COALESCE(u_creator.role, 'owner') as created_by_role,
                 COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
                 u_editor.role as last_edited_by_role,
                 COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name,
                 c.name as customer_name,
                 l.current_due as customer_current_due
          FROM invoices i
          LEFT JOIN contacts c ON i.customer_id = c.id
          LEFT JOIN ledger l ON i.customer_id = l.customer_id
          LEFT JOIN users u_creator ON i.created_by_user_id = u_creator.id
          LEFT JOIN users u_editor ON i.last_edited_by_user_id = u_editor.id

          WHERE 1=1
        `;
        const params = [];

        if (customer_id) {
          sql += ' AND i.customer_id = ?';
          params.push(customer_id);
        }

        const workerScope = getWorkerContactScope(req, 'c');
        if (workerScope) {
          sql += ` AND ${workerScope}`;
        }

        sql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const stmt = db.prepare(sql);
        const invoices = stmt.all(...params);

        // Format response for ledger - include reference_no and all needed fields
        const formattedBills = invoices.map(inv => {
          let items = [];
          try {
            const dbItems = db.prepare(`
              SELECT ii.*, p.name as product_name
              FROM invoice_items ii
              LEFT JOIN products p ON ii.product_id = p.id
              WHERE ii.invoice_id = ?
            `).all(inv.id);
            items = dbItems.map(item => ({
              id: item.id,
              product_id: item.product_id,
              variant_id: item.variant_id,
              batch_id: item.batch_id,
              batch_no: item.batch_no,
              product_name: item.product_name || `Product #${item.product_id}` || 'Unknown',
              quantity: item.qty || 0,
              qty: item.qty || 0,
              rate: item.rate || 0,
              price: item.rate || 0,
              amount: item.amount || 0,
              total: item.amount || 0,
              discount_1_percent: item.discount_1_percent || 0,
              discount_1_amount: item.discount_1_amount || 0,
              discount_2_percent: item.discount_2_percent || 0,
              discount_2_amount: item.discount_2_amount || 0,
              gst_percent: item.gst_percent || 0,
              gst_amount: item.gst_amount || 0,
              final_amount: item.final_amount || 0,
              gst_reverse: !!item.gst_reverse
            }));
          } catch (itemErr) {
            console.error('Error fetching invoice items:', itemErr.message);
          }

          return {
            id: inv.id,
            invoice_no: inv.invoice_no,
            reference_no: inv.invoice_no,
            customer_id: inv.customer_id,
            customer_name: inv.customer_name || 'Unknown',
            customer_current_due: inv.customer_current_due || 0,
            bill_date: inv.invoice_date || inv.created_at,
            invoice_date: inv.invoice_date || inv.created_at,
            created_at: inv.created_at,
            created_by_role: inv.created_by_role,
            created_by_name: inv.created_by_name,
            last_edited_by_role: inv.last_edited_by_role,
            last_edited_by_name: inv.last_edited_by_name,

            due_date: inv.due_date,
            subtotal: inv.total_amount || 0,
            total_amount: inv.total_amount || 0,
            total_discount: inv.total_discount || 0,
            total_gst: inv.total_gst || 0,
            round_off: inv.round_off || 0,
            grand_total: inv.grand_total || 0,
            previous_due: inv.previous_due || 0,
            status: 'completed', // All invoices in this table are completed
            items
          };
        });

        res.json({
          success: true,
          data: formattedBills,
          count: formattedBills.length
        });
      } catch (error) {
        console.error('❌ Error in getBills:', error);
        res.status(500).json({ error: error.message });
      }
    },

    // Get single invoice with all items
    getBill: (req, res) => {
      try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { id } = req.params;

        // Join with contacts to get customer name
        const invoiceStmt = db.prepare(`
          SELECT i.*,
                 i.invoice_date,
                 COALESCE(u_creator.role, 'owner') as created_by_role,
                 COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
                 u_editor.role as last_edited_by_role,
                 COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name,
                 c.name as customer_name
          FROM invoices i
          LEFT JOIN contacts c ON i.customer_id = c.id
          LEFT JOIN users u_creator ON i.created_by_user_id = u_creator.id
          LEFT JOIN users u_editor ON i.last_edited_by_user_id = u_editor.id

          WHERE i.id = ?
        `);
        const invoice = invoiceStmt.get(id);

        if (!invoice) {
          return res.status(404).json({ error: 'Invoice not found' });
        }

        if (invoice.customer_id && !isCustomerAccessible(req, invoice.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this invoice' });
        }

        // Get invoice items - JOIN with products to get product name
        const itemsStmt = db.prepare(`
          SELECT ii.*,
                 p.name as product_name
          FROM invoice_items ii
          LEFT JOIN products p ON ii.product_id = p.id
          WHERE ii.invoice_id = ?
          ORDER BY ii.id
        `);
        const dbItems = itemsStmt.all(id);

        // Transform items to include calculated sgst_percent and cgst_percent
        // (derived from stored amounts, not tax rates)
        const items = dbItems.map(item => {
          // Calculate the discounted amount (base for tax percentage calculation)
          const discountedAmount = (item.amount || 0) - (item.discount_1_amount || 0) - (item.discount_2_amount || 0);
          
          // Derive the actual SGST and CGST percentages that were applied
          let sgstPercent = 0;
          let cgstPercent = 0;
          
          if (discountedAmount > 0 && item.sgst_amount > 0) {
            sgstPercent = parseFloat(((item.sgst_amount / discountedAmount) * 100).toFixed(2));
          } else if (item.gst_percent > 0) {
            sgstPercent = parseFloat((item.gst_percent / 2).toFixed(2));
          }
          
          if (discountedAmount > 0 && item.cgst_amount > 0) {
            cgstPercent = parseFloat(((item.cgst_amount / discountedAmount) * 100).toFixed(2));
          } else if (item.gst_percent > 0) {
            cgstPercent = parseFloat((item.gst_percent / 2).toFixed(2));
          }

          return {
            ...item,
            mrp: (item.mrp && item.mrp > 0) ? item.mrp : (item.rate || 0),
            // Add calculated percentages for frontend
            sgst_percent: sgstPercent,
            cgst_percent: cgstPercent
          };
        });

        res.json({
          success: true,
          data: {
            ...invoice,
            customer_name: invoice.customer_name || 'Unknown',
            reference_no: invoice.invoice_no,
            invoice_date: invoice.invoice_date || invoice.created_at,
            bill_date: invoice.invoice_date || invoice.created_at,
            created_at: invoice.created_at,
            due_date: invoice.due_date,
            subtotal: invoice.total_amount || 0,
            total_amount: invoice.total_amount || 0,
            total_discount: invoice.total_discount || 0,
            total_gst: invoice.total_gst || 0,
            round_off: invoice.round_off || 0,
            grand_total: invoice.grand_total || 0,
            previous_due: invoice.previous_due || 0,
            status: 'completed',
            items: items
          }
        });
      } catch (error) {
        console.error('Error fetching bill:', error);
        res.status(500).json({ error: error.message });
      }
    },

    // Update invoice (supports updating products array)
    updateBill: (req, res) => {
      try {
        const { id } = req.params;
        const { 
          customer_id, 
          due_date, 
          subtotal, 
          total_discount, 
          total_gst, 
          round_off, 
          grand_total,
          products,
          invoice_date 
        } = req.body;

        // Check if invoice exists
        const existingStmt = db.prepare('SELECT id, customer_id FROM invoices WHERE id = ?');
        const existing = existingStmt.get(id);
        if (!existing) {
          return res.status(404).json({ error: 'Invoice not found' });
        }

        if (existing.customer_id && !isCustomerAccessible(req, existing.customer_id)) {
          return res.status(403).json({ error: 'Access denied to update this invoice' });
        }

        const customerId = customer_id || existing.customer_id;
        const editorId = req.user ? (req.user.id || req.user.userId) : null;

        // Check if products array is provided
        if (products && Array.isArray(products) && products.length > 0) {
          // Authoritative Server Recalculation
          const serverCalc = calculator.calculateBillItemsAndSummary(db, {
            customerId,
            customerName: null,
            items: products,
            roundOffEnabled: round_off !== undefined ? (round_off !== 0 && round_off !== false) : true,
            invoiceDate: invoice_date || existing.invoice_date || null,
            user: req.user
          });

          const calculatedSubtotal = serverCalc.summary.subtotal;
          const calculatedDiscount = serverCalc.summary.total_discount;
          const calculatedGst = serverCalc.summary.total_gst;
          const calculatedRoundOff = serverCalc.summary.round_off;
          const calculatedGrandTotal = serverCalc.summary.grand_total;

          // Update main invoice record with verified server totals
          const updateStmt = db.prepare(`
            UPDATE invoices 
            SET customer_id = COALESCE(?, customer_id),
                due_date = COALESCE(?, due_date),
                total_amount = ?,
                total_discount = ?,
                total_gst = ?,
                round_off = ?,
                grand_total = ?,
                invoice_date = COALESCE(?, invoice_date),
                last_edited_by_user_id = COALESCE(?, last_edited_by_user_id),
                updated_at = datetime('now')
            WHERE id = ?
          `);

          updateStmt.run(
            customerId,
            due_date,
            calculatedSubtotal,
            calculatedDiscount,
            calculatedGst,
            calculatedRoundOff,
            calculatedGrandTotal,
            invoice_date,
            editorId,
            id
          );

          // Delete existing items
          const deleteItemsStmt = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
          deleteItemsStmt.run(id);

          // Insert new items using server-calculated verified values
          const itemStmt = db.prepare(`
            INSERT INTO invoice_items
            (invoice_id, product_id, variant_id, batch_id, pack_value, pack_type, batch_no, 
             exp_date, qty, scheme, free, mrp, rate, amount, discount_1_percent, discount_1_amount,
             discount_2_percent, discount_2_amount, gst_percent, gst_amount, sgst_amount, cgst_amount,
             final_amount, gst_reverse, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `);

          serverCalc.items.forEach(item => {
            try {
              itemStmt.run(
                id,
                item.product_id,
                item.variant_id,
                item.batch_id,
                item.pack_value || null,
                item.pack_type || null,
                item.batch_no || null,
                item.exp_date || null,
                item.qty,
                item.scheme || null,
                item.free || 0,
                item.mrp || item.rate || 0,
                item.rate,
                item.amount,
                item.discount_1_percent,
                item.discount_1_amount,
                item.discount_2_percent,
                item.discount_2_amount,
                item.gst_percent,
                item.gst_amount,
                item.sgst_amount,
                item.cgst_amount,
                item.final_amount,
                item.gst_reverse ? 1 : 0
              );
            } catch (err) {
              console.error('Error updating line item:', err);
            }
          });

          // Recalculate customer ledger balance if customerId exists
          if (customerId) {
            try {
              const totals = db.prepare(`
                SELECT 
                  COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = ?), 0) as total_debit,
                  COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = ? AND type = 'PAYMENT'), 0) +
                  COALESCE((SELECT SUM(credit_amount) FROM payments WHERE customer_id = ? AND type = 'CREDIT_NOTE'), 0) as total_credit
              `).get(customerId, customerId, customerId);

              const current_due = totals.total_debit - totals.total_credit;
              db.prepare(`
                UPDATE ledger 
                SET current_due = ?,
                    updated_at = datetime('now')
                WHERE customer_id = ?
              `).run(current_due, customerId);
            } catch (ledgErr) {
              console.error('Error updating ledger balance on bill edit:', ledgErr);
            }
          }

          try {
            dataBus.broadcast('billing:invoice', 'updated', { id, customer_id: customerId, grand_total: calculatedGrandTotal });
            dataBus.broadcast('billing:ledger', 'updated', { customer_id: customerId });
          } catch (_) {}

          return res.json({
            success: true,
            message: 'Invoice updated and recalculations verified',
            id: id,
            grand_total: calculatedGrandTotal,
            subtotal: calculatedSubtotal,
            total_gst: calculatedGst,
            total_discount: calculatedDiscount,
            items: serverCalc.items
          });
        } else {
          // No products provided, update metadata only (date, due_date)
          const updateStmt = db.prepare(`
            UPDATE invoices 
            SET customer_id = COALESCE(?, customer_id),
                due_date = COALESCE(?, due_date),
                invoice_date = COALESCE(?, invoice_date),
                last_edited_by_user_id = COALESCE(?, last_edited_by_user_id),
                updated_at = datetime('now')
            WHERE id = ?
          `);

          updateStmt.run(
            customerId,
            due_date,
            invoice_date,
            editorId,
            id
          );

          try {
            dataBus.broadcast('billing:invoice', 'updated', { id, customer_id: customerId });
            dataBus.broadcast('billing:ledger', 'updated', { customer_id: customerId });
          } catch (_) {}

          return res.json({
            success: true,
            message: 'Invoice metadata updated',
            id: id
          });
        }
      } catch (error) {
        console.error('Error updating bill:', error);
        res.status(500).json({ error: error.message });
      }
    },

    // Delete invoice
    deleteBill: (req, res) => {
      try {
        const { id } = req.params;

        // Get invoice details before deleting (for confirmation info)
        const invoice = db.prepare(`
          SELECT i.id, i.customer_id, i.invoice_no, i.grand_total, c.name as customer_name
          FROM invoices i
          LEFT JOIN contacts c ON i.customer_id = c.id
          WHERE i.id = ?
        `).get(id);

        if (!invoice) {
          return res.status(404).json({ error: 'Invoice not found' });
        }

        if (invoice.customer_id && !isCustomerAccessible(req, invoice.customer_id)) {
          return res.status(403).json({ error: 'Access denied to delete this invoice' });
        }

        const customer_id = invoice.customer_id;

        // Delete invoice items
        const deleteItemsStmt = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
        deleteItemsStmt.run(id);

        // Delete invoice
        const deleteInvoiceStmt = db.prepare('DELETE FROM invoices WHERE id = ?');
        const result = deleteInvoiceStmt.run(id);

        // Recalculate customer's current_due
        const totals = db.prepare(`
          SELECT 
            COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = ?), 0) as total_debit,
            COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = ? AND type = 'PAYMENT'), 0) +
            COALESCE((SELECT SUM(credit_amount) FROM payments WHERE customer_id = ? AND type = 'CREDIT_NOTE'), 0) as total_credit
        `).get(customer_id, customer_id, customer_id);

        const current_due = totals.total_debit - totals.total_credit;

        // Update ledger record for this customer
        const updateLedgerStmt = db.prepare(`
          UPDATE ledger 
          SET current_due = ?,
              updated_at = datetime('now')
          WHERE customer_id = ?
        `);
        updateLedgerStmt.run(current_due, customer_id);

        try {
          dataBus.broadcast('billing:invoice', 'deleted', { id: invoice.id, customer_id });
          dataBus.broadcast('billing:ledger', 'updated', { customer_id });
        } catch (_) {}

        res.json({
          success: true,
          message: 'Invoice deleted successfully',
          deleted: {
            id: invoice.id,
            invoice_no: invoice.invoice_no,
            amount: invoice.grand_total
          },
          current_due
        });
      } catch (error) {
        console.error('Error deleting bill:', error);
        res.status(500).json({ error: error.message });
      }
    },

    // Convert order to invoice server-authoritatively
    convertOrderToInvoice: (req, res) => {
      try {
        const orderId = req.params.id;
        const order = db.prepare(`
          SELECT o.*, c.name as customer_name, c.phone as customer_phone
          FROM orders o
          LEFT JOIN contacts c ON o.customer_id = c.id
          WHERE o.id = ?
        `).get(orderId);

        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        if (order.customer_id && !isCustomerAccessible(req, order.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this order' });
        }

        // Fetch order items with variant/batch info
        const orderItems = db.prepare(`
          SELECT oi.*, p.name as product_name, v.pack_size_value, v.pack_size_type, b.batch_no, b.exp_date, b.mrp
          FROM order_items oi
          LEFT JOIN products p ON oi.product_id = p.id
          LEFT JOIN variants v ON oi.variant_id = v.id
          LEFT JOIN batches b ON oi.batch_id = b.id
          WHERE oi.order_id = ?
        `).all(orderId);

        if (!orderItems || orderItems.length === 0) {
          return res.status(400).json({ error: 'Order has no items to convert to invoice' });
        }

        // Map order items to calculation input items
        const rawItems = orderItems.map(oi => ({
          product_id: oi.product_id,
          product_name: oi.product_name,
          variant_id: oi.variant_id,
          batch_id: oi.batch_id,
          pack_value: oi.pack_size_value || oi.pack_value,
          pack_type: oi.pack_size_type || oi.pack_type,
          batch_no: oi.batch_no,
          exp_date: oi.exp_date,
          qty: oi.quantity !== undefined ? oi.quantity : (oi.qty || 1),
          rate: oi.unit_price !== undefined ? oi.unit_price : (oi.rate || oi.price || oi.mrp || 0),
          mrp: oi.mrp || oi.rate || 0,
          disc1: oi.discount_1_percent || 0,
          disc2: oi.discount_2_percent || 0,
          gst_percent: oi.gst_percent || 0
        }));

        const serverCalc = calculator.calculateBillItemsAndSummary(db, {
          customerId: order.customer_id,
          items: rawItems,
          roundOffEnabled: true,
          user: req.user
        });

        // Generate invoice number
        const finalInvoiceNo = generateNewInvoiceNumber(db, order.customer_id, serverCalc.summary.total_gst);
        const creatorId = req.user ? (req.user.id || req.user.userId) : order.created_by_user_id;

        // Insert invoice
        const invoiceStmt = db.prepare(`
          INSERT INTO invoices 
          (customer_id, invoice_no, due_date, total_amount, total_discount, total_gst, 
           round_off, grand_total, previous_due, invoice_date, created_by_user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const invoiceResult = invoiceStmt.run(
          order.customer_id,
          finalInvoiceNo,
          null,
          serverCalc.summary.subtotal,
          serverCalc.summary.total_discount,
          serverCalc.summary.total_gst,
          serverCalc.summary.round_off,
          serverCalc.summary.grand_total,
          serverCalc.previous_due,
          new Date().toISOString().slice(0, 10),
          creatorId
        );

        const invoiceId = invoiceResult.lastInsertRowid;

        // Insert invoice line items
        const itemStmt = db.prepare(`
          INSERT INTO invoice_items
          (invoice_id, product_id, variant_id, batch_id, pack_value, pack_type, batch_no, 
           exp_date, qty, scheme, free, mrp, rate, amount, discount_1_percent, discount_1_amount,
           discount_2_percent, discount_2_amount, gst_percent, gst_amount, sgst_amount, cgst_amount,
           final_amount, gst_reverse, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        serverCalc.items.forEach(item => {
          itemStmt.run(
            invoiceId,
            item.product_id,
            item.variant_id,
            item.batch_id,
            item.pack_value,
            item.pack_type,
            item.batch_no,
            item.exp_date,
            item.qty,
            item.scheme,
            item.free,
            item.mrp || item.rate || 0,
            item.rate,
            item.amount,
            item.discount_1_percent,
            item.discount_1_amount,
            item.discount_2_percent,
            item.discount_2_amount,
            item.gst_percent,
            item.gst_amount,
            item.sgst_amount,
            item.cgst_amount,
            item.final_amount,
            item.gst_reverse ? 1 : 0
          );
        });

        // Update order state to Stage 3 (Fulfilled) and attach bill reference
        db.prepare(`
          UPDATE orders 
          SET current_stage = 'stage3',
              status = 'completed',
              bill_reference = ?,
              delivery_date = COALESCE(delivery_date, datetime('now')),
              last_edited_by_user_id = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(finalInvoiceNo, creatorId, orderId);

        dataBus.broadcast('billing:invoice', 'created', {
          id: invoiceId,
          customer_id: order.customer_id,
          grand_total: serverCalc.summary.grand_total
        });
        dataBus.broadcast('billing:ledger', 'updated', { customer_id: order.customer_id });
        dataBus.broadcast('orders:order', 'updated', { id: orderId });

        // Audit log
        activityLogger.logActivity(req, {
          module: 'billing',
          action: 'convert_order',
          resourceType: 'order',
          resourceId: orderId,
          resourceName: order.order_number,
          metadata: { invoice_id: invoiceId, invoice_no: finalInvoiceNo, grand_total: serverCalc.summary.grand_total }
        });

        res.json({
          success: true,
          message: 'Order successfully converted to invoice ' + finalInvoiceNo,
          invoice_id: invoiceId,
          invoice_no: finalInvoiceNo,
          grand_total: serverCalc.summary.grand_total,
          order_id: orderId
        });
      } catch (err) {
        console.error('Error converting order to invoice:', err);
        res.status(500).json({ error: 'Failed to convert order to invoice: ' + err.message });
      }
    },

    // Get billing summary
    getBillingSummary: (req, res) => {
      try {
        const { customer_id, start_date, end_date } = req.query;
        const workerScope = getWorkerContactScope(req, 'c');

        let sql = `
          SELECT 
            COUNT(i.id) as total_invoices,
            SUM(i.grand_total) as total_amount,
            SUM(i.total_discount) as total_discount,
            SUM(i.total_gst) as total_tax,
            AVG(i.grand_total) as average_invoice,
            MIN(i.created_at) as earliest_date,
            MAX(i.created_at) as latest_date
          FROM invoices i
          JOIN contacts c ON i.customer_id = c.id
          WHERE 1=1
        `;
        const params = [];

        if (customer_id) {
          sql += ' AND i.customer_id = ?';
          params.push(customer_id);
        } else if (workerScope) {
          const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
          sql += ` AND ${workerScope} AND c.id NOT IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}' AND exclude_from_stats = 1)`;
        } else {
          sql += ' AND c.exclude_from_stats = 0';
        }

        if (start_date) {
          sql += ' AND created_at >= ?';
          params.push(start_date);
        }

        if (end_date) {
          sql += ' AND created_at <= ?';
          params.push(end_date);
        }

        const stmt = db.prepare(sql);
        const summary = stmt.get(...params);

        res.json({
          success: true,
          data: summary || {
            total_invoices: 0,
            total_amount: 0,
            total_discount: 0,
            total_tax: 0,
            average_invoice: 0
          }
        });
      } catch (error) {
        console.error('Error getting summary:', error);
        res.status(500).json({ error: error.message });
      }
    },

    // Server-authoritative Dashboard Metrics (for Android & Web parity)
    getDashboardMetrics: (req, res) => {
      try {
        const { preset, start_date, end_date, customer_id } = req.query;
        const response = billingDepartment.getDashboardMetrics(db, req.user, {
          preset: preset || 'all',
          startDate: start_date,
          endDate: end_date,
          customerId: customer_id,
          requestId: req.requestId
        });

        if (req.headers['x-client-platform'] === 'android') {
          return res.json(response);
        }

        res.json(response);
      } catch (error) {
        console.error('Error calculating dashboard metrics:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    },

    // Get all customers with their ledger balances and financial metrics
    getLedgerCustomers: (req, res) => {
      try {
        const isWorker = req.user && req.user.role === 'worker';
        const safeUserId = isWorker ? String(req.user.id || req.user.userId).replace(/'/g, "''") : null;
        const workerScope = getWorkerContactScope(req, 'c');
        const scopeClause = workerScope ? ` AND ${workerScope}` : '';

        const selectExclude = isWorker
          ? `COALESCE(uca.exclude_from_stats, 0) as exclude_from_stats`
          : `c.exclude_from_stats`;

        const joinUca = isWorker
          ? `LEFT JOIN user_contact_access uca ON uca.contact_id = c.id AND uca.user_id = '${safeUserId}'`
          : '';

        // Get all customers with ledger entries only (those with actual invoices/payments)
        const customers = db.prepare(`
          SELECT 
            c.id,
            c.name,
            c.phone,
            c.opening_balance,
            c.ledger_token,
            ${selectExclude},
            c.active,
            c.last_activity,
            COALESCE(l.current_due, 0) as current_due,
            COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = c.id), 0) as total_debit,
            COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = c.id AND type = 'PAYMENT'), 0) +
            COALESCE((SELECT SUM(credit_amount) FROM payments WHERE customer_id = c.id AND type = 'CREDIT_NOTE'), 0) as total_credit,
            COALESCE(l.total_bills, 0) as total_bills,
            COALESCE(l.total_payments, 0) as total_payments,
            l.updated_at as ledger_updated_at,
            (SELECT MAX(COALESCE(invoice_date, created_at)) FROM invoices WHERE customer_id = c.id) as last_bill_date,
            (SELECT MAX(COALESCE(payment_date, created_at)) FROM payments WHERE customer_id = c.id AND type = 'PAYMENT') as last_payment_date,
            COALESCE(u_creator.role, 'owner') as created_by_role,
            COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
            u_editor.role as last_edited_by_role,
            COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name

          FROM contacts c
          ${joinUca}
          LEFT JOIN users u_creator ON c.created_by_user_id = u_creator.id
          LEFT JOIN users u_editor ON c.last_edited_by_user_id = u_editor.id
          LEFT JOIN ledger l ON c.id = l.customer_id
          WHERE (c.type IS NULL OR LOWER(c.type) = 'customer')
            AND (l.id IS NOT NULL OR COALESCE(c.opening_balance, 0) != 0)
            ${scopeClause}
          ORDER BY c.name ASC
        `).all();

        // Format response for ledger view - include opening balance in total due calculation
        const formattedCustomers = customers.map(c => {
          const openingBalance = Number(c.opening_balance) || 0;
          const currentDue = Number(c.current_due) || 0;
          const amountDueWithOpening = currentDue + openingBalance;
          
          // Calculate days overdue (grace period of 30 days)
          let daysOverdue = 0;
          if (amountDueWithOpening > 0 && c.last_bill_date) {
            const lastBill = new Date(c.last_bill_date);
            const daysSinceBill = Math.floor((new Date() - lastBill) / (1000 * 60 * 60 * 24));
            daysOverdue = Math.max(0, daysSinceBill - 30);
          }

          const status = daysOverdue > 0 ? 'OVERDUE' : (amountDueWithOpening > 0 ? 'DUE' : (amountDueWithOpening < 0 ? 'CREDIT' : 'CLEAR'));
          const token = c.ledger_token || getOrCreateCustomerLedgerToken(db, c.id);

          return {
            customerId: String(c.id),
            customer_id: c.id,
            customerName: c.name,
            phone: c.phone || null,
            opening_balance: openingBalance,
            exclude_from_stats: Boolean(c.exclude_from_stats),
            excludeFromStats: Boolean(c.exclude_from_stats),
            amountDue: amountDueWithOpening,
            balance: amountDueWithOpening,
            status: status,
            current_due: c.current_due,
            total_debit: c.total_debit || 0,
            total_credit: c.total_credit || 0,
            total_outstanding: amountDueWithOpening, // Total due including opening balance
            total_bills: c.total_bills,
            total_payments: c.total_payments,
            daysOverdue: daysOverdue,
            days_overdue: daysOverdue,
            lastBillDate: c.last_bill_date || null,
            last_bill_date: c.last_bill_date || null,
            lastPaymentDate: c.last_payment_date || null,
            last_payment_date: c.last_payment_date || null,
            active: c.active || 'ACTIVE',
            last_activity: c.last_activity,
            created_by_role: c.created_by_role,
            created_by_name: c.created_by_name,
            last_edited_by_role: c.last_edited_by_role,
            last_edited_by_name: c.last_edited_by_name,
            ledger_token: token,
            ledgerToken: token,
            token: token,
            share_url: `https://mac.faizal.uk/ledger/${token}`
          };
        });

        const isAndroidClient = req.headers['x-client-platform'] === 'android' || req.query.format === 'array';
        if (isAndroidClient && !req.query.format_object) {
          return res.json(formattedCustomers);
        }

        res.json({
          success: true,
          data: formattedCustomers,
          count: formattedCustomers.length
        });
      } catch (error) {
        console.error('Error getting ledger customers:', error);
        res.status(500).json({ error: error.message });
      }
    },

    // Get public ledger for a specific customer (backward-compatible with web customer-ledger.js)
    getPublicLedger: (req, res) => {
      try {
        const identifier = req.params.customerId || req.params.token || req.query.token || req.query.id;
        if (!identifier) {
          return res.status(400).json({ success: false, error: 'Customer identifier is required' });
        }

        // Require unguessable token for unauthenticated public requests to prevent IDOR enumeration
        const isAuth = Boolean(req.user);
        const response = billingDepartment.getCustomerStatement(db, identifier, req.user, {
          requestId: req.requestId,
          tokenOnly: !isAuth
        });

        if (!response.success) {
          return res.status(response.error?.status || 404).json(response.error || { error: 'Ledger not found or invalid link' });
        }

        return res.json({
          success: true,
          data: response.data?.raw || response.data,
          meta: response.meta
        });
      } catch (error) {
        console.error('Error getting public ledger:', error);
        res.status(500).json({ error: 'Failed to load ledger data' });
      }
    },

    // Server-authoritative Customer Statement of Account endpoint
    getCustomerStatement: (req, res) => {
      try {
        const customerId = req.params.id || req.params.customerId;
        const calculator = require('../../../core/billing/calculator');
        const statement = calculator.calculateCustomerStatement(db, customerId, req.user);

        if (!statement.success) {
          return res.status(statement.error === 'Customer not found' ? 404 : 403).json(buildCustomerStatementResponse(statement, req.requestId));
        }

        const response = buildCustomerStatementResponse(statement, req.requestId);
        return res.json(response);
      } catch (error) {
        console.error('Error getting customer statement:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    },

    // ============= CUSTOMER PREFERENCES (Product Memory) =============

    // Get preference for a customer/product
    getPreference: (req, res) => {
      try {
        const { customerName, productName } = req.params;
        
        // Find customer by name
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName.trim());
        if (!customer) {
          return res.json({
            status: 'not_found',
            data: null
          });
        }

        if (!isCustomerAccessible(req, customer.id)) {
          return res.json({
            status: 'not_found',
            data: null
          });
        }

        // Find product by name
        const product = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(productName.trim());
        if (!product) {
          return res.json({
            status: 'not_found',
            data: null
          });
        }

        const stmt = db.prepare(`
          SELECT id, discount_1, discount_2, scheme, tax_percent, gst_reverse, created_at, updated_at
          FROM customer_item_memory
          WHERE customer_id = ? AND product_id = ?
        `);
        
        const preference = stmt.get(customer.id, product.id);
        
        if (preference) {
          res.json({
            status: 'success',
            data: {
              id: preference.id,
              disc1: preference.discount_1,
              disc2: preference.discount_2,
              scheme: preference.scheme,
              tax: preference.tax_percent,
              gst_reverse: preference.gst_reverse === 1,
              last_updated: preference.updated_at
            }
          });
        } else {
          res.json({
            status: 'not_found',
            data: null
          });
        }
      } catch (error) {
        console.error('Error fetching preference:', error);
        res.status(500).json({
          status: 'error',
          message: error.message
        });
      }
    },

    // Get all preferences for a customer
    getCustomerPreferences: (req, res) => {
      try {
        const { customerName } = req.params;
        
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName.trim());
        if (!customer || !isCustomerAccessible(req, customer.id)) {
          return res.json({
            status: 'success',
            data: []
          });
        }
        
        const stmt = db.prepare(`
          SELECT 
            cm.id,
            p.name as product_name,
            cm.discount_1,
            cm.discount_2,
            cm.scheme,
            cm.tax_percent,
            cm.updated_at
          FROM customer_item_memory cm
          JOIN products p ON cm.product_id = p.id
          WHERE cm.customer_id = ?
          ORDER BY p.name
        `);
        
        const preferences = stmt.all(customer.id);
        
        res.json({
          status: 'success',
          data: preferences
        });
      } catch (error) {
        console.error('Error fetching customer preferences:', error);
        res.status(500).json({
          status: 'error',
          message: error.message
        });
      }
    },

    // Get invoice items purchased by customer (for suggestions / order creation)
    getCustomerBillItems: (req, res) => {
      try {
        const { customerName } = req.params;
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName.trim());
        if (!customer || !isCustomerAccessible(req, customer.id)) {
          return res.json({
            success: true,
            data: []
          });
        }

        const items = db.prepare(`
          SELECT ii.*, p.name as product_name, i.invoice_date, i.created_at
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.id
          LEFT JOIN products p ON ii.product_id = p.id
          WHERE i.customer_id = ?
          ORDER BY i.created_at DESC
        `).all(customer.id);

        res.json({
          success: true,
          data: items
        });
      } catch (error) {
        console.error('Error fetching customer bill items:', error);
        res.status(500).json({ error: error.message });
      }
    },

    // Save/Update preference for a customer/product
    savePreference: (req, res) => {
      try {
        const { customerName, productName, disc1, disc2, scheme, tax } = req.body;
        
        if (!customerName || !productName) {
          return res.status(400).json({
            status: 'error',
            message: 'customerName and productName are required'
          });
        }

        // Find customer by name
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName.trim());
        if (!customer) {
          return res.status(404).json({
            status: 'error',
            message: `Customer '${customerName}' not found`
          });
        }

        if (!isCustomerAccessible(req, customer.id)) {
          return res.status(403).json({
            status: 'error',
            message: 'Access denied to this customer'
          });
        }

        // Find product by name
        const product = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(productName.trim());
        if (!product) {
          return res.status(404).json({
            status: 'error',
            message: `Product '${productName}' not found`
          });
        }

        const stmt = db.prepare(`
          INSERT INTO customer_item_memory 
          (customer_id, product_id, discount_1, discount_2, scheme, tax_percent, gst_reverse, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(customer_id, product_id) 
          DO UPDATE SET 
            discount_1 = excluded.discount_1,
            discount_2 = excluded.discount_2,
            scheme = excluded.scheme,
            tax_percent = excluded.tax_percent,
            gst_reverse = excluded.gst_reverse,
            updated_at = datetime('now')
        `);
        
        const result = stmt.run(
          customer.id,
          product.id,
          disc1 || 0,
          disc2 || 0,
          scheme || null,
          tax || 0,
          req.body.gst_reverse ? 1 : 0
        );
        
        res.json({
          status: 'success',
          message: 'Preference saved',
          id: result.lastInsertRowid
        });
      } catch (error) {
        console.error('Error saving preference:', error);
        res.status(500).json({
          status: 'error',
          message: error.message
        });
      }
    },

    // Delete preference
    deletePreference: (req, res) => {
      try {
        const { customerName, productName } = req.params;
        
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName.trim());
        if (!customer) {
          return res.status(404).json({
            status: 'error',
            message: `Customer '${customerName}' not found`
          });
        }

        if (!isCustomerAccessible(req, customer.id)) {
          return res.status(403).json({
            status: 'error',
            message: 'Access denied to this customer'
          });
        }

        const product = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(productName.trim());
        if (!product) {
          return res.status(404).json({
            status: 'error',
            message: `Product '${productName}' not found`
          });
        }
        
        const stmt = db.prepare(`
          DELETE FROM customer_item_memory
          WHERE customer_id = ? AND product_id = ?
        `);
        
        const result = stmt.run(customer.id, product.id);
        
        res.json({
          status: 'success',
          message: 'Preference deleted',
          changes: result.changes
        });
      } catch (error) {
        console.error('Error deleting preference:', error);
        res.status(500).json({
          status: 'error',
          message: error.message
        });
      }
    },

    // Preview invoice as PDF (for inline display) - Returns JPG
    previewInvoicePDF: (req, res) => {
      try {
        const { invoiceNo, invoiceId, duplex } = req.body;
        if (!invoiceNo && !invoiceId) {
          return res.status(400).json({ error: 'invoiceNo or invoiceId is required' });
        }

        // Validate invoice exists - Prefer ID if provided
        let invoice;
        if (invoiceId) {
          invoice = db.prepare('SELECT id, customer_id, invoice_no, invoice_date, created_at FROM invoices WHERE id = ?').get(invoiceId);
        } else {
          invoice = db.prepare('SELECT id, customer_id, invoice_no, invoice_date, created_at FROM invoices WHERE invoice_no = ? OR CAST(id AS TEXT) = ?').get(invoiceNo, invoiceNo);
        }
        if (!invoice) {
          return res.status(404).json({ error: `Invoice not found: ${invoiceId || invoiceNo}` });
        }

        if (invoice.customer_id && !isCustomerAccessible(req, invoice.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this invoice' });
        }

        // Get database path
        const dbPath = getDatabasePath();
        
        // Check account/customer duplex preference for export/preview (decoupled per user and customer)
        let finalDuplex = duplex;
        if (!finalDuplex) {
          finalDuplex = getCustomerDuplexPreference(req, invoice.customer_id);
        }
        if (!finalDuplex) {
          try {
            const setting = db.prepare("SELECT value FROM Settings WHERE key = 'invoice_duplex_print'").get();
            finalDuplex = (setting && setting.value === 'false') ? 'no' : 'yes';
          } catch (_) {
            finalDuplex = 'yes';
          }
        }
        
        // Generate PDF using native Rust SuiteCore engine
        const pdfPath = generateInvoicePDF(dbPath, invoice.id, finalDuplex, 'print');
        console.log('PDF generated:', pdfPath);
        
        // Convert to JPG
        const jpgPath = convertPDFToJPG(pdfPath);
        console.log('JPG generated:', jpgPath);
        
        // Read JPG and send as response
        const jpgData = fs.readFileSync(jpgPath);
        
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `inline; filename="${invoiceNo}.jpg"`);
        res.send(jpgData);
        
        // Clean up old temp files (keep recent ones)
        setTimeout(() => {
          try {
            const tempDir = getTempDir();
            const files = fs.readdirSync(tempDir);
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            
            files.forEach(file => {
              const filePath = path.join(tempDir, file);
              const fileStat = fs.statSync(filePath);
              if (now - fileStat.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
              }
            });
          } catch (err) {
            console.error('Error cleaning up temp files:', err);
          }
        }, 1000);
        
      } catch (error) {
        console.error('Error generating preview PDF:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
          error: error.message,
          details: error.stack 
        });
      }
    },

    // Export invoice as PDF (for download)
    exportInvoicePDF: (req, res) => {
      try {
        const { invoiceNo, invoiceId, duplex } = req.body;
        
        if (!invoiceNo && !invoiceId) {
          return res.status(400).json({ error: 'invoiceNo or invoiceId is required' });
        }

        // Validate invoice exists - Prefer ID if provided
        let invoice;
        if (invoiceId) {
          invoice = db.prepare('SELECT id, customer_id, invoice_no, invoice_date, created_at FROM invoices WHERE id = ?').get(invoiceId);
        } else {
          invoice = db.prepare('SELECT id, customer_id, invoice_no, invoice_date, created_at FROM invoices WHERE invoice_no = ? OR CAST(id AS TEXT) = ?').get(invoiceNo, invoiceNo);
        }
        if (!invoice) {
          return res.status(404).json({ error: `Invoice not found: ${invoiceId || invoiceNo}` });
        }

        if (invoice.customer_id && !isCustomerAccessible(req, invoice.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this invoice' });
        }

        // Get database path
        const dbPath = getDatabasePath();
        
        // Check account/customer duplex preference for export (decoupled per user and customer)
        let finalDuplex = duplex;
        if (!finalDuplex) {
          finalDuplex = getCustomerDuplexPreference(req, invoice.customer_id);
        }
        if (!finalDuplex) {
          try {
            const setting = db.prepare("SELECT value FROM Settings WHERE key = 'invoice_duplex_print'").get();
            finalDuplex = (setting && setting.value === 'false') ? 'no' : 'yes';
          } catch (_) {
            finalDuplex = 'yes';
          }
        }
        
        // Generate PDF using native Rust SuiteCore engine in export mode
        const pdfPath = generateInvoicePDF(dbPath, invoice.id, finalDuplex, 'export');
        console.log('PDF generated (export mode):', pdfPath);
        
        // Read PDF and send as response
        const pdfData = fs.readFileSync(pdfPath);
        
        const serial = getAnnualSerialNumber(db, invoice.id);
        const dateStr = formatDateStr(invoice.invoice_date || invoice.created_at);
        const fileName = `${serial}.Invoice ${dateStr}`;

        const isAndroid = (req.get('x-client-platform') || '').toLowerCase() === 'android' ||
                          req.get('x-app-type') === 'native_android' ||
                          (req.get('accept') || '').includes('application/pdf');

        if (isAndroid) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
          return res.send(pdfData);
        }
        
        res.json({
          pdf: pdfData.toString('base64'),
          fileName: `${fileName}.pdf`
        });
        
      } catch (error) {
        console.error('Error generating export PDF:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
          error: error.message,
          details: error.stack 
        });
      }
    },

    // Print invoice as PDF
    printInvoicePDF: (req, res) => {
      try {
        const { invoiceNo, invoiceId, duplex } = req.query;
        
        if (!invoiceNo && !invoiceId) {
          return res.status(400).json({ error: 'invoiceNo or invoiceId is required' });
        }

        // Validate invoice exists - Prefer ID if provided
        let invoice;
        if (invoiceId) {
          invoice = db.prepare('SELECT id, customer_id, invoice_no, invoice_date, created_at FROM invoices WHERE id = ?').get(invoiceId);
        } else {
          invoice = db.prepare('SELECT id, customer_id, invoice_no, invoice_date, created_at FROM invoices WHERE invoice_no = ? OR CAST(id AS TEXT) = ?').get(invoiceNo, invoiceNo);
        }
        if (!invoice) {
          return res.status(404).json({ error: `Invoice not found: ${invoiceId || invoiceNo}` });
        }

        if (invoice.customer_id && !isCustomerAccessible(req, invoice.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this invoice' });
        }

        // Get database path
        const dbPath = getDatabasePath();
        
        // Force duplex mode ON for all print operations
        const pdfPath = generateInvoicePDF(dbPath, invoice.id, 'yes', 'print');
        console.log('PDF generated (print mode, forced duplex):', pdfPath);
        
        // Read PDF and convert to base64
        const pdfData = fs.readFileSync(pdfPath);
        const pdfBase64 = pdfData.toString('base64');
        
        // Get formatted invoice name
        const serial = getAnnualSerialNumber(db, invoice.id);
        const dateStr = formatDateStr(invoice.invoice_date || invoice.created_at);
        const fileName = `${serial}.Invoice ${dateStr}`;
        
        // Return HTML page that embeds PDF and triggers print dialog
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${fileName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body { 
            margin: 0; 
            padding: 0; 
            overflow: hidden; 
            background: white; 
            width: 100vw;
            height: 100vh;
        }
        #pdf-container { 
            width: 100vw; 
            height: 100vh; 
            border: none;
            display: block;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
            }
            #pdf-container {
                width: 100%;
                height: 100%;
                margin: 0;
                padding: 0;
                border: none;
            }
        }
    </style>
</head>
<body>
    <iframe id="pdf-container" src="data:application/pdf;base64,${pdfBase64}"></iframe>
</body>
</html>`;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}.html"`);
        res.send(htmlContent);
        
      } catch (error) {
        console.error('Error generating print PDF:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
          error: error.message,
          details: error.stack 
        });
      }
    },

    // ============= PAYMENT/CREDIT NOTE PDF =============
    
    exportPaymentPDF: (req, res) => {
      try {
        const { paymentId } = req.body;
        
        if (!paymentId) {
          return res.status(400).json({ error: 'paymentId is required' });
        }

        // Fetch record type, customer_id and date
        const paymentRecord = db.prepare('SELECT type, customer_id, created_at FROM payments WHERE id = ?').get(paymentId);
        if (!paymentRecord) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        if (paymentRecord.customer_id && !isCustomerAccessible(req, paymentRecord.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this payment' });
        }

        const dbPath = getDatabasePath();
        
        const pdfPath = generatePaymentPDF(dbPath, paymentId, { export_mode: true });
        const pdfBuffer = fs.readFileSync(pdfPath);
        
        const isCreditNote = paymentRecord && paymentRecord.type === 'CREDIT_NOTE';
        const docPrefix = isCreditNote ? 'Credit Note' : 'Payment';
        const dateStr = paymentRecord ? paymentRecord.created_at : null;
        const fileName = `${docPrefix} ${formatDateStr(dateStr)}`;

        const isAndroid = (req.get('x-client-platform') || '').toLowerCase() === 'android' ||
                          req.get('x-app-type') === 'native_android' ||
                          (req.get('accept') || '').includes('application/pdf');

        if (isAndroid) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
          return res.send(pdfBuffer);
        }
        
        res.json({
          pdf: pdfBuffer.toString('base64'),
          fileName: `${fileName}.pdf`
        });
        
        // Clean up temp file asynchronously
        setImmediate(() => {
          try {
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
            }
          } catch (e) {
            console.warn('Could not clean up temp PDF:', e.message);
          }
        });

      } catch (error) {
        console.error('Payment PDF Export Error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
          error: error.message,
          details: error.stack 
        });
      }
    },

    previewPaymentPDF: (req, res) => {
      try {
        const { paymentId } = req.body;
        
        if (!paymentId) {
          return res.status(400).json({ error: 'paymentId is required' });
        }

        const paymentRecord = db.prepare('SELECT customer_id FROM payments WHERE id = ?').get(paymentId);
        if (!paymentRecord) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        if (paymentRecord.customer_id && !isCustomerAccessible(req, paymentRecord.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this payment' });
        }

        const dbPath = getDatabasePath();
        
        const pdfPath = generatePaymentPDF(dbPath, paymentId, { export_mode: true });
        const jpgPath = convertPDFToJPG(pdfPath);
        const jpgBuffer = fs.readFileSync(jpgPath);
        
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(jpgBuffer);
        
        // Clean up temp files asynchronously
        setImmediate(() => {
          try {
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
            }
            if (fs.existsSync(jpgPath)) {
              fs.unlinkSync(jpgPath);
            }
          } catch (e) {
            console.warn('Could not clean up temp files:', e.message);
          }
        });

      } catch (error) {
        console.error('Payment PDF Preview Error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
          error: error.message,
          details: error.stack 
        });
      }
    },

    previewOpeningBalancePDF: (req, res) => {
      try {
        const { customerName } = req.body;
        if (!customerName) {
          return res.status(400).json({ error: 'customerName is required' });
        }

        const contact = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName.trim());
        if (contact && !isCustomerAccessible(req, contact.id)) {
          return res.status(403).json({ error: 'Access denied to this customer' });
        }

        const dbPath = getDatabasePath();
        const pdfPath = generateOpeningBalancePDF(dbPath, customerName, { export_mode: true });
        const jpgPath = convertPDFToJPG(pdfPath);
        const jpgBuffer = fs.readFileSync(jpgPath);
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(jpgBuffer);
        setImmediate(() => {
          try {
            if (fs.existsSync(pdfPath)) { fs.unlinkSync(pdfPath); }
            if (fs.existsSync(jpgPath)) { fs.unlinkSync(jpgPath); }
          } catch (e) { console.warn('Could not clean up temp files:', e.message); }
        });
      } catch (error) {
        console.error('Opening Balance PDF Preview Error:', error.message);
        res.status(500).json({ error: error.message, details: error.stack });
      }
    },

    printPaymentPDF: (req, res) => {
      try {
        const paymentId = req.query.paymentId;
        
        if (!paymentId) {
          return res.status(400).json({ error: 'paymentId query parameter is required' });
        }

        const paymentRecord = db.prepare('SELECT type, customer_id, created_at FROM payments WHERE id = ?').get(paymentId);
        if (!paymentRecord) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        if (paymentRecord.customer_id && !isCustomerAccessible(req, paymentRecord.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this payment' });
        }

        const dbPath = getDatabasePath();
        
        const pdfPath = generatePaymentPDF(dbPath, paymentId, { export_mode: false });
        const pdfBuffer = fs.readFileSync(pdfPath);
        const base64PDF = pdfBuffer.toString('base64');
        const isCreditNote = paymentRecord && paymentRecord.type === 'CREDIT_NOTE';
        const docPrefix = isCreditNote ? 'Credit Note' : 'Payment';
        const dateStr = paymentRecord ? paymentRecord.created_at : null;
        const fileName = `${docPrefix} ${formatDateStr(dateStr)}`;
        
        // Return HTML with embedded PDF for print
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>${fileName}</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; }
    #pdfViewer { width: 100vw; height: 100vh; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js"></script>
</head>
<body>
  <iframe id="pdfViewer" src="data:application/pdf;base64,${base64PDF}" type="application/pdf"></iframe>
</body>
</html>`;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}.html"`);
        res.send(htmlContent);
        
        // Clean up temp file asynchronously
        setImmediate(() => {
          try {
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
            }
          } catch (e) {
            console.warn('Could not clean up temp PDF:', e.message);
          }
        });

      } catch (error) {
        console.error('Payment PDF Print Error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
          error: error.message,
          details: error.stack 
        });
      }
    },

    exportOpeningBalancePDF: (req, res) => {
      try {
        const { customerName } = req.body;
        if (!customerName) {
          return res.status(400).json({ error: 'customerName is required' });
        }

        const contactRecord = db.prepare('SELECT id, created_at FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName.trim());
        if (contactRecord && !isCustomerAccessible(req, contactRecord.id)) {
          return res.status(403).json({ error: 'Access denied to this customer' });
        }

        const dbPath = getDatabasePath();
        const pdfPath = generateOpeningBalancePDF(dbPath, customerName, { export_mode: true });
        const pdfBuffer = fs.readFileSync(pdfPath);
        
        const dateStr = contactRecord ? contactRecord.created_at : null;
        const fileName = `Opening Balance ${formatDateStr(dateStr)}`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
        res.send(pdfBuffer);
        setImmediate(() => {
          try {
            if (fs.existsSync(pdfPath)) { fs.unlinkSync(pdfPath); }
          } catch (e) {
            console.warn('Could not clean up temp PDF:', e.message);
          }
        });
      } catch (error) {
        console.error('Opening Balance PDF Export Error:', error.message);
        res.status(500).json({ error: error.message, details: error.stack });
      }
    },

    printOpeningBalancePDF: (req, res) => {
      try {
        const customerName = req.query.customerName || req.body.customerName;
        if (!customerName) {
          return res.status(400).json({ error: 'customerName is required' });
        }

        const contactRecord = db.prepare('SELECT id, created_at FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName.trim());
        if (contactRecord && !isCustomerAccessible(req, contactRecord.id)) {
          return res.status(403).json({ error: 'Access denied to this customer' });
        }

        const dbPath = getDatabasePath();
        const pdfPath = generateOpeningBalancePDF(dbPath, customerName, { export_mode: false });
        const pdfBuffer = fs.readFileSync(pdfPath);
        const base64PDF = pdfBuffer.toString('base64');
        
        const dateStr = contactRecord ? contactRecord.created_at : null;
        const fileName = `Opening Balance ${formatDateStr(dateStr)}`;
        
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>${fileName}</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; }
    #pdfViewer { width: 100vw; height: 100vh; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js"></script>
</head>
<body>
  <iframe id="pdfViewer" src="data:application/pdf;base64,${base64PDF}" type="application/pdf"></iframe>
</body>
</html>`;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}.html"`);
        res.send(htmlContent);
        
        // Clean up temp file asynchronously
        setImmediate(() => {
          try {
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
            }
          } catch (e) {
            console.warn('Could not clean up temp PDF:', e.message);
          }
        });

      } catch (error) {
        console.error('Opening Balance PDF Print Error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
          error: error.message,
          details: error.stack 
        });
      }
    },

    // Get bill items for a customer (for purchase history/recommendations in new orders)
    getCustomerBillItems: (req, res) => {
      try {
        const { customerName } = req.params;
        
        if (!customerName) {
          return res.status(400).json({ error: 'customerName is required' });
        }

        // Find customer by name
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName);
        if (!customer) {
          return res.json({ data: [] });
        }

        // Get all invoice items for this customer
        const billItems = db.prepare(`
          SELECT 
            ii.id,
            ii.product_id,
            ii.qty,
            ii.amount,
            ii.discount_1_amount,
            ii.discount_2_amount,
            i.invoice_no,
            i.created_at as invoice_date,
            p.id as product_id_ref,
            p.name as product_name
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.id
          JOIN products p ON ii.product_id = p.id
          WHERE i.customer_id = ?
          ORDER BY i.created_at DESC
        `).all(customer.id);

        res.json({
          success: true,
          data: billItems.map(item => ({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            qty: item.qty,
            amount: item.amount,
            discount_1_amount: item.discount_1_amount,
            discount_2_amount: item.discount_2_amount,
            invoice_no: item.invoice_no,
            invoice_date: item.invoice_date,
            timestamp: new Date(item.invoice_date).getTime()
          }))
        });
      } catch (error) {
        console.error('Error getting customer bill items:', error);
        res.status(500).json({ error: error.message });
      }
    },

    getAppSettings: (req, res) => {
      try {
        db.prepare(`
          CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT NOT NULL UNIQUE,
            setting_value TEXT NOT NULL,
            setting_type TEXT DEFAULT 'string',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();

        const rows = db.prepare('SELECT setting_key, setting_value FROM app_settings').all();
        const app_settings = {};
        for (const row of rows) {
          app_settings[row.setting_key] = row.setting_value;
        }

        const defaults = {
          'invoice_duplex_print': 'true',
          'company_name': 'UTKAL CHEMICAL AUSHADHALAYA',
          'company_gstin': '21AIDPF4446J1ZL',
          'company_pan': 'AIDPF4446J',
          'company_phone': '06822273304 / 943933330',
          'company_address_factory': 'Binaba Marg, Aska, Ganjam, Odisha - 761110',
          'company_address_office': 'D1, Basera Complex, Dumduma, BBSR - 751019',
          'invoice_show_dues_widget': 'true',
          'invoice_auto_sign_disclaimer': 'true',
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
        };

        for (const [k, v] of Object.entries(defaults)) {
          if (app_settings[k] === undefined || app_settings[k] === null) {
            app_settings[k] = v;
          }
        }

        res.json(app_settings);
      } catch (error) {
        console.error('[Billing] getAppSettings error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    saveAppSettings: (req, res) => {
      try {
        db.prepare(`
          CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT NOT NULL UNIQUE,
            setting_value TEXT NOT NULL,
            setting_type TEXT DEFAULT 'string',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();

        const generateId = () => `set_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const settings = req.body.settings || req.body;
        const insertStmt = db.prepare(`
          INSERT INTO app_settings (id, setting_key, setting_value, setting_type, updated_at)
          VALUES (?, ?, ?, 'string', CURRENT_TIMESTAMP)
          ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
        `);

        const transaction = db.transaction(() => {
          for (const [k, v] of Object.entries(settings)) {
            if (k && typeof k === 'string') {
              const strVal = v === null || v === undefined ? '' : String(v);
              insertStmt.run(generateId(), k, strVal);
            }
          }
        });
        transaction();

        res.json({ success: true });
      } catch (error) {
        console.error('[Billing] saveAppSettings error:', error);
        res.status(500).json({ error: error.message });
      }
    }
  };
};

// Helper function to determine if record A is logically strictly prior to record B for ledgers
function isStrictlyPrior(dateA, createdA, idA, dateB, createdB, idB) {
  const normalize = (d, c) => {
    let t = d ? new Date(d) : new Date(c);
    t.setHours(0,0,0,0);
    return t.getTime();
  };
  
  const dayA = normalize(dateA, createdA);
  const dayB = normalize(dateB, createdB);
  
  if (dayA < dayB) return true;
  if (dayA > dayB) return false;
  
  const exactA = new Date(createdA).getTime();
  const exactB = new Date(createdB).getTime();
  if (exactA < exactB) return true;
  if (exactA > exactB) return false;
  
  if (idA !== undefined && idB !== undefined) return idA < idB;
  return false;
}

// Helper function to get calendar year
// For example: March 3, 2026 = 26, April 1, 2026 = 26
function getCalendarYear(date = new Date()) {
  const year = date.getFullYear();
  return year.toString().slice(-2);
}

// Helper function to get calendar year start date
function getCalendarYearStart(date = new Date()) {
  const year = date.getFullYear();
  return new Date(year, 0, 1); // Jan 1 of current year
}

// Helper function to get calendar year end date
function getCalendarYearEnd(date = new Date()) {
  const year = date.getFullYear();
  return new Date(year, 11, 31); // Dec 31 of current year
}

// Helper function to generate NEW invoice numbers in consolidated format
// Format: GST-YYNN#### (if total_gst > 0) or NGST-YYNN#### (if total_gst = 0)
// Where YY = fiscal year, #### = 4-digit serial per customer per fiscal year
// Helper function to extract sequence number from reference
// Extracts last 4 digits from format like GST-260001 → 1, PAY-260002 → 2
function extractSequenceFromReference(refNumber) {
  if (!refNumber) return 0;
  const match = refNumber.match(/(\d{4})$/);
  return match ? parseInt(match[1], 10) : 0;
}

function generateNewInvoiceNumber(db, customerId, totalGst, invoiceDate = null) {
  try {
    const totalGstValue = parseFloat(totalGst || 0);
    const hasGst = totalGstValue > 0;
    const prefix = hasGst ? 'GST' : 'NGST';
    
    // Use invoiceDate if provided, fallback to current date
    const dateObj = invoiceDate ? new Date(invoiceDate) : new Date();
    const yearStr = getCalendarYear(dateObj);
    
    // Use MAX approach with LIKE to find the highest sequence for this year globally
    const maxResult = db.prepare(`
      SELECT invoice_no
      FROM invoices
      WHERE invoice_no LIKE ?
    `).all(`${prefix}-${yearStr}%`);
    
    let maxSequence = 0;
    maxResult.forEach(row => {
      const seq = extractSequenceFromReference(row.invoice_no);
      if (seq > maxSequence) maxSequence = seq;
    });
    
    const nextSequence = maxSequence + 1;
    const sequenceStr = String(nextSequence).padStart(4, '0');
    
    return `${prefix}-${yearStr}${sequenceStr}`;
  } catch (err) {
    console.error('Error generating invoice number:', err);
    return `INV-${Date.now().toString().slice(-8)}`;
  }
}

// Helper function to generate payment reference
// Format: PAY-YY#### where YY = calendar year, #### = 4-digit serial globally per year
function generatePaymentReference(db, customerId, paymentDate = new Date()) {
  try {
    const yearStr = getCalendarYear(paymentDate);
    
    // Use MAX approach with LIKE to find highest global sequence
    const maxResult = db.prepare(`
      SELECT reference_number
      FROM payments
      WHERE type = 'PAYMENT'
        AND reference_number LIKE ?
    `).all(`PAY-${yearStr}%`);
    
    let maxSequence = 0;
    maxResult.forEach(row => {
      const seq = extractSequenceFromReference(row.reference_number);
      if (seq > maxSequence) maxSequence = seq;
    });
    
    const nextSequence = maxSequence + 1;
    const sequenceStr = String(nextSequence).padStart(4, '0');
    
    return `PAY-${yearStr}${sequenceStr}`;
  } catch (err) {
    console.error('Error generating payment reference:', err);
    return `PAY-${Date.now().toString().slice(-8)}`;
  }
}

// Format: CREDIT-YY#### where YY = calendar year, #### = 4-digit serial globally per year
function generateCreditNoteReference(db, customerId, paymentDate = new Date()) {
  try {
    const yearStr = getCalendarYear(paymentDate);
    
    // Use MAX approach with LIKE to find highest global sequence
    const maxResult = db.prepare(`
      SELECT reference_number
      FROM payments
      WHERE type = 'CREDIT_NOTE'
        AND reference_number LIKE ?
    `).all(`CREDIT-${yearStr}%`);
    
    let maxSequence = 0;
    maxResult.forEach(row => {
      const seq = extractSequenceFromReference(row.reference_number);
      if (seq > maxSequence) maxSequence = seq;
    });
    
    const nextSequence = maxSequence + 1;
    const sequenceStr = String(nextSequence).padStart(4, '0');
    
    return `CREDIT-${yearStr}${sequenceStr}`;
  } catch (err) {
    console.error('Error generating credit note reference:', err);
    return `CREDIT-${Date.now().toString().slice(-8)}`;
  }
}
