const BillCalculator = require('../../../shared/bill-calculator');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Detect whether this system uses 'python3' or 'python'
// Ubuntu/Linux uses python3; Windows uses python
function getPythonCmd() {
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
  // Handle both dev and production paths:
  // - Dev: src/modules/billing/api + ../../../../ = /database
  // - Prod: dist/modules/billing/api needs to resolve to /database in prod root
  const isProduction = process.env.NODE_ENV === 'production';
  const baseDir = isProduction
    ? path.join(__dirname, '../../../../database')  // Goes from dist/modules/billing/api up 4 levels to prod root
    : path.join(__dirname, '../../../../database');     // Goes from src/modules/billing/api up 4 levels to dev root
  
  return path.join(baseDir, 'MacOS.db');
}

// Helper to get correct scripts_py path for dev and production
function getScriptsPath(scriptName) {
  // Handle both dev and production paths:
  // - Dev: src/modules/billing/api + ../../../../scripts_py = /scripts_py
  // - Prod: dist/modules/billing/api needs to resolve to /scripts_py in prod root
  const isProduction = process.env.NODE_ENV === 'production';
  const baseDir = isProduction
    ? path.join(__dirname, '../../../../scripts_py')  // Goes from dist/modules/billing/api up 4 levels to prod root
    : path.join(__dirname, '../../../../scripts_py');     // Goes from src/modules/billing/api up 4 levels to dev root
  
  return path.join(baseDir, scriptName);
}

// Helper to call Python invoice generator
function generateInvoicePDF(dbPath, invoiceNo, duplex = null, mode = "print") {
  try {
    const tempDir = getTempDir();
    const pdfPath = path.join(tempDir, `invoice-${invoiceNo}-${Date.now()}.pdf`);
    const pythonScript = getScriptsPath('invoice-generator.py');
    
    // Verify files exist
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found at: ${dbPath}`);
    }
    if (!fs.existsSync(pythonScript)) {
      throw new Error(`Python script not found at: ${pythonScript}`);
    }
    
    // Call Python script with error capture
    let cmd = `${PYTHON_CMD} "${pythonScript}" --db "${dbPath}" --invoice "${invoiceNo}" --out "${pdfPath}" --mode "${mode}"`;
    if (duplex !== null && duplex !== undefined && duplex !== '') {
      cmd += ` --duplex "${duplex}"`;
    }
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
    
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file was not created at ${pdfPath}. Script output: ${output}`);
    }
    
    return pdfPath;
  } catch (error) {
    console.error(`PDF generation failed: ${error.message}`);
    throw error;
  }
}

// Helper to call Python payment/credit note generator
function generatePaymentPDF(dbPath, paymentId) {
  try {
    const tempDir = getTempDir();
    const pdfPath = path.join(tempDir, `payment-${paymentId}-${Date.now()}.pdf`);
    const pythonScript = getScriptsPath('payment-credit-note-generator.py');
    
    // Verify files exist
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found at: ${dbPath}`);
    }
    if (!fs.existsSync(pythonScript)) {
      throw new Error(`Python script not found at: ${pythonScript}`);
    }
    
    // Call Python script with error capture
    const cmd = `${PYTHON_CMD} "${pythonScript}" --db "${dbPath}" --payment "${paymentId}" --out "${pdfPath}"`;
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
    
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file was not created at ${pdfPath}. Script output: ${output}`);
    }
    
    return pdfPath;
  } catch (error) {
    console.error(`Payment PDF generation failed: ${error.message}`);
    throw error;
  }
}

// Generate opening balance PDF using Python script
function generateOpeningBalancePDF(dbPath, customerName) {
  try {
    const tempDir = getTempDir();
    // Sanitize customer name: replace all special characters (/, \, :, *, ?, ", <, >, |) with hyphen
    const sanitizedName = customerName.replace(/[\s\/\\:*?"<>|]+/g, '-');
    const pdfPath = path.join(tempDir, `opening-balance-${sanitizedName}-${Date.now()}.pdf`);
    const pythonScript = getScriptsPath('payment-credit-note-generator.py');
    
    // Verify files exist
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found at: ${dbPath}`);
    }
    if (!fs.existsSync(pythonScript)) {
      throw new Error(`Python script not found at: ${pythonScript}`);
    }
    
    // Call Python script with error capture
    const cmd = `${PYTHON_CMD} "${pythonScript}" --db "${dbPath}" --opening-balance "${customerName}" --out "${pdfPath}"`;
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
    
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file was not created at ${pdfPath}. Script output: ${output}`);
    }
    
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

module.exports = function(db) {
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

  return {
    // ============= INVOICES (BILLS) =============
    
    // Create a new invoice/bill with line items
    createBill: (req, res) => {
      try {
        const { 
          customer_id, 
          customer_name,
          invoice_no, 
          due_date, 
          products, 
          subtotal, 
          total_discount, 
          total_gst, 
          round_off, 
          grand_total,
          previous_due 
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
            const customer = db.prepare('SELECT id FROM contacts WHERE name = ?').get(customer_name);
            if (customer) {
              finalCustomerId = customer.id;
            } else {
              // Auto-create customer if doesn't exist
              const isWorker = req.user && req.user.role === 'worker';
              const creatorId = req.user ? (req.user.id || req.user.userId) : null;
              const createStmt = db.prepare(`
                INSERT INTO contacts (name, type, active, exclude_from_stats, created_by_user_id, created_at, updated_at)
                VALUES (?, 'customer', 'INACTIVE', ?, ?, datetime('now'), datetime('now'))
              `);
              const customerResult = createStmt.run(customer_name, isWorker ? 1 : 0, creatorId);
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

        // Generate invoice number if not provided
        // Use new format: GST-YYNN## (if total_gst > 0) or NGST-YYNN## (if total_gst = 0)
        const finalInvoiceNo = invoice_no || generateNewInvoiceNumber(db, finalCustomerId, total_gst, req.body.invoice_date);

        // Get customer's opening balance
        const customer = db.prepare('SELECT opening_balance FROM contacts WHERE id = ?').get(finalCustomerId);
        const opening_balance = customer ? (customer.opening_balance || 0) : 0;

        // Calculate previous_due based on sequence numbers (sequence-based ordering)
        // Formula: previous_due = opening_balance + (sum of prior invoices - payments - credits)
        // Get all invoices for this customer, ordered by sequence
        // Get all invoices for this customer, ordered chronologically
        const allInvoices = db.prepare(`
          SELECT id, invoice_no, grand_total, invoice_date, created_at FROM invoices
          WHERE customer_id = ?
        `).all(finalCustomerId);
        
        // Define 'this' invoice attributes
        const thisInvoiceDate = req.body.invoice_date || null;
        const thisInvoiceCreated = new Date().toISOString();
        
        // Calculate total of all invoices logically before this one
        const priorInvoiceTotal = allInvoices
          .filter(inv => isStrictlyPrior(inv.invoice_date, inv.created_at, inv.id, thisInvoiceDate, thisInvoiceCreated, undefined))
          .reduce((sum, inv) => sum + inv.grand_total, 0);
        
        // Calculate total payments/credits logically before this one
        const allPayments = db.prepare(`
          SELECT id, reference_number, amount, payment_date, created_at FROM payments
          WHERE customer_id = ? AND type = 'PAYMENT'
        `).all(finalCustomerId);
        
        const allCredits = db.prepare(`
          SELECT id, reference_number, credit_amount, payment_date, created_at FROM payments
          WHERE customer_id = ? AND type = 'CREDIT_NOTE'
        `).all(finalCustomerId);
        
        const totalPayments = allPayments
          .filter(p => isStrictlyPrior(p.payment_date, p.created_at, p.id, thisInvoiceDate, thisInvoiceCreated, undefined))
          .reduce((sum, p) => sum + p.amount, 0);
        
        const totalCredits = allCredits
          .filter(c => isStrictlyPrior(c.payment_date, c.created_at, c.id, thisInvoiceDate, thisInvoiceCreated, undefined))
          .reduce((sum, c) => sum + c.credit_amount, 0);
        
        const calculatedPreviousDue = opening_balance + priorInvoiceTotal - (totalPayments + totalCredits);

        // Create invoice record
        const invoiceStmt = db.prepare(`
          INSERT INTO invoices 
          (customer_id, invoice_no, due_date, total_amount, total_discount, total_gst, 
           round_off, grand_total, previous_due, invoice_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        let invoiceId;
        try {
          const invoiceResult = invoiceStmt.run(
            finalCustomerId,
            finalInvoiceNo,
            due_date || null,
            subtotal || 0,
            total_discount || 0,
            total_gst || 0,
            round_off || 0,
            grand_total || 0,
            calculatedPreviousDue,
            req.body.invoice_date || null
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

        // Insert invoice line items
        const itemStmt = db.prepare(`
          INSERT INTO invoice_items
          (invoice_id, product_id, variant_id, batch_id, pack_value, pack_type, batch_no, 
           exp_date, qty, scheme, free, mrp, rate, amount, discount_1_percent, discount_1_amount,
           discount_2_percent, discount_2_amount, gst_percent, gst_amount, sgst_amount, cgst_amount,
           final_amount, gst_reverse, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        products.forEach((product, index) => {
          try {
            // Look up product_id from product_name if not provided
            let productId = product.product_id || null;
            if (!productId && product.product_name) {
              const prod = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(product.product_name);
              if (prod) {
                productId = prod.id;
              }
            }

            // Look up variant_id from pack info if needed
            let variantId = product.variant_id || null;
            if (!variantId && productId && product.pack_value && product.pack_type) {
              const variant = db.prepare(`
                SELECT id FROM variants 
                WHERE product_id = ? AND pack_size_value = ? AND pack_size_type = ?
              `).get(productId, product.pack_value, product.pack_type);
              if (variant) {
                variantId = variant.id;
              }
            }

            // Look up batch_id from batch_no if needed
            let batchId = product.batch_id || null;
            if (!batchId && product.batch_no) {
              if (variantId) {
                const batch = db.prepare(`
                  SELECT id FROM batches 
                  WHERE variant_id = ? AND batch_no = ?
                `).get(variantId, product.batch_no);
                if (batch) {
                  batchId = batch.id;
                }
              } else if (productId) {
                const batch = db.prepare(`
                  SELECT b.id, b.variant_id FROM batches b
                  JOIN variants v ON b.variant_id = v.id
                  WHERE v.product_id = ? AND b.batch_no = ?
                `).get(productId, product.batch_no);
                if (batch) {
                  batchId = batch.id;
                  if (!variantId) variantId = batch.variant_id;
                }
              }
            }

            // Use BillCalculator to get all calculated values (with GST Reverse support)
            const lineCalc = BillCalculator.calculateLineItem({
              ...product,
              gst_reverse: product.gst_reverse || false
            });

            itemStmt.run(
              invoiceId,
              productId,
              variantId,
              batchId,
              product.pack_value || product.pack || null,
              product.pack_type || null,
              product.batch_no || product.batch || null,
              product.exp_date || product.exp || null,
              product.qty || 1,
              product.scheme || null,
              product.free || 0,
              product.mrp || 0,
              lineCalc.discounted_rate,
              lineCalc.discountedAmount,
              lineCalc.discount_1_percent,
              lineCalc.discount_1_amount,
              lineCalc.discount_2_percent,
              lineCalc.discount_2_amount,
              lineCalc.gst_percent,
              lineCalc.gst_amount,
              lineCalc.sgst_amount,
              lineCalc.cgst_amount,
              lineCalc.final_amount,
              product.gst_reverse ? 1 : 0
            );
          } catch (err) {
            console.error(`Error inserting line item ${index + 1}:`, err.message);
            // Continue processing other items even if one fails
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

        products.forEach(product => {
          try {
            let productId = product.product_id || null;
            if (!productId && product.product_name) {
              const prod = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(product.product_name);
              if (prod) {
                productId = prod.id;
              }
            }

            if (productId) {
              // Use percentage values for customer memory, not monetary amounts
              const disc1Pct = product.discount_1_percent || 0;
              const disc2Pct = product.discount_2_percent || 0;
              
              prefStmt.run(
                finalCustomerId,
                productId,
                disc1Pct,
                disc2Pct,
                product.scheme || null,
                product.gst_percent || 0,
                product.gst_reverse ? 1 : 0
              );
            }
          } catch (err) {
            console.error('Error saving preference:', err);
            // Continue even if preference save fails
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

        res.status(201).json({
          success: true,
          id: invoiceId,
          invoice_no: finalInvoiceNo,
          customer_name: (function() {
            const cust = db.prepare('SELECT name FROM contacts WHERE id = ?').get(finalCustomerId);
            return cust?.name || 'Unknown';
          })(),
          reference_no: finalInvoiceNo,
          customer_id: finalCustomerId,
          grand_total: grand_total || 0,
          items_count: products.length,
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
        const { customer_id, limit = 100, offset = 0 } = req.query;

        // Join with contacts to get customer names
        let sql = `
          SELECT i.*,
                 i.invoice_date,
                 c.name as customer_name,
                 l.current_due as customer_current_due
          FROM invoices i
          LEFT JOIN contacts c ON i.customer_id = c.id
          LEFT JOIN ledger l ON i.customer_id = l.customer_id

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
              product_name: item.product_name || `Product #${item.product_id}` || 'Unknown',
              quantity: item.qty || 0,
              price: item.rate || 0,
              total: item.amount || 0
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
        const { id } = req.params;

        // Join with contacts to get customer name
        const invoiceStmt = db.prepare(`
          SELECT i.*,
                 i.invoice_date,
                 c.name as customer_name
          FROM invoices i
          LEFT JOIN contacts c ON i.customer_id = c.id

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

        // Update main invoice table
        const updateStmt = db.prepare(`
          UPDATE invoices 
          SET customer_id = COALESCE(?, customer_id),
              due_date = COALESCE(?, due_date),
              total_amount = COALESCE(?, total_amount),
              total_discount = COALESCE(?, total_discount),
              total_gst = COALESCE(?, total_gst),
              round_off = COALESCE(?, round_off),
              grand_total = COALESCE(?, grand_total),
              invoice_date = COALESCE(?, invoice_date),
              updated_at = datetime('now')
          WHERE id = ?
        `);

        updateStmt.run(
          customerId,
          due_date,
          subtotal,
          total_discount,
          total_gst,
          round_off,
          grand_total,
          invoice_date,
          id
        );

        // If products are provided, replace all invoice items
        if (products && Array.isArray(products) && products.length > 0) {
          // Delete existing items
          const deleteItemsStmt = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
          deleteItemsStmt.run(id);

          // Insert new items using shared BillCalculator
          const itemStmt = db.prepare(`
            INSERT INTO invoice_items
            (invoice_id, product_id, variant_id, batch_id, pack_value, pack_type, batch_no, 
             exp_date, qty, scheme, free, mrp, rate, amount, discount_1_percent, discount_1_amount,
             discount_2_percent, discount_2_amount, gst_percent, gst_amount, sgst_amount, cgst_amount,
             final_amount, gst_reverse, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `);

          products.forEach(product => {
            try {
              let productId = product.product_id || null;
              if (!productId && product.product_name) {
                const prod = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(product.product_name);
                if (prod) productId = prod.id;
              }

              let variantId = product.variant_id || null;
              if (!variantId && productId && product.pack_value && product.pack_type) {
                const variant = db.prepare(`
                  SELECT id FROM variants 
                  WHERE product_id = ? AND pack_size_value = ? AND pack_size_type = ?
                `).get(productId, product.pack_value, product.pack_type);
                if (variant) variantId = variant.id;
              }

              let batchId = product.batch_id || null;
              if (!batchId && variantId && product.batch_no) {
                const batch = db.prepare(`
                  SELECT id FROM batches 
                  WHERE variant_id = ? AND batch_no = ?
                `).get(variantId, product.batch_no);
                if (batch) batchId = batch.id;
              }

              const lineCalc = BillCalculator.calculateLineItem({
                mrp: product.mrp || 0,
                rate: product.rate || product.price || 0,
                qty: product.qty || product.quantity || 1,
                free: product.free || 0,
                disc1: product.discount_1_percent || product.disc1 || 0,
                disc2: product.discount_2_percent || product.disc2 || 0,
                sgst: product.sgst_percent || product.sgst || 0,
                cgst: product.cgst_percent || product.cgst || 0,
                gstTotal: product.gst_percent || product.gstTotal || 0,
                scheme: product.scheme || null,
                gst_reverse: product.gst_reverse || false
              });

              itemStmt.run(
                id,
                productId,
                variantId,
                batchId,
                product.pack_value || product.pack || null,
                product.pack_type || null,
                product.batch_no || product.batch || null,
                product.exp_date || product.exp || null,
                product.qty || product.quantity || 1,
                product.scheme || null,
                product.free || 0,
                product.mrp || 0,
                lineCalc.discounted_rate,
                lineCalc.discountedAmount,
                lineCalc.discount_1_percent,
                lineCalc.discount_1_amount,
                lineCalc.discount_2_percent,
                lineCalc.discount_2_amount,
                lineCalc.gst_percent,
                lineCalc.gst_amount,
                lineCalc.sgst_amount,
                lineCalc.cgst_amount,
                lineCalc.final_amount,
                product.gst_reverse ? 1 : 0
              );
            } catch (err) {
              console.error('Error updating line item:', err);
            }
          });
        }

        res.json({
          success: true,
          message: 'Invoice updated',
          id: id
        });
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
          sql += ` AND ${workerScope}`;
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

    // Get all customers with their ledger balances and financial metrics
    getLedgerCustomers: (req, res) => {
      try {
        const workerScope = getWorkerContactScope(req, 'c');
        const scopeClause = workerScope ? ` AND ${workerScope}` : '';

        // Get all customers with ledger entries only (those with actual invoices/payments)
        const customers = db.prepare(`
          SELECT 
            c.id,
            c.name,
            c.opening_balance,
            c.exclude_from_stats,
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
            (SELECT MAX(COALESCE(payment_date, created_at)) FROM payments WHERE customer_id = c.id AND type = 'PAYMENT') as last_payment_date

          FROM contacts c
          LEFT JOIN ledger l ON c.id = l.customer_id
          WHERE (c.type IS NULL OR LOWER(c.type) = 'customer')
            AND (l.id IS NOT NULL OR COALESCE(c.opening_balance, 0) != 0)
            ${scopeClause}
          ORDER BY c.name ASC
        `).all();

        // Format response for ledger view - include opening balance in total due calculation
        const formattedCustomers = customers.map(c => {
          const openingBalance = c.opening_balance || 0;
          const amountDueWithOpening = c.current_due + openingBalance;
          
          // Calculate days overdue (grace period of 30 days)
          let daysOverdue = 0;
          if (amountDueWithOpening > 0 && c.last_bill_date) {
            const lastBill = new Date(c.last_bill_date);
            const daysSinceBill = Math.floor((new Date() - lastBill) / (1000 * 60 * 60 * 24));
            daysOverdue = Math.max(0, daysSinceBill - 30);
          }

          return {
            customer_id: c.id,
            customerName: c.name,
            opening_balance: openingBalance,
            exclude_from_stats: c.exclude_from_stats || 0,
            amountDue: amountDueWithOpening,
            current_due: c.current_due,
            total_debit: c.total_debit || 0,
            total_credit: c.total_credit || 0,
            total_outstanding: amountDueWithOpening, // Total due including opening balance
            total_bills: c.total_bills,
            total_payments: c.total_payments,
            daysOverdue: daysOverdue,
            lastBillDate: c.last_bill_date || null,
            lastPaymentDate: c.last_payment_date || null,
            active: c.active || 'ACTIVE',
            last_activity: c.last_activity
          };
        });

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

    // Get public ledger for a specific customer
    getPublicLedger: (req, res) => {
      try {
        const { customerId } = req.params;
        
        // Find customer
        const customer = db.prepare(`
          SELECT id, name, opening_balance 
          FROM contacts 
          WHERE id = ? AND (type IS NULL OR LOWER(type) = 'customer')
        `).get(customerId);
        
        if (!customer) {
          return res.status(404).json({ error: 'Customer not found' });
        }

        // Get ledger totals
        const totals = db.prepare(`
          SELECT 
            COALESCE(current_due, 0) as current_due,
            total_bills,
            total_payments
          FROM ledger 
          WHERE customer_id = ?
        `).get(customerId) || { current_due: 0, total_bills: 0, total_payments: 0 };

        // Get Bills
        const bills = db.prepare(`
          SELECT id, invoice_no, invoice_date, created_at, grand_total as amount 
          FROM invoices 
          WHERE customer_id = ? 
          ORDER BY COALESCE(invoice_date, created_at) DESC
        `).all(customerId);

        // Get Payments and Credit Notes
        const payments = db.prepare(`
          SELECT id, reference_number, payment_date, created_at, amount, credit_amount, type 
          FROM payments 
          WHERE customer_id = ? 
          ORDER BY COALESCE(payment_date, created_at) DESC
        `).all(customerId);

        // Fetch settings from app_settings table
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
        const settingRows = db.prepare('SELECT setting_key, setting_value FROM app_settings').all();
        const app_settings = {};
        for (const row of settingRows) {
          app_settings[row.setting_key] = row.setting_value;
        }
        const defaults = {
          'payment_upi_id': '7749089400@hdfc',
          'bank_account_holder': 'MD  FAIZAL',
          'bank_account_number': '50100673684509',
          'bank_ifsc': 'HDFC0000236',
          'bank_branch': 'CUTTACK - ODISHA',
          'bank_account_type': 'Savings Account'
        };
        for (const [k, v] of Object.entries(defaults)) {
          if (app_settings[k] === undefined || app_settings[k] === null || app_settings[k] === '') {
            app_settings[k] = v;
          }
        }

        res.json({
          success: true,
          data: {
            customer: {
              id: customer.id,
              name: customer.name,
              opening_balance: customer.opening_balance || 0,
              current_due: totals.current_due + (customer.opening_balance || 0)
            },
            bank: {
              upi_id: app_settings.payment_upi_id,
              account_holder: app_settings.bank_account_holder,
              account_number: app_settings.bank_account_number,
              ifsc: app_settings.bank_ifsc,
              branch: app_settings.bank_branch,
              account_type: app_settings.bank_account_type
            },
            stats: {
              total_bills: totals.total_bills || bills.length,
              total_payments: totals.total_payments || payments.filter(p => p.type === 'PAYMENT').length
            },
            bills: bills,
            payments: payments
          }
        });
      } catch (error) {
        console.error('Error getting public ledger:', error);
        res.status(500).json({ error: 'Failed to load ledger data' });
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
        
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName);
        if (!customer) {
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
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName);
        if (!customer) {
          return res.status(404).json({
            status: 'error',
            message: `Customer '${customerName}' not found`
          });
        }

        // Find product by name
        const product = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(productName);
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
        
        const customer = db.prepare('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)').get(customerName);
        if (!customer) {
          return res.status(404).json({
            status: 'error',
            message: `Customer '${customerName}' not found`
          });
        }

        const product = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(productName);
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

        // Get database path
        const dbPath = getDatabasePath();
        
        // Check account duplex preference for export/preview (decoupled from customer)
        let finalDuplex = duplex;
        if (!finalDuplex) {
          try {
            const setting = db.prepare("SELECT value FROM Settings WHERE key = 'invoice_duplex_print'").get();
            finalDuplex = (setting && setting.value === 'false') ? 'no' : 'yes';
          } catch (_) {
            finalDuplex = 'yes';
          }
        }
        
        // Generate PDF using Python script
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

        // Get database path
        const dbPath = getDatabasePath();
        
        // Check account duplex preference for export (decoupled from customer)
        let finalDuplex = duplex;
        if (!finalDuplex) {
          try {
            const setting = db.prepare("SELECT value FROM Settings WHERE key = 'invoice_duplex_print'").get();
            finalDuplex = (setting && setting.value === 'false') ? 'no' : 'yes';
          } catch (_) {
            finalDuplex = 'yes';
          }
        }
        
        // Generate PDF using Python script in export mode
        const pdfPath = generateInvoicePDF(dbPath, invoice.id, finalDuplex, 'export');
        console.log('PDF generated (export mode):', pdfPath);
        
        // Read PDF and send as response
        const pdfData = fs.readFileSync(pdfPath);
        
        const serial = getAnnualSerialNumber(db, invoice.id);
        const dateStr = formatDateStr(invoice.invoice_date || invoice.created_at);
        const fileName = `${serial}.Invoice ${dateStr}`;
        
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

        const dbPath = getDatabasePath();
        
        const pdfPath = generatePaymentPDF(dbPath, paymentId);
        const pdfBuffer = fs.readFileSync(pdfPath);
        
        // Fetch record type and date
        const paymentRecord = db.prepare('SELECT type, created_at FROM payments WHERE id = ?').get(paymentId);
        const isCreditNote = paymentRecord && paymentRecord.type === 'CREDIT_NOTE';
        const docPrefix = isCreditNote ? 'Credit Note' : 'Payment';
        const dateStr = paymentRecord ? paymentRecord.created_at : null;
        const fileName = `${docPrefix} ${formatDateStr(dateStr)}`;
        
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

        const dbPath = getDatabasePath();
        
        const pdfPath = generatePaymentPDF(dbPath, paymentId);
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
        const dbPath = getDatabasePath();
        const pdfPath = generateOpeningBalancePDF(dbPath, customerName);
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

        const dbPath = getDatabasePath();
        
        const pdfPath = generatePaymentPDF(dbPath, paymentId);
        const pdfBuffer = fs.readFileSync(pdfPath);
        const base64PDF = pdfBuffer.toString('base64');
        // Fetch record type and date
        const paymentRecord = db.prepare('SELECT type, created_at FROM payments WHERE id = ?').get(paymentId);
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
        const dbPath = getDatabasePath();
        const pdfPath = generateOpeningBalancePDF(dbPath, customerName);
        const pdfBuffer = fs.readFileSync(pdfPath);
        
        // Optional: Get contact creation date or use current
        const contactRecord = db.prepare('SELECT created_at FROM contacts WHERE name = ?').get(customerName);
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

        const dbPath = getDatabasePath();
        const pdfPath = generateOpeningBalancePDF(dbPath, customerName);
        const pdfBuffer = fs.readFileSync(pdfPath);
        const base64PDF = pdfBuffer.toString('base64');
        
        // Optional: Get contact creation date or use current
        const contactRecord = db.prepare('SELECT created_at FROM contacts WHERE name = ?').get(customerName);
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
          'payment_qr_image': '',
          'payment_upi_id': '7749089400@hdfc',
          'bank_account_holder': 'MD  FAIZAL',
          'bank_account_number': '50100673684509',
          'bank_ifsc': 'HDFC0000236',
          'bank_branch': 'CUTTACK - ODISHA',
          'bank_mmid': '9240072',
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
