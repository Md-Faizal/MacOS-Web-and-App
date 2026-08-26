/**
 * Invoice Handlers
 * Handles invoice creation, retrieval, and management
 * Uses shared BillCalculator for consistent tax and discount calculations
 */

const BillCalculator = require('../../../frontend/shared/bill-calculator');
const { helpers } = require('./payments');

module.exports = function(db) {
  return {
    /**
     * CREATE INVOICE (with multiple line items)
     */
    createInvoice: (req, res) => {
      try {
        const {
          customer_id,
          items,
          due_date = null,
          invoice_date = null,
          notes = null
        } = req.body;


        if (!customer_id) {
          return res.status(400).json({ error: 'customer_id is required' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'items array is required and must not be empty' });
        }

        // Generate invoice number (Calendary Year Global Sequence)
        const invoiceDateObj = invoice_date ? new Date(invoice_date) : new Date();
        const invoice_number = helpers.generateInvoiceReference(db, customer_id, invoiceDateObj);

        // Use BillCalculator to calculate all line items with consistent logic
        const itemsData = items.map(item => {
          // Determine GST structure
          const gstPercent = parseFloat(item.gst_percent || 0) || 0;
          const sgstPercent = parseFloat(item.sgst_percent || 0) || 0;
          const cgstPercent = parseFloat(item.cgst_percent || 0) || 0;
          
          // Use separate SGST/CGST only if both are provided and reasonable
          // (i.e., not amounts mistaken for percentages, and sum makes sense)
          const useSeparateTax = sgstPercent > 0 && cgstPercent > 0 && sgstPercent <= 50 && cgstPercent <= 50;
          
          return BillCalculator.calculateLineItem({
            rate: item.rate || 0,
            mrp: item.mrp || 0,
            qty: item.quantity || 1,
            disc1: item.discount_1 || 0,
            disc2: item.discount_2 || 0,
            sgst: useSeparateTax ? sgstPercent : 0,
            cgst: useSeparateTax ? cgstPercent : 0,
            gstTotal: gstPercent,
            scheme: item.scheme || null,
            gst_reverse: item.gst_reverse || false
          });
        });

        // Calculate bill summary using BillCalculator
        const summary = BillCalculator.calculateBillSummary(itemsData);
        const total_amount = summary.total_amount;
        const total_discount = summary.total_discount;
        const total_gst = summary.total_gst;
        const grand_total = summary.grand_total;
        const round_off = summary.round_off;

        // Get customer's opening_balance and calculate previous_due
        // previous_due = opening_balance + sum of all previous invoice amounts - total payments received
        const customer = db.prepare('SELECT opening_balance FROM contacts WHERE id = ?').get(customer_id);
        const opening_balance = customer ? (customer.opening_balance || 0) : 0;
        
        // Get total from all previous invoices
        const previousInvoices = db.prepare(`
          SELECT COALESCE(SUM(grand_total), 0) as total_invoiced FROM invoices WHERE customer_id = ?
        `).get(customer_id);
        
        // Get total payments received
        const payments = db.prepare(`
          SELECT 
            COALESCE(SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END), 0) as total_paid,
            COALESCE(SUM(CASE WHEN type = 'CREDIT_NOTE' THEN credit_amount ELSE 0 END), 0) as total_credited
          FROM payments WHERE customer_id = ?
        `).get(customer_id);
        
        const previousDueAmount = opening_balance + (previousInvoices.total_invoiced || 0) - (payments.total_paid || 0) - (payments.total_credited || 0);
        const previous_due = Math.max(0, previousDueAmount); // Don't show negative as previous_due

        // INSERT INVOICE HEADER
        const invoiceStmt = db.prepare(`
          INSERT INTO invoices 
          (invoice_no, customer_id, total_amount, total_discount, total_gst, 
           round_off, grand_total, previous_due, due_date, invoice_date, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const invoiceResult = invoiceStmt.run(
          invoice_number,
          customer_id,
          parseFloat(total_amount.toFixed(2)),
          parseFloat(total_discount.toFixed(2)),
          parseFloat(total_gst.toFixed(2)),
          round_off,
          grand_total,
          previous_due,
          due_date || null,
          invoice_date || null,
          notes || null
        );


        const invoice_id = invoiceResult.lastInsertRowid;

        // INSERT INVOICE ITEMS with calculated amounts from BillCalculator
        const itemStmt = db.prepare(`
          INSERT INTO invoice_items 
          (invoice_id, product_id, variant_id, batch_id, pack_value, pack_type, 
           batch_no, exp_date, qty, scheme, free, mrp, rate, amount,
           discount_1_percent, discount_1_amount, discount_2_percent, discount_2_amount, 
           gst_percent, gst_amount, sgst_amount, cgst_amount, final_amount, gst_reverse,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  datetime('now'), datetime('now'))
        `);

        itemsData.forEach((calculated, idx) => {
          const originalItem = items[idx];
          let productId = originalItem.product_id || null;
          let variantId = originalItem.variant_id || null;
          let batchId = originalItem.batch_id || null;

          if (!productId && originalItem.product_name) {
            const prod = db.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?)').get(originalItem.product_name);
            if (prod) productId = prod.id;
          }

          if (!batchId && originalItem.batch_no) {
            if (variantId) {
              const b = db.prepare('SELECT id FROM batches WHERE variant_id = ? AND batch_no = ?').get(variantId, originalItem.batch_no);
              if (b) batchId = b.id;
            } else if (productId) {
              const b = db.prepare('SELECT b.id, b.variant_id FROM batches b JOIN variants v ON b.variant_id = v.id WHERE v.product_id = ? AND b.batch_no = ?').get(productId, originalItem.batch_no);
              if (b) {
                batchId = b.id;
                if (!variantId) variantId = b.variant_id;
              }
            }
          }

          itemStmt.run(
            invoice_id,
            productId,
            variantId,
            batchId,
            originalItem.pack_value || null,
            originalItem.pack_type || null,
            originalItem.batch_no || null,
            originalItem.exp_date || null,
            calculated.qty,
            calculated.scheme || null,
            originalItem.free || 0,
            originalItem.mrp || null,
            calculated.discounted_rate,
            calculated.discountedAmount,
            calculated.discount_1_percent || 0,
            calculated.discount_1_amount || 0,
            calculated.discount_2_percent || 0,
            calculated.discount_2_amount || 0,
            calculated.gst_percent || 0,
            calculated.gst_amount,
            calculated.sgst_amount,
            calculated.cgst_amount,
            calculated.final_amount,
            originalItem.gst_reverse ? 1 : 0
          );
        });

        res.status(201).json({
          success: true,
          invoice_id,
          invoice_number,
          customer_id,
          total_amount: summary.total_amount,
          total_discount: summary.total_discount,
          total_gst: summary.total_gst,
          sgst: summary.total_sgst,
          cgst: summary.total_cgst,
          round_off: summary.round_off,
          grand_total: summary.grand_total,
          items_count: items.length,
          created_at: new Date().toISOString()
        });

      } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET ALL INVOICES (with optional filters)
     */
    getInvoices: (req, res) => {
      try {
        const { customer_id, limit = 100, offset = 0 } = req.query;
        let sql = `
          SELECT 
            i.id,
            i.customer_id,
            i.invoice_no as invoice_number,
            i.due_date,
            i.total_amount,
            i.total_discount,
            i.total_gst,
            i.round_off,
            i.grand_total,
            i.previous_due,
            i.invoice_date,
            i.created_at,
            COALESCE(i.invoice_date, i.created_at) as bill_date,
            i.updated_at,

            c.name as customer_name
          FROM invoices i
          LEFT JOIN contacts c ON i.customer_id = c.id
          WHERE 1=1
        `;
        const params = [];

        if (customer_id) {
          sql += ' AND i.customer_id = ?';
          params.push(customer_id);
        }

        sql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const invoices = db.prepare(sql).all(...params);

        // Add items for each invoice with proper transformation
        const result = invoices.map(invoice => {
          const dbItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
          
          // Transform items to match getInvoice format
          const items = dbItems.map(item => {
            // For SGST and CGST percentages, derive from stored amounts if available
            const discountedAmount = (item.amount || 0) - (item.discount_1_amount || 0) - (item.discount_2_amount || 0);
            
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
              id: item.id,
              product_id: item.product_id,
              variant_id: item.variant_id,
              batch_id: item.batch_id,
              product_name: item.product_name || '',
              pack_value: item.pack_value,
              pack_type: item.pack_type,
              batch_no: item.batch_no,
              exp_date: item.exp_date,
              quantity: item.qty,
              scheme: item.scheme,
              free: item.free,
              mrp: item.mrp,
              rate: item.rate,
              discount_1: item.discount_1_percent,
              discount_2: item.discount_2_percent,
              gst_percent: item.gst_percent,
              sgst_percent: sgstPercent,
              cgst_percent: cgstPercent,
              // GST Reverse indicator
              gst_reverse: item.gst_reverse || false
            };
          });
          
          return {
            ...invoice,
            items
          };
        });

        res.json(result);

      } catch (error) {
        console.error('❌ Error in getInvoices:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET SINGLE INVOICE with all items
     * Returns items formatted for frontend editing (renamed from database column names)
     */
    getInvoice: (req, res) => {
      try {
        const { id } = req.params;
                const invoice = db.prepare('SELECT *, invoice_no as invoice_number FROM invoices WHERE id = ?').get(id);


        if (!invoice) {
          return res.status(404).json({ error: 'Invoice not found' });
        }

        const dbItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
        
        // Calculate SGST and CGST totals from items
        let total_sgst = 0;
        let total_cgst = 0;
        
        // Transform database items to frontend format
        // Frontend expects: rate, quantity, discount_1, discount_2, gst_percent, sgst_percent, cgst_percent
        // Database stores: rate, qty, discount_1_percent, gst_percent, sgst_amount, cgst_amount
        const items = dbItems.map(item => {
          // Accumulate totals from items
          total_sgst += (item.sgst_amount || 0);
          total_cgst += (item.cgst_amount || 0);
          
          // For SGST and CGST percentages, derive from stored amounts if available
          // The base for calculating percentage is the discounted amount
          const discountedAmount = (item.amount || 0) - (item.discount_1_amount || 0) - (item.discount_2_amount || 0);
          
          // Get the percentages from amounts, or fall back to gst_percent split 50/50
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
            id: item.id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            batch_id: item.batch_id,
            product_name: item.product_name || '',
            pack_value: item.pack_value,
            pack_type: item.pack_type,
            batch_no: item.batch_no,
            exp_date: item.exp_date,
            quantity: item.qty,
            scheme: item.scheme,
            free: item.free,
            mrp: item.mrp,
            rate: item.rate,
            // Map discount columns correctly for frontend
            discount_1: item.discount_1_percent,  // Frontend expects percentage
            discount_2: item.discount_2_percent,  // Frontend expects percentage
            // Map GST - use stored percentages or derived values
            gst_percent: item.gst_percent,
            sgst_percent: sgstPercent,
            cgst_percent: cgstPercent,
            // GST Reverse indicator
            gst_reverse: item.gst_reverse || false
          };
        });

        res.json({
          ...invoice,
          items,
          sgst: parseFloat(total_sgst.toFixed(2)),
          cgst: parseFloat(total_cgst.toFixed(2))
        });

      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * UPDATE INVOICE (edit invoice items and amounts)
     * 
     * Allows modification of invoice items and recalculation of totals
     * Updates the corresponding ledger entry with new due amount
     */
    updateInvoice: (req, res) => {
      try {
        const { id } = req.params;
        const { items, due_date = null, invoice_date = null, notes = null } = req.body;


        console.log(`📝 UPDATE INVOICE ${id} - Received items:`, items.length > 0 ? {
          item0: {
            gst_percent: items[0].gst_percent,
            sgst_percent: items[0].sgst_percent,
            cgst_percent: items[0].cgst_percent,
            rate: items[0].rate,
            quantity: items[0].quantity
          }
        } : 'empty');

        // Verify invoice exists
        const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
        if (!invoice) {
          return res.status(404).json({ error: 'Invoice not found' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'items array is required and must not be empty' });
        }

        const customer_id = invoice.customer_id;

        // Use BillCalculator to calculate all line items with consistent logic
        const itemsData = items.map((item, idx) => {
          // Determine GST structure
          const gstPercent = parseFloat(item.gst_percent || 0) || 0;
          const sgstPercent = parseFloat(item.sgst_percent || item.sgst || 0) || 0;
          const cgstPercent = parseFloat(item.cgst_percent || item.cgst || 0) || 0;
          
          // Debug: Log received values
          console.log(`📦 Item ${idx} RECEIVED from frontend:`, {
            id: item.id,
            rate: item.rate,
            qty: item.quantity,
            disc1: item.discount_1,
            disc2: item.discount_2,
            gstPercent,
            sgstPercent,
            cgstPercent,
            useSeparateTax: sgstPercent > 0 && cgstPercent > 0 && sgstPercent <= 50 && cgstPercent <= 50
          });
          
          // Use separate SGST/CGST only if both are provided and reasonable
          // (i.e., not amounts mistaken for percentages, and sum makes sense)
          const useSeparateTax = sgstPercent > 0 && cgstPercent > 0 && sgstPercent <= 50 && cgstPercent <= 50;
          
          const calculated = BillCalculator.calculateLineItem({
            rate: item.rate || 0,
            mrp: item.mrp || 0,
            qty: item.quantity || 1,
            disc1: item.discount_1 || 0,
            disc2: item.discount_2 || 0,
            sgst: useSeparateTax ? sgstPercent : 0,
            cgst: useSeparateTax ? cgstPercent : 0,
            gstTotal: gstPercent,
            scheme: item.scheme || null,
            gst_reverse: item.gst_reverse || false
          });

          console.log(`📊 Item ${idx} CALCULATED by BillCalculator:`, {
            amount: calculated.amount,
            disc1_amount: calculated.discount_1_amount,
            disc2_amount: calculated.discount_2_amount,
            gst_amount: calculated.gst_amount,
            sgst_amount: calculated.sgst_amount,
            cgst_amount: calculated.cgst_amount,
            final_amount: calculated.final_amount
          });
          
          return calculated;
        });

        // Calculate bill summary using BillCalculator
        const summary = BillCalculator.calculateBillSummary(itemsData);
        const total_amount = summary.total_amount;
        const total_discount = summary.total_discount;
        const total_gst = summary.total_gst;
        const round_off = summary.round_off;
        const grand_total = summary.grand_total;

        // Get current opening_balance and calculate previous_due
        // previous_due = opening_balance + sum of all PREVIOUS invoice amounts (not including this one) - total payments received
        const customer = db.prepare('SELECT opening_balance FROM contacts WHERE id = ?').get(customer_id);
        const opening_balance = customer ? (customer.opening_balance || 0) : 0;
        
        // Get total from all previous invoices (excluding current)
        const previousInvoices = db.prepare(`
          SELECT COALESCE(SUM(grand_total), 0) as total_invoiced FROM invoices WHERE customer_id = ? AND id != ?
        `).get(customer_id, id);
        
        // Get total payments received
        const payments = db.prepare(`
          SELECT 
            COALESCE(SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END), 0) as total_paid,
            COALESCE(SUM(CASE WHEN type = 'CREDIT_NOTE' THEN credit_amount ELSE 0 END), 0) as total_credited
          FROM payments WHERE customer_id = ?
        `).get(customer_id);
        
        const previousDueAmount = opening_balance + (previousInvoices.total_invoiced || 0) - (payments.total_paid || 0) - (payments.total_credited || 0);
        const previous_due = Math.max(0, previousDueAmount); // Don't show negative as previous_due

        // UPDATE INVOICE HEADER with recalculated totals
        db.prepare(`
          UPDATE invoices 
          SET total_amount = ?, total_discount = ?, total_gst = ?, round_off = ?, grand_total = ?, 
              previous_due = ?, due_date = ?, invoice_date = ?, notes = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          total_amount,
          total_discount,
          total_gst,
          round_off,
          grand_total,
          previous_due,
          due_date || null,
          invoice_date || null,
          notes || null,
          id
        );


        // Update existing items or insert new ones
        const existingItemIds = [];
        
        itemsData.forEach((calculated, idx) => {
          const originalItem = items[idx];
          const itemId = originalItem.id;
          
          console.log(`🔍 Processing item ${idx}:`, { itemId, hasId: itemId != null, hasQty: calculated.qty });
          
          if (itemId != null) {  // ✅ FIXED: Use != null instead of truthiness check to handle ID=0
            // UPDATE existing item
            existingItemIds.push(itemId);
            
            // Get BEFORE values from database for comparison
            const beforeUpdate = db.prepare('SELECT discount_1_amount, sgst_amount, cgst_amount, gst_amount FROM invoice_items WHERE id = ?').get(itemId);
            
            console.log(`📝 UPDATE ITEM ${itemId}:`, {
              BEFORE: beforeUpdate,
              AFTER: {
                qty: calculated.qty,
                disc1_amount: calculated.discount_1_amount,
                sgst: calculated.sgst_amount,
                cgst: calculated.cgst_amount,
                gst: calculated.gst_amount,
                final: calculated.final_amount
              }
            });
            db.prepare(`
              UPDATE invoice_items 
              SET product_id = ?, variant_id = ?, batch_id = ?, pack_value = ?, pack_type = ?, 
                  batch_no = ?, exp_date = ?, qty = ?, scheme = ?, free = ?, mrp = ?, rate = ?, amount = ?,
                  discount_1_percent = ?, discount_1_amount = ?, discount_2_percent = ?, discount_2_amount = ?, 
                  gst_percent = ?, gst_amount = ?, sgst_amount = ?, cgst_amount = ?, final_amount = ?, gst_reverse = ?,
                  updated_at = datetime('now')
              WHERE id = ? AND invoice_id = ?
            `).run(
              originalItem.product_id || null,
              originalItem.variant_id || null,
              originalItem.batch_id || null,
              originalItem.pack_value || null,
              originalItem.pack_type || null,
              originalItem.batch_no || null,
              originalItem.exp_date || null,
              calculated.qty,
              calculated.scheme || null,
              originalItem.free || 0,
              originalItem.mrp || null,
              calculated.discounted_rate,
              calculated.discountedAmount,
              calculated.discount_1_percent || 0,
              calculated.discount_1_amount || 0,
              calculated.discount_2_percent || 0,
              calculated.discount_2_amount || 0,
              calculated.gst_percent || 0,
              calculated.gst_amount,
              calculated.sgst_amount,
              calculated.cgst_amount,
              calculated.final_amount,
              originalItem.gst_reverse ? 1 : 0,
              itemId,
              id
            );
            console.log(`✅ UPDATE COMPLETE for item ${itemId}`);
            
            // Verify what was actually written to database
            const afterUpdate = db.prepare('SELECT discount_1_amount, sgst_amount, cgst_amount, gst_amount FROM invoice_items WHERE id = ?').get(itemId);
            console.log(`🔍 VERIFICATION - Item ${itemId} AFTER database UPDATE:`, afterUpdate);
          } else {
            // INSERT new item (no id means it's a new product added during edit)
            console.log(`🆕 INSERT NEW ITEM: qty=${calculated.qty}, sgst=${calculated.sgst_amount}, cgst=${calculated.cgst_amount}`);
            db.prepare(`
              INSERT INTO invoice_items 
              (invoice_id, product_id, variant_id, batch_id, pack_value, pack_type, 
               batch_no, exp_date, qty, scheme, free, mrp, rate, amount,
               discount_1_percent, discount_1_amount, discount_2_percent, discount_2_amount, 
               gst_percent, gst_amount, sgst_amount, cgst_amount, final_amount, gst_reverse,
               created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                      datetime('now'), datetime('now'))
            `).run(
              id,
              originalItem.product_id || null,
              originalItem.variant_id || null,
              originalItem.batch_id || null,
              originalItem.pack_value || null,
              originalItem.pack_type || null,
              originalItem.batch_no || null,
              originalItem.exp_date || null,
              calculated.qty,
              calculated.scheme || null,
              originalItem.free || 0,
              originalItem.mrp || null,
              calculated.discounted_rate,
              calculated.discountedAmount,
              calculated.discount_1_percent || 0,
              calculated.discount_1_amount || 0,
              calculated.discount_2_percent || 0,
              calculated.discount_2_amount || 0,
              calculated.gst_percent || 0,
              calculated.gst_amount,
              calculated.sgst_amount,
              calculated.cgst_amount,
              calculated.final_amount,
              originalItem.gst_reverse ? 1 : 0
            );
          }
        });
        
        // Delete any items that were removed during edit
        if (existingItemIds.length > 0) {
          const placeholders = existingItemIds.map(() => '?').join(',');
          console.log(`🗑️ Deleting items not in updated list. Keeping: [${existingItemIds.join(',')}]`);
          const stmt = db.prepare(`
            DELETE FROM invoice_items 
            WHERE invoice_id = ? AND id NOT IN (${placeholders})
          `);
          const result = stmt.run(id, ...existingItemIds);
          console.log(`🗑️ DELETE result: ${result.changes} items removed`);
        } else {
          // If no items were kept, delete all old items
          console.log(`🗑️ No items kept - deleting ALL items for invoice ${id}`);
          const result = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
          console.log(`🗑️ DELETE result: ${result.changes} items removed`);
        }

        res.status(200).json({
          success: true,
          invoice_id: id,
          customer_id,
          total_amount: summary.total_amount,
          total_discount: summary.total_discount,
          total_gst: summary.total_gst,
          sgst: summary.total_sgst,
          cgst: summary.total_cgst,
          round_off: summary.round_off,
          grand_total: summary.grand_total,
          items_count: items.length,
          updated_at: new Date().toISOString()
        });

      } catch (error) {
        console.error('Error updating invoice:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * UPDATE INVOICE STATUS
     */
    updateInvoiceStatus: (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'partial', 'paid', 'overdue', 'cancelled'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status value' });
        }

        const result = db.prepare('UPDATE invoices SET status = ?, updated_at = datetime("now") WHERE id = ?')
          .run(status, id);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Invoice not found' });
        }

        res.json({ success: true, id, status });

      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * DELETE INVOICE (and all its items)
     * 
     * Invoices can be deleted independently of payments and credit notes.
     * Deletes the invoice-specific ledger entry while preserving payment entries.
     */
    deleteInvoice: (req, res) => {
      try {
        const { id } = req.params;

        // Check if invoice exists
        const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
        if (!invoice) {
          return res.status(404).json({ error: 'Invoice not found' });
        }

        const customer_id = invoice.customer_id;

        // Delete items first (due to foreign key)
        db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);

        // Delete invoice itself
        const result = db.prepare('DELETE FROM invoices WHERE id = ?').run(id);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Failed to delete invoice' });
        }

        // Get updated customer ledger balance
        const ledgerRecord = db.prepare(`
          SELECT current_due FROM ledger WHERE customer_id = ?
        `).get(customer_id);

        const current_due = ledgerRecord ? (ledgerRecord.current_due || 0) : 0;

        res.json({ 
          success: true, 
          message: 'Invoice deleted successfully', 
          current_due,
          customer_id
        });

      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET INVOICE SUMMARY (totals for dashboard)
     * Includes GST breakdown
     */
    getInvoiceSummary: (req, res) => {
      try {
        const { customer_id } = req.query;
        let whereClause = '1=1';
        const params = [];

        if (customer_id) {
          whereClause = 'customer_id = ?';
          params.push(customer_id);
        }

        const sql = `
          SELECT 
            COUNT(*) as total_invoices,
            SUM(grand_total) as total_amount,
            SUM(total_gst) as total_gst,
            SUM(total_discount) as total_discount,
            SUM(payment_received) as total_paid,
            SUM(grand_total - COALESCE(payment_received, 0)) as total_due,
            SUM(CASE WHEN status = 'overdue' THEN grand_total - COALESCE(payment_received, 0) ELSE 0 END) as overdue_amount
          FROM invoices 
          WHERE ${whereClause}
        `;

        const summary = db.prepare(sql).get(...params);

        res.json({
          total_invoices: summary.total_invoices || 0,
          total_amount: parseFloat((summary.total_amount || 0).toFixed(2)),
          total_gst: parseFloat((summary.total_gst || 0).toFixed(2)),
          total_discount: parseFloat((summary.total_discount || 0).toFixed(2)),
          total_paid: parseFloat((summary.total_paid || 0).toFixed(2)),
          total_due: parseFloat((summary.total_due || 0).toFixed(2)),
          overdue_amount: parseFloat((summary.overdue_amount || 0).toFixed(2))
        });

      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET INVOICE ITEM COUNT
     */
    getInvoiceItemCount: (req, res) => {
      try {
        const { id } = req.params;

        if (!id) {
          return res.status(400).json({ error: 'invoice id is required' });
        }

        // Count items for this invoice
        const result = db.prepare(`
          SELECT COUNT(*) as count 
          FROM invoice_items 
          WHERE invoice_id = ?
        `).get(id);

        res.json({
          count: result.count || 0
        });

      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  };
};
