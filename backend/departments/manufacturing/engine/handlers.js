/**
 * MANUFACTURING & AYUSH BMR ENGINE
 *
 * Implements Schedule T Good Manufacturing Practices (GMP) for Ayurvedic Medicines.
 * Maximum business logic, calculations, statutory validations, and PDF dossiers
 * are executed in pure Rust via SuiteCoreBridge.
 */

const SuiteCoreBridge = require('../../../../frontend/shared/suite_core_bridge');
const dataBus = require('../../../core/sync/data-bus');

module.exports = function(db) {
  if (!db) {
    throw new Error('Database not initialized in manufacturing handlers');
  }

  function getCompanySettings() {
    try {
      const rows = db.prepare('SELECT key, value FROM app_settings').all();
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      if (!settings.company_name) settings.company_name = 'UTKAL CHEMICAL AUSHADHALAYA';
      if (!settings.company_ayush_licence) settings.company_ayush_licence = 'OR-02/AYUR';
      if (!settings.company_gstin) settings.company_gstin = '21AIDPF4446J1ZL';
      if (!settings.company_pan) settings.company_pan = 'AIDPF4446J';
      return settings;
    } catch (_) {
      return {
        company_name: 'UTKAL CHEMICAL AUSHADHALAYA',
        company_ayush_licence: 'OR-02/AYUR',
        company_gstin: '21AIDPF4446J1ZL',
        company_pan: 'AIDPF4446J'
      };
    }
  }

  return {
    // ==========================================
    // 1. RAW MATERIALS & INWARD GRN
    // ==========================================
    getRawMaterials: (req, res) => {
      try {
        const materials = db.prepare(`
          SELECT * FROM raw_materials 
          ORDER BY type ASC, name ASC
        `).all();
        res.json({ success: true, materials });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createRawMaterial: (req, res) => {
      try {
        const { name, odia_name, type, uom, current_stock, reorder_level, storage_location, hsn_code } = req.body;
        if (!name) return res.status(400).json({ error: 'Raw material name is required' });

        const info = db.prepare(`
          INSERT INTO raw_materials (name, odia_name, type, uom, current_stock, reorder_level, storage_location, hsn_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          name.trim(),
          odia_name ? odia_name.trim() : null,
          type || 'Botanical Herb',
          uom || 'KG',
          parseFloat(current_stock) || 0,
          parseFloat(reorder_level) || 10,
          storage_location || 'Godown Floor',
          hsn_code || '1211'
        );

        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getRawMaterialInward: (req, res) => {
      try {
        const inwards = db.prepare(`
          SELECT rmi.*, rm.name as raw_material_name, rm.uom, rm.type as material_type
          FROM raw_material_inward rmi
          JOIN raw_materials rm ON rmi.raw_material_id = rm.id
          ORDER BY rmi.receipt_date DESC, rmi.id DESC
          LIMIT 200
        `).all();
        res.json({ success: true, inwards });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createRawMaterialInward: (req, res) => {
      try {
        const { supplier_id, supplier_name, invoice_no, receipt_date, raw_material_id, vendor_lot_no, qty_received, unit_rate, qc_status, lab_report_no, notes } = req.body;
        if (!raw_material_id || !qty_received || !receipt_date) {
          return res.status(400).json({ error: 'Raw material, quantity, and receipt date are required' });
        }

        const qty = parseFloat(qty_received);
        const rate = parseFloat(unit_rate) || 0;
        const total = qty * rate;

        const tx = db.transaction(() => {
          const info = db.prepare(`
            INSERT INTO raw_material_inward (supplier_id, supplier_name, invoice_no, receipt_date, raw_material_id, vendor_lot_no, qty_received, unit_rate, total_amount, qc_status, lab_report_no, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            supplier_id || null,
            supplier_name || null,
            invoice_no || null,
            receipt_date,
            raw_material_id,
            vendor_lot_no || 'LOT-GENERAL',
            qty,
            rate,
            total,
            qc_status || 'Conforms',
            lab_report_no || null,
            notes || null
          );

          // Increment current stock
          db.prepare(`
            UPDATE raw_materials 
            SET current_stock = current_stock + ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(qty, raw_material_id);

          return info.lastInsertRowid;
        });

        const inwardId = tx();
        res.status(201).json({ success: true, id: inwardId });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 2. MASTER FORMULA RECORDS (MFR / RECIPES)
    // ==========================================
    getMasterFormulas: (req, res) => {
      try {
        const formulas = db.prepare(`
          SELECT mf.*, p.name as product_name, p.classification
          FROM master_formulas mf
          JOIN products p ON mf.product_id = p.id
          ORDER BY p.name ASC
        `).all();

        const formulasWithItems = formulas.map(f => {
          const items = db.prepare(`
            SELECT mfi.*, rm.name as raw_material_name, rm.uom, rm.type as material_type, rm.current_stock
            FROM master_formula_items mfi
            JOIN raw_materials rm ON mfi.raw_material_id = rm.id
            WHERE mfi.master_formula_id = ?
          `).all(f.id);
          return { ...f, items };
        });

        res.json({ success: true, formulas: formulasWithItems });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createMasterFormula: (req, res) => {
      try {
        const { product_id, formula_name, pharmacopoeial_ref, std_batch_size, std_batch_uom, expected_yield_percent, items } = req.body;
        if (!product_id || !formula_name) {
          return res.status(400).json({ error: 'Product and Formula Name are required' });
        }

        const tx = db.transaction(() => {
          const fInfo = db.prepare(`
            INSERT INTO master_formulas (product_id, formula_name, pharmacopoeial_ref, std_batch_size, std_batch_uom, expected_yield_percent)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            product_id,
            formula_name.trim(),
            pharmacopoeial_ref || 'AFI Part I / Classical Reference',
            parseFloat(std_batch_size) || 100,
            std_batch_uom || 'LTR',
            parseFloat(expected_yield_percent) || 95.0
          );
          const formulaId = fInfo.lastInsertRowid;

          if (Array.isArray(items)) {
            const itemStmt = db.prepare(`
              INSERT INTO master_formula_items (master_formula_id, raw_material_id, qty_required, stage)
              VALUES (?, ?, ?, ?)
            `);
            for (const item of items) {
              if (item.raw_material_id && item.qty_required) {
                itemStmt.run(formulaId, item.raw_material_id, parseFloat(item.qty_required), item.stage || 'Decoction');
              }
            }
          }
          return formulaId;
        });

        const formulaId = tx();
        res.status(201).json({ success: true, id: formulaId });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    scaleRecipeRust: (req, res) => {
      try {
        const { std_batch_size, planned_batch_size, items } = req.body;
        const result = SuiteCoreBridge.scaleRecipe({
          std_batch_size: parseFloat(std_batch_size) || 100,
          planned_batch_size: parseFloat(planned_batch_size) || 100,
          items: items || []
        });
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 3. BATCH MANUFACTURING RECORDS (BMR)
    // ==========================================
    getBmrBatches: (req, res) => {
      try {
        const { status } = req.query;
        let query = `
          SELECT b.*, p.name as product_name, p.hsn_code,
                 v.pack_size_value, v.pack_size_type,
                 mf.formula_name, mf.pharmacopoeial_ref
          FROM manufacturing_bmr b
          JOIN products p ON b.product_id = p.id
          LEFT JOIN variants v ON b.variant_id = v.id
          LEFT JOIN master_formulas mf ON b.master_formula_id = mf.id
        `;
        const params = [];
        if (status) {
          query += ` WHERE b.status = ? `;
          params.push(status);
        }
        query += ` ORDER BY b.id DESC LIMIT 100 `;

        const batches = db.prepare(query).all(...params);
        res.json({ success: true, batches });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createBmrBatch: (req, res) => {
      try {
        const { batch_no, product_id, variant_id, master_formula_id, mfg_date, exp_date, mrp, planned_qty, technical_person, deduct_stock } = req.body;
        if (!batch_no || !product_id || !mfg_date || !exp_date || !planned_qty) {
          return res.status(400).json({ error: 'Batch Number, Product, Dates, and Planned Qty are required' });
        }

        const bmrBatchNo = batch_no.trim();
        const pQty = parseFloat(planned_qty);

        // Fetch master formula items if available to auto-populate dispensing
        let formulaItems = [];
        let stdSize = 100.0;
        if (master_formula_id) {
          const formula = db.prepare('SELECT std_batch_size FROM master_formulas WHERE id = ?').get(master_formula_id);
          if (formula) stdSize = formula.std_batch_size;
          formulaItems = db.prepare(`
            SELECT mfi.*, rm.name as raw_material_name, rm.uom
            FROM master_formula_items mfi
            JOIN raw_materials rm ON mfi.raw_material_id = rm.id
            WHERE mfi.master_formula_id = ?
          `).all(master_formula_id);
        }

        // Scale recipe in Rust!
        let scaledItems = [];
        if (formulaItems.length > 0) {
          const rustScaled = SuiteCoreBridge.scaleRecipe({
            std_batch_size: stdSize,
            planned_batch_size: pQty,
            items: formulaItems.map(fi => ({
              raw_material_id: fi.raw_material_id,
              raw_material_name: fi.raw_material_name,
              uom: fi.uom,
              qty_per_std_batch: fi.qty_required,
              stage: fi.stage || 'Decoction'
            }))
          });
          scaledItems = rustScaled.items || [];
        }

        const tx = db.transaction(() => {
          const bInfo = db.prepare(`
            INSERT INTO manufacturing_bmr (
              batch_no, product_id, variant_id, master_formula_id, 
              mfg_date, exp_date, mrp, planned_qty, 
              status, technical_person
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROCESS', ?)
          `).run(
            bmrBatchNo,
            product_id,
            variant_id || null,
            master_formula_id || null,
            mfg_date,
            exp_date,
            parseFloat(mrp) || 0,
            pQty,
            technical_person || 'Approved Technical Person'
          );
          const bmrId = bInfo.lastInsertRowid;

          // Insert dispensing lines and deduct raw material stock
          const dispStmt = db.prepare(`
            INSERT INTO manufacturing_batch_dispensing (batch_id, raw_material_id, std_qty, actual_dispensed_qty, dispensed_by)
            VALUES (?, ?, ?, ?, ?)
          `);
          const deductStmt = db.prepare(`
            UPDATE raw_materials 
            SET current_stock = MAX(0, current_stock - ?), updated_at = datetime('now')
            WHERE id = ?
          `);

          for (const item of scaledItems) {
            dispStmt.run(bmrId, item.raw_material_id, item.std_qty, item.required_qty, technical_person || 'Chemist');
            if (deduct_stock !== false) {
              deductStmt.run(item.required_qty, item.raw_material_id);
            }
          }

          return bmrId;
        });

        const bmrId = tx();
        dataBus.broadcast('manufacturing:batch', 'created', { id: bmrId, batch_no: bmrBatchNo });

        res.status(201).json({ success: true, id: bmrId, batch_no: bmrBatchNo });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    reconcileYieldRust: (req, res) => {
      try {
        const { planned_qty, actual_output_qty, expected_yield_percent, permissible_loss_percent } = req.body;
        const result = SuiteCoreBridge.reconcileYield({
          planned_qty: parseFloat(planned_qty) || 0,
          actual_output_qty: parseFloat(actual_output_qty) || 0,
          expected_yield_percent: parseFloat(expected_yield_percent) || 95.0,
          permissible_loss_percent: parseFloat(permissible_loss_percent) || 5.0
        });
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateBatchStatus: (req, res) => {
      try {
        const { id } = req.params;
        const { status, actual_output_qty, yield_percent, lab_name, lab_report_no, coa_date, coa_status, retention_sample_qty, retention_location } = req.body;

        db.prepare(`
          UPDATE manufacturing_bmr
          SET status = COALESCE(?, status),
              actual_output_qty = COALESCE(?, actual_output_qty),
              yield_percent = COALESCE(?, yield_percent),
              lab_name = COALESCE(?, lab_name),
              lab_report_no = COALESCE(?, lab_report_no),
              coa_date = COALESCE(?, coa_date),
              coa_status = COALESCE(?, coa_status),
              retention_sample_qty = COALESCE(?, retention_sample_qty),
              retention_location = COALESCE(?, retention_location),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(
          status || null,
          actual_output_qty !== undefined ? parseFloat(actual_output_qty) : null,
          yield_percent !== undefined ? parseFloat(yield_percent) : null,
          lab_name || null,
          lab_report_no || null,
          coa_date || null,
          coa_status || null,
          retention_sample_qty || null,
          retention_location || null,
          id
        );

        dataBus.broadcast('manufacturing:batch', 'updated', { id, status });
        res.json({ success: true, id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 4. BATCH RELEASE FOR SALE (HAND-OFF TO BILLING)
    // ==========================================
    releaseBatch: (req, res) => {
      try {
        const { id } = req.params;
        const batch = db.prepare('SELECT * FROM manufacturing_bmr WHERE id = ?').get(id);
        if (!batch) return res.status(404).json({ error: 'BMR Batch not found' });

        const {
          lab_name = batch.lab_name || 'State Government Approved Testing Lab (Form 48)',
          lab_report_no = batch.lab_report_no || '',
          coa_date = batch.coa_date || '',
          coa_status = batch.coa_status || 'PASSED',
          technical_person = batch.technical_person || 'Approved Technical Person',
          actual_output_qty = batch.actual_output_qty || batch.planned_qty,
          retention_sample_qty = batch.retention_sample_qty || '2 Retail Packs',
          retention_location = batch.retention_location || 'Factory QC Almirah'
        } = req.body;

        const yieldRec = SuiteCoreBridge.reconcileYield({
          planned_qty: batch.planned_qty,
          actual_output_qty: parseFloat(actual_output_qty)
        });

        // 1. Validate compliance in pure Rust!
        const validation = SuiteCoreBridge.validateBatchRelease({
          batch_no: batch.batch_no,
          mfg_date: batch.mfg_date,
          exp_date: batch.exp_date,
          planned_qty: batch.planned_qty,
          actual_output_qty: parseFloat(actual_output_qty),
          yield_percent: yieldRec.actual_yield_percent,
          lab_name,
          lab_report_no,
          coa_date,
          coa_status,
          technical_person,
          retention_sample_qty,
          retention_location
        });

        if (!validation.is_valid) {
          return res.status(422).json({
            error: 'Statutory compliance validation failed in Rust core',
            errors: validation.errors,
            warnings: validation.warnings
          });
        }

        // 2. Perform release & commercial hand-off in transaction
        const tx = db.transaction(() => {
          // Update BMR record
          db.prepare(`
            UPDATE manufacturing_bmr
            SET status = 'RELEASED',
                actual_output_qty = ?,
                yield_percent = ?,
                lab_name = ?,
                lab_report_no = ?,
                coa_date = ?,
                coa_status = ?,
                technical_person = ?,
                retention_sample_qty = ?,
                retention_location = ?,
                released_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(
            parseFloat(actual_output_qty),
            yieldRec.actual_yield_percent,
            lab_name,
            lab_report_no,
            coa_date,
            coa_status,
            technical_person,
            retention_sample_qty,
            retention_location,
            id
          );

          // Find or create variant for the product
          let variantId = batch.variant_id;
          if (!variantId) {
            const defaultVar = db.prepare('SELECT id FROM variants WHERE product_id = ? LIMIT 1').get(batch.product_id);
            if (defaultVar) {
              variantId = defaultVar.id;
            } else {
              const vInfo = db.prepare(`
                INSERT INTO variants (product_id, pack_size_value, pack_size_type)
                VALUES (?, '1', 's')
              `).run(batch.product_id);
              variantId = vInfo.lastInsertRowid;
            }
          }

          // Insert or update commercial batch in `batches` table
          const existingBatch = db.prepare('SELECT id FROM batches WHERE variant_id = ? AND batch_no = ?').get(variantId, batch.batch_no);
          if (!existingBatch) {
            db.prepare(`
              INSERT INTO batches (variant_id, batch_no, mrp, mfg_date, exp_date, units_sold)
              VALUES (?, ?, ?, ?, ?, 0)
            `).run(variantId, batch.batch_no, batch.mrp, batch.mfg_date, batch.exp_date);
          }
        });

        tx();

        // Real-time broadcast: Billing and Product List pick it up immediately!
        dataBus.broadcast('inventory:batch', 'created', { batch_no: batch.batch_no, product_id: batch.product_id });
        dataBus.broadcast('manufacturing:batch', 'released', { id, batch_no: batch.batch_no });

        res.json({
          success: true,
          message: `Batch ${batch.batch_no} officially released and deposited into commercial billing catalog.`,
          statutory_notes: validation.statutory_notes
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 5. STATUTORY BMR PDF DOSSIER GENERATION
    // ==========================================
    renderBmrDossierPdf: (req, res) => {
      try {
        const { id } = req.params;
        const batch = db.prepare(`
          SELECT b.*, p.name as product_name,
                 v.pack_size_value || ' ' || v.pack_size_type as pack_size,
                 mf.formula_name, mf.pharmacopoeial_ref
          FROM manufacturing_bmr b
          JOIN products p ON b.product_id = p.id
          LEFT JOIN variants v ON b.variant_id = v.id
          LEFT JOIN master_formulas mf ON b.master_formula_id = mf.id
          WHERE b.id = ?
        `).get(id);

        if (!batch) return res.status(404).json({ error: 'BMR Batch not found' });

        const dispensing = db.prepare(`
          SELECT d.*, rm.name as raw_material_name, rm.uom
          FROM manufacturing_batch_dispensing d
          JOIN raw_materials rm ON d.raw_material_id = rm.id
          WHERE d.batch_id = ?
        `).all(id);

        const dispensingRows = dispensing.map((d, idx) => ({
          sl: (idx + 1).toString(),
          ingredient_name: d.raw_material_name,
          stage: 'Dispensed',
          std_qty: `${d.std_qty} ${d.uom}`,
          actual_qty: `${d.actual_dispensed_qty} ${d.uom}`,
          verified_by: d.dispensed_by || 'Chemist'
        }));

        const app_settings = getCompanySettings();

        // Render in pure Rust!
        const pdfResult = SuiteCoreBridge.renderBmrDossierPdf({
          batch_no: batch.batch_no,
          product_name: batch.product_name,
          pharmacopoeial_ref: batch.pharmacopoeial_ref || 'AFI Part I / Classical Ayurvedic Text',
          mfg_date: batch.mfg_date,
          exp_date: batch.exp_date,
          planned_qty: `${batch.planned_qty} Units`,
          actual_output_qty: `${batch.actual_output_qty || batch.planned_qty} Units`,
          pack_size: batch.pack_size || 'Standard Pack',
          mrp: (batch.mrp || 0).toFixed(2),
          yield_percent: (batch.yield_percent || 97.0).toFixed(1),
          status: batch.status,
          lab_name: batch.lab_name || 'State Government Approved Drug Testing Lab (Form 48)',
          lab_report_no: batch.lab_report_no || 'CoA-PENDING',
          coa_date: batch.coa_date || 'Awaiting Report',
          coa_status: batch.coa_status || 'PASSED',
          technical_person: batch.technical_person || 'Approved Technical Person (AYUSH)',
          retention_sample_qty: batch.retention_sample_qty || '2 Retail Packs',
          retention_location: batch.retention_location || 'Factory QC Almirah Rack R-1',
          dispensing_items: dispensingRows,
          process_logs: [],
          app_settings
        });

        res.json({
          success: true,
          batch_no: batch.batch_no,
          pdf_base64: pdfResult.pdf_base64,
          byte_count: pdfResult.byte_count
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 6. ATTACHMENTS & DOCUMENTATION (PHOTOS/NOTES)
    // ==========================================
    getAttachments: (req, res) => {
      try {
        const { entityType, entityId } = req.params;
        const rows = db.prepare(`
          SELECT id, entity_type, entity_id, file_name, file_type, caption, stage, created_at,
                 image_data
          FROM manufacturing_attachments
          WHERE entity_type = ? AND entity_id = ?
          ORDER BY id DESC
        `).all(entityType.toUpperCase(), parseInt(entityId, 10));
        res.json({ success: true, attachments: rows });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createAttachment: (req, res) => {
      try {
        const { entity_type, entity_id, file_name, file_type, image_data, caption, stage } = req.body;
        if (!entity_type || !entity_id || !image_data) {
          return res.status(400).json({ error: 'entity_type, entity_id, and image_data are required' });
        }

        const info = db.prepare(`
          INSERT INTO manufacturing_attachments (entity_type, entity_id, file_name, file_type, image_data, caption, stage)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          entity_type.toUpperCase(),
          parseInt(entity_id, 10),
          file_name || 'attachment.png',
          file_type || 'image/png',
          image_data,
          caption || null,
          stage || null
        );

        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteAttachment: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('DELETE FROM manufacturing_attachments WHERE id = ?').run(id);
        res.json({ success: true, id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 7. TECHNICAL STAFF & DOCTORS MASTER
    // ==========================================
    getTechnicalStaff: (req, res) => {
      try {
        const staff = db.prepare('SELECT * FROM technical_staff WHERE is_active = 1 ORDER BY name ASC').all();
        res.json({ success: true, staff });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createTechnicalStaff: (req, res) => {
      try {
        const { name, role, qualification, registration_no, phone, email } = req.body;
        if (!name) return res.status(400).json({ error: 'Staff name is required' });

        const info = db.prepare(`
          INSERT INTO technical_staff (name, role, qualification, registration_no, phone, email)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          name.trim(),
          role || 'Approved Technical Person (AYUSH)',
          qualification || null,
          registration_no || null,
          phone || null,
          email || null
        );
        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateTechnicalStaff: (req, res) => {
      try {
        const { id } = req.params;
        const { name, role, qualification, registration_no, phone, email, is_active } = req.body;
        db.prepare(`
          UPDATE technical_staff
          SET name = COALESCE(?, name),
              role = COALESCE(?, role),
              qualification = COALESCE(?, qualification),
              registration_no = COALESCE(?, registration_no),
              phone = COALESCE(?, phone),
              email = COALESCE(?, email),
              is_active = COALESCE(?, is_active),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(name, role, qualification, registration_no, phone, email, is_active, id);
        res.json({ success: true, id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteTechnicalStaff: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare("UPDATE technical_staff SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
        res.json({ success: true, id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 8. RAW MATERIALS EDIT & DEACTIVATE
    // ==========================================
    updateRawMaterial: (req, res) => {
      try {
        const { id } = req.params;
        const { name, odia_name, type, uom, current_stock, reorder_level, storage_location, hsn_code, shelf_life_months, notes } = req.body;
        db.prepare(`
          UPDATE raw_materials
          SET name = COALESCE(?, name),
              odia_name = COALESCE(?, odia_name),
              type = COALESCE(?, type),
              uom = COALESCE(?, uom),
              current_stock = COALESCE(?, current_stock),
              reorder_level = COALESCE(?, reorder_level),
              storage_location = COALESCE(?, storage_location),
              hsn_code = COALESCE(?, hsn_code),
              shelf_life_months = COALESCE(?, shelf_life_months),
              notes = COALESCE(?, notes),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(
          name, odia_name, type, uom,
          current_stock !== undefined ? parseFloat(current_stock) : null,
          reorder_level !== undefined ? parseFloat(reorder_level) : null,
          storage_location, hsn_code,
          shelf_life_months !== undefined ? parseInt(shelf_life_months, 10) : null,
          notes,
          id
        );
        res.json({ success: true, id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteRawMaterial: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare("UPDATE raw_materials SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
        res.json({ success: true, id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 9. SUPPLIERS & INWARD PROCUREMENT SUITE
    // ==========================================
    getSuppliers: (req, res) => {
      try {
        const suppliers = db.prepare(`
          SELECT c.*,
            COALESCE((SELECT SUM(total_amount) FROM raw_material_inward WHERE supplier_id = c.id), 0) as total_purchases,
            COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = c.id), 0) as total_paid,
            COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = c.id), 0) as po_count
          FROM contacts c
          WHERE c.type = 'Supplier'
          ORDER BY c.name ASC
        `).all();

        const formatted = suppliers.map(s => ({
          ...s,
          balance_due: Math.max(0, (s.total_purchases || 0) + (s.opening_balance || 0) - (s.total_paid || 0))
        }));

        res.json({ success: true, suppliers: formatted });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createSupplier: (req, res) => {
      try {
        const { name, email, phone, address, gstin, pan, opening_balance, notes } = req.body;
        if (!name) return res.status(400).json({ error: 'Supplier name is required' });

        const info = db.prepare(`
          INSERT INTO contacts (name, email, phone, address, gstin, pan, opening_balance, notes, type, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Supplier', 'ACTIVE')
        `).run(
          name.trim(),
          email || null,
          phone || null,
          address || null,
          gstin || null,
          pan || null,
          parseFloat(opening_balance) || 0,
          notes || null
        );

        dataBus.broadcast('contacts:supplier', 'created', { id: info.lastInsertRowid, name });
        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getSupplierLedger: (req, res) => {
      try {
        const { id } = req.params;
        const supplier = db.prepare("SELECT * FROM contacts WHERE id = ? AND type = 'Supplier'").get(id);
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

        // Inward bills (Credits to supplier payable)
        const bills = db.prepare(`
          SELECT rmi.id, rmi.invoice_no, rmi.receipt_date as date, rmi.total_amount,
                 rm.name as item_name, rmi.qty_received, rm.uom, 'INWARD_BILL' as entry_type
          FROM raw_material_inward rmi
          JOIN raw_materials rm ON rmi.raw_material_id = rm.id
          WHERE rmi.supplier_id = ?
          ORDER BY rmi.receipt_date ASC
        `).all(id);

        // Payments made (Debits to supplier payable)
        const payments = db.prepare(`
          SELECT id, payment_number, payment_date as date, amount as total_amount,
                 payment_mode, reference_no, notes, 'PAYMENT' as entry_type
          FROM supplier_payments
          WHERE supplier_id = ?
          ORDER BY payment_date ASC
        `).all(id);

        // Merge and calculate running balance
        const allTransactions = [...bills, ...payments].sort((a, b) => new Date(a.date) - new Date(b.date));
        let runningBalance = supplier.opening_balance || 0;

        const ledgerEntries = allTransactions.map(tx => {
          if (tx.entry_type === 'INWARD_BILL') {
            runningBalance += tx.total_amount;
            return { ...tx, credit: tx.total_amount, debit: 0, balance: runningBalance };
          } else {
            runningBalance -= tx.total_amount;
            return { ...tx, credit: 0, debit: tx.total_amount, balance: runningBalance };
          }
        });

        res.json({
          success: true,
          supplier,
          opening_balance: supplier.opening_balance || 0,
          current_balance: runningBalance,
          entries: ledgerEntries
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 10. PURCHASE ORDERS (INWARD ORDERS)
    // ==========================================
    getPurchaseOrders: (req, res) => {
      try {
        const pos = db.prepare(`
          SELECT po.*, c.name as supplier_name, c.phone as supplier_phone
          FROM purchase_orders po
          JOIN contacts c ON po.supplier_id = c.id
          ORDER BY po.id DESC
        `).all();

        const posWithItems = pos.map(p => {
          const items = db.prepare(`
            SELECT poi.*, rm.name as raw_material_name, rm.uom
            FROM purchase_order_items poi
            JOIN raw_materials rm ON poi.raw_material_id = rm.id
            WHERE poi.purchase_order_id = ?
          `).all(p.id);
          return { ...p, items };
        });

        res.json({ success: true, purchase_orders: posWithItems });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createPurchaseOrder: (req, res) => {
      try {
        const { po_number, supplier_id, order_date, expected_delivery_date, notes, items } = req.body;
        if (!supplier_id || !order_date || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'Supplier, order date, and items are required' });
        }

        const generatedPoNo = po_number || `PO-${Date.now().toString().slice(-6)}`;
        const totalAmount = items.reduce((sum, it) => sum + ((parseFloat(it.qty_ordered) || 0) * (parseFloat(it.unit_rate) || 0)), 0);

        const tx = db.transaction(() => {
          const poInfo = db.prepare(`
            INSERT INTO purchase_orders (po_number, supplier_id, order_date, expected_delivery_date, status, total_amount, notes)
            VALUES (?, ?, ?, ?, 'PLACED', ?, ?)
          `).run(generatedPoNo, supplier_id, order_date, expected_delivery_date || null, totalAmount, notes || null);
          const poId = poInfo.lastInsertRowid;

          const itemStmt = db.prepare(`
            INSERT INTO purchase_order_items (purchase_order_id, raw_material_id, qty_ordered, unit_rate, tax_percent, total_amount)
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          for (const it of items) {
            const qty = parseFloat(it.qty_ordered) || 0;
            const rate = parseFloat(it.unit_rate) || 0;
            const lineTotal = qty * rate;
            itemStmt.run(poId, it.raw_material_id, qty, rate, parseFloat(it.tax_percent) || 5.0, lineTotal);
          }
          return poId;
        });

        const poId = tx();
        dataBus.broadcast('purchase_order:created', 'created', { id: poId, po_number: generatedPoNo });
        res.status(201).json({ success: true, id: poId, po_number: generatedPoNo });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updatePurchaseOrderStatus: (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        db.prepare("UPDATE purchase_orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
        res.json({ success: true, id, status });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 11. SUPPLIER PAYMENTS (DISBURSEMENT)
    // ==========================================
    getSupplierPayments: (req, res) => {
      try {
        const payments = db.prepare(`
          SELECT sp.*, c.name as supplier_name
          FROM supplier_payments sp
          JOIN contacts c ON sp.supplier_id = c.id
          ORDER BY sp.payment_date DESC, sp.id DESC
        `).all();
        res.json({ success: true, payments });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createSupplierPayment: (req, res) => {
      try {
        const { payment_number, supplier_id, payment_date, amount, payment_mode, reference_no, notes } = req.body;
        if (!supplier_id || !payment_date || !amount) {
          return res.status(400).json({ error: 'Supplier, payment date, and amount are required' });
        }

        const genPayNo = payment_number || `PAY-SUP-${Date.now().toString().slice(-6)}`;
        const payAmount = parseFloat(amount);

        const info = db.prepare(`
          INSERT INTO supplier_payments (payment_number, supplier_id, payment_date, amount, payment_mode, reference_no, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          genPayNo,
          supplier_id,
          payment_date,
          payAmount,
          payment_mode || 'BANK',
          reference_no || null,
          notes || null
        );

        dataBus.broadcast('supplier:payment', 'created', { id: info.lastInsertRowid, supplier_id, amount: payAmount });
        res.status(201).json({ success: true, id: info.lastInsertRowid, payment_number: genPayNo });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ==========================================
    // 12. AI AYURVEDIC FORMULATION & VISION SCANNER
    // ==========================================
    getAiFormulationAdvice: async (req, res) => {
      try {
        const { prompt, medicine_name } = req.body;
        if (!prompt && !medicine_name) {
          return res.status(400).json({ error: 'Medicine name or query prompt is required' });
        }

        let aiText = '';
        try {
          const { GoogleGenerativeAI } = require('@google/generative-ai');
          const genAI = new GoogleGenerativeAI('AIzaSyDUAiHHjq0TZMUfi602inE0FVu2dJShoa8');
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

          const systemPrompt = `You are the Master Ayurvedic Formulation & Schedule T GMP Technical Consultant for Utkal Chemical Aushadhalaya (Drug Licence: OR-02/AYUR).
Provide authoritative advice conforming strictly to the Ayurvedic Formulary of India (AFI Part I/II), Charaka Samhita, and Sharangadhara Samhita.
When queried about a medicine, respond with:
1. Classical Reference (Grantha & Chapter)
2. Master BoM Ingredients with standard proportions (Parts / Qty for 100 LTR/KG batch)
3. Manufacturing Stages & Critical Process Controls (Kvatha reduction ratio, Taila Murchhana, Paka Lakshana)
4. Schedule T Mandated In-Process QC tests
5. Safe finished shelf-life and storage conditions.
Keep formatting clean, professional, and directly actionable for factory floor chemists.`;

          const result = await model.generateContent(`${systemPrompt}\n\nQuery: ${prompt || `Provide full Master Formula and GMP processing guidelines for ${medicine_name}`}`);
          aiText = result.response.text();
        } catch (apiErr) {
          aiText = `[Offline Classical Knowledge Base]\n\nStandard Ayurvedic Formulary of India (AFI Part I) guidance for: ${medicine_name || prompt}\n- Standard Extraction Ratio: 1 part crude herb to 16 parts water, reduced to 1/4th (Kvatha Nirmana).\n- Critical Control Point: Filter through 4-fold muslin cloth under 40°C.\n- Schedule T Storage: Preserve in tightly closed amber containers away from direct moisture.\n(Note: Live Gemini advice offline: ${apiErr.message})`;
        }

        res.json({ success: true, advice: aiText });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    scanDocumentAi: async (req, res) => {
      try {
        const { image_base64, document_type } = req.body;
        if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });

        try {
          const { GoogleGenerativeAI } = require('@google/generative-ai');
          const genAI = new GoogleGenerativeAI('AIzaSyDUAiHHjq0TZMUfi602inE0FVu2dJShoa8');
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

          const prompt = document_type === 'COA' 
            ? 'Extract and return JSON with: { "lab_name": string, "lab_report_no": string, "coa_date": "YYYY-MM-DD", "status": "PASSED"|"FAILED", "sample_tested": string, "assay_percent": number } from this Certificate of Analysis document photo.'
            : 'Extract and return JSON with: { "supplier_name": string, "invoice_no": string, "invoice_date": "YYYY-MM-DD", "items": [{ "name": string, "qty": number, "rate": number, "hsn": string }], "total_amount": number } from this supplier bill/invoice photo.';

          const cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');
          const result = await model.generateContent([
            prompt,
            { inlineData: { data: cleanBase64, mimeType: 'image/jpeg' } }
          ]);

          const rawText = result.response.text();
          let parsedJson = null;
          try {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsedJson = JSON.parse(jsonMatch[0]);
          } catch (_) {}

          res.json({ success: true, text: rawText, extracted: parsedJson });
        } catch (apiErr) {
          res.json({ success: false, error: apiErr.message, fallback: 'Please enter details manually.' });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  };
};

