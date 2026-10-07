const path = require('path');
const createActivityLogger = require('../../../core/audit/activity-logger');
const { buildProductListResponse, buildProductCategoriesResponse } = require('../../../shared/api/product-list-contract');
const productListDepartment = require('../service');
const dataBus = require('../../../core/sync/data-bus');
const QRCode = require('qrcode');
const archiver = require('archiver');

let SuiteCoreBridge = null;
try {
  SuiteCoreBridge = require(path.resolve(__dirname, '../../../../frontend/shared/suite_core_bridge.js'));
} catch (e) {
  console.warn('[ProductSearch] Failed to load SuiteCoreBridge in product handlers:', e.message);
}

function naturalSortBatches(batches) {
  if (!Array.isArray(batches)) return [];
  return batches.sort((a, b) => 
    (a.batch_no || '').localeCompare(b.batch_no || '', undefined, { numeric: true, sensitivity: 'base' })
  );
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[<>&"']/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;'
    })[character]);
}

function qrRowsFromUrl(url) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const { size, data } = qr.modules;
  return Array.from({ length: size }, (_, row) =>
    Array.from(data.subarray(row * size, (row + 1) * size), module => module ? '1' : '0').join('')
  );
}

function renderQrSvg(label) {
  const size = label.qr_rows.length;
  const pathData = [];
  label.qr_rows.forEach((row, y) => {
    for (let x = 0; x < size; x++) {
      if (row[x] === '1') pathData.push(`M${x + 4} ${y + 4}h1v1h-1z`);
    }
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 8} ${size + 8}" role="img" aria-label="${escapeXml(label.product_name)} QR code">`,
    `<title>${escapeXml(label.product_name)}${label.batch_no ? ` - ${escapeXml(label.batch_no)}` : ''}</title>`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<path d="${pathData.join('')}" fill="#000"/>`,
    `</svg>`
  ].join('');
}

function csvValue(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function catalogLabelsCsv(labels) {
  const header = ['product_id', 'product_name', 'variant_id', 'variant', 'batch_id', 'batch_no', 'mrp', 'qr_url', 'svg_file'];
  const rows = labels.map(label => [
    label.product_id,
    label.product_name,
    label.variant_id,
    label.variant,
    label.batch_id,
    label.batch_no,
    label.mrp === null || label.mrp === undefined ? '' : Number(label.mrp).toFixed(2),
    label.qr_url,
    label.svg_file
  ]);
  return [header, ...rows].map(row => row.map(csvValue).join(',')).join('\r\n');
}

module.exports = function(db) {
  // Validate database is available
  if (!db) {
    console.error('✗ Database not initialized in product handlers');
    throw new Error('Database not initialized');
  }
  
  const activityLogger = createActivityLogger(db);
  
  return {
    // ============= PRODUCTS =============
    getProducts: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const rawSearch = req.query.search;
        const searchQuery = typeof rawSearch === 'string' ? rawSearch.trim() : null;
        let products;

        if (searchQuery) {
          let wasmMatched = false;
          // Fast-Path: Rust WebAssembly high-precision typo-tolerant search
          if (SuiteCoreBridge && SuiteCoreBridge.isWasmLoaded()) {
            try {
              const allStmt = db.prepare(`
                SELECT p.*, c.name as category_name,
                       COALESCE(u_creator.role, 'owner') as created_by_role,
                       COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
                       u_editor.role as last_edited_by_role,
                       COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN users u_creator ON p.created_by_user_id = u_creator.id
                LEFT JOIN users u_editor ON p.last_edited_by_user_id = u_editor.id
                ORDER BY p.created_at DESC
              `);
              const allProducts = allStmt.all();
              products = SuiteCoreBridge.searchCatalog(searchQuery, allProducts, { limit: 50, min_score: 25.0 });
              wasmMatched = true;
            } catch (wErr) {
              console.warn('[ProductSearch] WASM search failed, falling back to SQL LIKE:', wErr.message);
            }
          }

          if (!wasmMatched) {
            // Fallback: SQL LIKE
            const stmt = db.prepare(`
              SELECT p.*, c.name as category_name,
                     COALESCE(u_creator.role, 'owner') as created_by_role,
                     COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
                     u_editor.role as last_edited_by_role,
                     COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name
              FROM products p
              LEFT JOIN categories c ON p.category_id = c.id
              LEFT JOIN users u_creator ON p.created_by_user_id = u_creator.id
              LEFT JOIN users u_editor ON p.last_edited_by_user_id = u_editor.id
              WHERE LOWER(p.name) LIKE LOWER(?)
                 OR LOWER(COALESCE(p.odia_name, '')) LIKE LOWER(?)
                 OR LOWER(COALESCE(c.name, '')) LIKE LOWER(?)
              ORDER BY p.created_at DESC
            `);
            const term = `%${searchQuery}%`;
            products = stmt.all(term, term, term);
          }
        } else {
          // Get all products
          stmt = db.prepare(`
            SELECT p.*, c.name as category_name,
                   COALESCE(u_creator.role, 'owner') as created_by_role,
                   COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
                   u_editor.role as last_edited_by_role,
                   COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN users u_creator ON p.created_by_user_id = u_creator.id
            LEFT JOIN users u_editor ON p.last_edited_by_user_id = u_editor.id
            ORDER BY p.created_at DESC
          `);
          products = stmt.all();
        }

        const enrichedProducts = products.map(product => {
          const variantsStmt = db.prepare(`
            SELECT id, product_id, pack_size_value, pack_size_type, created_at, updated_at
            FROM variants
            WHERE product_id = ?
            ORDER BY CAST(pack_size_value AS REAL) ASC, id ASC
          `);
          const variants = variantsStmt.all(product.id);

          const allBatchesStmt = db.prepare(`
            SELECT b.id, b.variant_id, b.batch_no, b.mrp, b.mfg_date, b.exp_date,
              (
                COALESCE((
                  SELECT SUM(ii.qty) 
                  FROM invoice_items ii 
                  WHERE ii.batch_id = b.id
                     OR (ii.batch_id IS NULL AND ii.variant_id = b.variant_id AND ii.batch_no = b.batch_no)
                     OR (ii.batch_id IS NULL AND ii.variant_id IS NULL AND ii.batch_no = b.batch_no AND ii.product_id = (SELECT product_id FROM variants WHERE id = b.variant_id))
                ), 0) + COALESCE(b.units_sold, 0)
              ) AS units_sold,
              b.created_at, b.updated_at
            FROM batches b
            INNER JOIN variants v ON b.variant_id = v.id
            WHERE v.product_id = ?
            ORDER BY b.batch_no COLLATE NOCASE ASC
          `);
          const allBatches = naturalSortBatches(allBatchesStmt.all(product.id));

          const enrichedVariants = variants.map(variant => {
            const batchesStmt = db.prepare(`
              SELECT id, variant_id, batch_no, mrp, mfg_date, exp_date,
                (
                  COALESCE((
                    SELECT SUM(ii.qty) 
                    FROM invoice_items ii 
                    WHERE ii.batch_id = batches.id
                       OR (ii.batch_id IS NULL AND ii.variant_id = batches.variant_id AND ii.batch_no = batches.batch_no)
                       OR (ii.batch_id IS NULL AND ii.variant_id IS NULL AND ii.batch_no = batches.batch_no AND ii.product_id = (SELECT product_id FROM variants WHERE id = batches.variant_id))
                  ), 0) + COALESCE(batches.units_sold, 0)
                ) AS units_sold,
                created_at, updated_at
              FROM batches
              WHERE variant_id = ?
              ORDER BY batch_no COLLATE NOCASE ASC
            `);
            const batches = naturalSortBatches(batchesStmt.all(variant.id));
            return { ...variant, batches };
          });

          let pack = null, batch_no = null, mrp = null;
          if (enrichedVariants.length > 0) {
            const firstVariant = enrichedVariants[0];
            pack = `${firstVariant.pack_size_value} ${firstVariant.pack_size_type}`;

            if (firstVariant.batches && firstVariant.batches.length > 0) {
              const firstBatch = firstVariant.batches[0];
              batch_no = firstBatch.batch_no;
              mrp = firstBatch.mrp;
            }
          }

          return { ...product, variants: enrichedVariants, batches: allBatches, pack, batch_no, mrp };
        });

        const response = productListDepartment.getProducts(enrichedProducts, { requestId: req.requestId });
        return res.json(response);
      } catch (error) {
        console.error('Error in getProducts:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    },

    createProduct: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { name, category_id, category_name, classification, variants } = req.body;

        if (!name) {
          return res.status(400).json({ error: 'Product name is required' });
        }

        // Resolve category_id from category_name if provided
        let finalCategoryId = category_id;
        if (!finalCategoryId && category_name) {
          try {
            const category = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(category_name);
            if (category) {
              finalCategoryId = category.id;
            } else {
              return res.status(404).json({ error: `Category '${category_name}' not found` });
            }
          } catch (err) {
            console.error('Error looking up category:', err);
            return res.status(500).json({ error: 'Error looking up category' });
          }
        }

        const creatorId = req.user ? (req.user.id || req.user.userId) : null;
        // Use a transaction for atomic product creation
        const createTransaction = db.transaction((data) => {
          const { name, finalCategoryId, classification, variants } = data;
          
          // 1. Create product
          const productStmt = db.prepare(`
            INSERT INTO products (name, category_id, classification, created_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
          `);
          const productInfo = productStmt.run(name, finalCategoryId || null, classification || null, creatorId);
          const productId = productInfo.lastInsertRowid;

          // 2. Insert variants and their batches
          if (Array.isArray(variants)) {
            variants.forEach(variant => {
              const variantStmt = db.prepare(`
                INSERT INTO variants (product_id, pack_size_value, pack_size_type, created_at, updated_at)
                VALUES (?, ?, ?, datetime('now'), datetime('now'))
              `);
              const variantInfo = variantStmt.run(
                productId, 
                variant.pack_size_value || '1',
                variant.pack_size_type || 's'
              );
              const variantId = variantInfo.lastInsertRowid;

              // Insert batches for this variant
              if (Array.isArray(variant.batches)) {
                variant.batches.forEach(batch => {
                  const batchStmt = db.prepare(`
                    INSERT INTO batches (variant_id, batch_no, mrp, mfg_date, exp_date, units_sold, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                  `);
                  batchStmt.run(
                    variantId, 
                    batch.batch_no || 'DEFAULT', 
                    batch.mrp || 0,
                    batch.mfg_date || null,
                    batch.exp_date || null,
                    batch.units_sold || 0
                  );
                });
              }
            });
          }
          return productId;
        });

        const productId = createTransaction({ name, finalCategoryId, classification, variants });

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'products',
          action: 'create',
          resourceType: 'product',
          resourceId: productId,
          resourceName: name,
          metadata: { category_id: finalCategoryId, classification, variants_count: variants ? variants.length : 0 }
        });

        // Real-Time SSE Broadcast
        dataBus.broadcast('inventory:product', 'created', { id: productId, name, category_id: finalCategoryId });

        res.status(201).json({ 
          success: true, 
          id: productId,
          name: name,
          category_id: finalCategoryId,
          classification: classification
        });
      } catch (error) {
        console.error('Error creating product:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    getProduct: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Product ID required' });

        const stmt = db.prepare(`
          SELECT p.*, c.name as category_name,
                 COALESCE(u_creator.role, 'owner') as created_by_role,
                 COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
                 u_editor.role as last_edited_by_role,
                 COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN users u_creator ON p.created_by_user_id = u_creator.id
          LEFT JOIN users u_editor ON p.last_edited_by_user_id = u_editor.id
          WHERE p.id = ?
        `);
        const product = stmt.get(id);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const variantsStmt = db.prepare(`
          SELECT id, product_id, pack_size_value, pack_size_type, created_at, updated_at
          FROM variants
          WHERE product_id = ?
          ORDER BY id
        `);
        const variants = variantsStmt.all(id);

        const enrichedVariants = variants.map(variant => {
          const batchesStmt = db.prepare(`
            SELECT id, variant_id, batch_no, mrp, mfg_date, exp_date,
              (
                COALESCE((
                  SELECT SUM(ii.qty) 
                  FROM invoice_items ii 
                  WHERE ii.batch_id = batches.id
                     OR (ii.batch_id IS NULL AND ii.variant_id = batches.variant_id AND ii.batch_no = batches.batch_no)
                     OR (ii.batch_id IS NULL AND ii.variant_id IS NULL AND ii.batch_no = batches.batch_no AND ii.product_id = (SELECT product_id FROM variants WHERE id = batches.variant_id))
                ), 0) + COALESCE(batches.units_sold, 0)
              ) AS units_sold,
              created_at, updated_at
            FROM batches
            WHERE variant_id = ?
            ORDER BY batch_no COLLATE NOCASE ASC
          `);
          const batches = naturalSortBatches(batchesStmt.all(variant.id));
          return { ...variant, batches };
        });

        res.json({ ...product, variants: enrichedVariants });
      } catch (error) {
        console.error('Error getting product:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    updateProduct: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { id } = req.params;
        const { name, category_id, category_name, classification, variants } = req.body;

        if (!id) return res.status(400).json({ error: 'Product ID required' });

        // Resolve category_id from category_name if provided and id is missing
        let finalCategoryId = category_id;
        if (!finalCategoryId && category_name) {
          try {
            const category = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(category_name);
            if (category) {
              finalCategoryId = category.id;
            }
          } catch (err) {
            console.error('Error looking up category during update:', err);
          }
        }

        const editorId = req.user ? (req.user.id || req.user.userId) : null;
        // Use a transaction for comprehensive product update
        const updateTransaction = db.transaction((data) => {
          const { productId, name, categoryId, classification, variants } = data;

          // 1. Update basic product info
          const productStmt = db.prepare(`
            UPDATE products
            SET name = COALESCE(?, name),
                category_id = COALESCE(?, category_id),
                classification = COALESCE(?, classification),
                last_edited_by_user_id = COALESCE(?, last_edited_by_user_id),
                updated_at = datetime('now')
            WHERE id = ?
          `);
          const productResult = productStmt.run(name || null, categoryId || null, classification || null, editorId, productId);
          
          if (productResult.changes === 0) {
            // Check if product actually exists
            const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
            if (!exists) throw new Error('Product not found');
            // If it exists but no changes, that's fine, we continue with variants
          }

          // 2. Synchronize variants if provided
          if (Array.isArray(variants)) {
            // Get existing variants for this product
            const existingVariants = db.prepare('SELECT id FROM variants WHERE product_id = ?').all(productId);
            const existingVariantIds = existingVariants.map(v => v.id);
            const incomingVariantIds = variants.map(v => v.id).filter(id => id);

            // Delete variants that are no longer present
            existingVariantIds.forEach(vId => {
              if (!incomingVariantIds.includes(vId)) {
                db.prepare('DELETE FROM variants WHERE id = ?').run(vId);
              }
            });

            // Update or Create variants
            variants.forEach(variant => {
              let variantId = variant.id;
              
              if (variantId) {
                // Update existing variant
                db.prepare(`
                  UPDATE variants
                  SET pack_size_value = ?, pack_size_type = ?, updated_at = datetime('now')
                  WHERE id = ? AND product_id = ?
                `).run(variant.pack_size_value || '1', variant.pack_size_type || 's', variantId, productId);
              } else {
                // Create new variant
                const variantInfo = db.prepare(`
                  INSERT INTO variants (product_id, pack_size_value, pack_size_type, created_at, updated_at)
                  VALUES (?, ?, ?, datetime('now'), datetime('now'))
                `).run(productId, variant.pack_size_value || '1', variant.pack_size_type || 's');
                variantId = variantInfo.lastInsertRowid;
              }

              // Synchronize batches for this variant
              if (Array.isArray(variant.batches)) {
                const existingBatches = db.prepare('SELECT id FROM batches WHERE variant_id = ?').all(variantId);
                const existingBatchIds = existingBatches.map(b => b.id);
                const incomingBatchIds = variant.batches.map(b => b.id).filter(id => id);

                // Delete batches that are no longer present
                existingBatchIds.forEach(bId => {
                  if (!incomingBatchIds.includes(bId)) {
                    db.prepare('DELETE FROM batches WHERE id = ?').run(bId);
                  }
                });

                // Update or Create batches
                variant.batches.forEach(batch => {
                  if (batch.id) {
                    // Update existing batch
                    db.prepare(`
                      UPDATE batches
                      SET batch_no = ?, mrp = ?, mfg_date = ?, exp_date = ?, units_sold = ?, updated_at = datetime('now')
                      WHERE id = ? AND variant_id = ?
                    `).run(
                      batch.batch_no, 
                      batch.mrp, 
                      batch.mfg_date || null, 
                      batch.exp_date || null, 
                      batch.units_sold || 0, 
                      batch.id, 
                      variantId
                    );
                  } else {
                    // Create new batch
                    db.prepare(`
                      INSERT INTO batches (variant_id, batch_no, mrp, mfg_date, exp_date, units_sold, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                    `).run(
                      variantId,
                      batch.batch_no,
                      batch.mrp || 0,
                      batch.mfg_date || null,
                      batch.exp_date || null,
                      batch.units_sold || 0
                    );
                  }
                });
              }
            });
          }
          return true;
        });

        updateTransaction({ productId: id, name, categoryId: finalCategoryId, classification, variants });

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'products',
          action: 'update',
          resourceType: 'product',
          resourceId: id,
          resourceName: name || null,
          metadata: { category_id: finalCategoryId, classification }
        });

        // Real-Time SSE Broadcast
        dataBus.broadcast('inventory:product', 'updated', { id, name });

        res.json({ success: true, id });
      } catch (error) {
        console.error(`[API ERROR] Failed to update product ${req.params.id}:`, error);
        res.status(error.message === 'Product not found' ? 404 : 500).json({ error: error.message });
      }
    },

    deleteProduct: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Product ID required' });

        const prod = db.prepare('SELECT name FROM products WHERE id = ?').get(id);

        // Use a transaction for atomic and safe manual cascade deletion
        const deleteTransaction = db.transaction((productId) => {
          // 1. Delete from invoice_items (references product directly)
          db.prepare('DELETE FROM invoice_items WHERE product_id = ?').run(productId);

          // 2. Delete from order_items (references product directly)
          db.prepare('DELETE FROM order_items WHERE product_id = ?').run(productId);

          // 3. Delete from customer_item_memory (references product directly)
          db.prepare('DELETE FROM customer_item_memory WHERE product_id = ?').run(productId);

          // 4. Delete from batches (linked via variants)
          db.prepare(`
            DELETE FROM batches 
            WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)
          `).run(productId);

          // 5. Delete from variants
          db.prepare('DELETE FROM variants WHERE product_id = ?').run(productId);

          // 6. Finally, delete the product itself
          const result = db.prepare('DELETE FROM products WHERE id = ?').run(productId);
          
          return result.changes;
        });

        const changes = deleteTransaction(id);

        if (changes === 0) {
          return res.status(404).json({ error: 'Product not found' });
        }

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'products',
          action: 'delete',
          resourceType: 'product',
          resourceId: id,
          resourceName: prod ? prod.name : null
        });

        // Real-Time SSE Broadcast
        dataBus.broadcast('inventory:product', 'deleted', { id, name: prod ? prod.name : null });

        res.json({ success: true, id });
      } catch (error) {
        console.error(`[API ERROR] Failed to delete product ${req.params.id}:`, error.message);
        res.status(500).json({ error: error.message });
      }
    },


    // ============= CATEGORIES =============
    getCategories: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const stmt = db.prepare('SELECT id, name, english_meaning, created_at FROM categories ORDER BY id ASC');
        const categories = stmt.all();
        const response = productListDepartment.getProductCategories(categories, { requestId: req.requestId });
        return res.json(response);
      } catch (error) {
        console.error('Error getting categories:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    },

    createCategory: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Category name is required' });

        const stmt = db.prepare('INSERT INTO categories (name, created_at) VALUES (?, datetime(\'now\'))');
        const result = stmt.run(name);
        try {
          dataBus.broadcast('inventory:category', 'created', { id: result.lastInsertRowid, name });
        } catch (_) {}
        res.status(201).json({ success: true, id: result.lastInsertRowid, name });
      } catch (error) {
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Category name must be unique' });
        }
        console.error('Error creating category:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    updateCategory: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { id } = req.params;
        const { name } = req.body;
        if (!id) return res.status(400).json({ error: 'Category ID required' });
        if (!name) return res.status(400).json({ error: 'Category name is required' });

        const stmt = db.prepare(`
          UPDATE categories
          SET name = ?, updated_at = datetime('now')
          WHERE id = ?
        `);
        const result = stmt.run(name, id);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Category not found or no changes applied' });
        }

        try {
          dataBus.broadcast('inventory:category', 'updated', { id, name });
        } catch (_) {}
        res.json({ success: true, id, name });
      } catch (error) {
        console.error('Error updating category:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    deleteCategory: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Category ID required' });

        // Check if any products use this category
        const usageStmt = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?');
        const usage = usageStmt.get(id);
        if (usage.count > 0) {
          return res.status(400).json({ error: 'Cannot delete category that is in use by products' });
        }

        const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
        const result = stmt.run(id);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Category not found' });
        }

        try {
          dataBus.broadcast('inventory:category', 'deleted', { id });
        } catch (_) {}
        res.json({ success: true, id });
      } catch (error) {
        console.error('Error deleting category:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    // ============= BATCH HELPERS =============
    updateBatch: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { id } = req.params;
        const { batch_no, mrp, mfg_date, exp_date, units_sold } = req.body;
        if (!id) return res.status(400).json({ error: 'Batch ID required' });

        const stmt = db.prepare(`
          UPDATE batches
          SET batch_no = COALESCE(?, batch_no),
              mrp = COALESCE(?, mrp),
              mfg_date = COALESCE(?, mfg_date),
              exp_date = COALESCE(?, exp_date),
              units_sold = COALESCE(?, units_sold),
              updated_at = datetime('now')
          WHERE id = ?
        `);
        const result = stmt.run(
          batch_no || null,
          mrp || null,
          mfg_date || null,
          exp_date || null,
          units_sold || null,
          id
        );

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Batch not found or no changes applied' });
        }

        try {
          dataBus.broadcast('inventory:batch', 'updated', { id, batch_no });
        } catch (_) {}
        res.json({ success: true, id });
      } catch (error) {
        console.error('Error updating batch:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    deleteBatch: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Batch ID required' });

        const stmt = db.prepare('DELETE FROM batches WHERE id = ?');
        const result = stmt.run(id);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Batch not found' });
        }

        try {
          dataBus.broadcast('inventory:batch', 'deleted', { id });
        } catch (_) {}
        res.json({ success: true, id });
      } catch (error) {
        console.error('Error deleting batch:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    updateMRP: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { product_id, variant_id, batch_no, mrp } = req.body;
        if (!product_id || !variant_id || !batch_no || !mrp) {
          return res.status(400).json({ error: 'product_id, variant_id, batch_no and mrp are required' });
        }

        const stmt = db.prepare(`
          UPDATE batches
          SET mrp = ?, updated_at = datetime('now')
          WHERE variant_id = ? AND batch_no = ?
        `);
        const result = stmt.run(mrp, variant_id, batch_no);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Batch not found for the specified variant and batch number' });
        }

        res.json({ success: true });
      } catch (error) {
        console.error('Error updating MRP:', error.message);
        res.status(500).json({ error: error.message });
      }
    },
    
    updateVariant: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { id } = req.params;
        const { pack_size_value, pack_size_type } = req.body;
        
        if (!id) return res.status(400).json({ error: 'Variant ID required' });

        const stmt = db.prepare(`
          UPDATE variants
          SET pack_size_value = COALESCE(?, pack_size_value),
              pack_size_type = COALESCE(?, pack_size_type),
              updated_at = datetime('now')
          WHERE id = ?
        `);
        const result = stmt.run(pack_size_value || null, pack_size_type || null, id);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Variant not found' });
        }

        try {
          dataBus.broadcast('inventory:variant', 'updated', { id });
        } catch (_) {}
        res.json({ success: true, id });
      } catch (error) {
        console.error('Error updating variant:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    createVariant: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { product_id, pack_size_value, pack_size_type } = req.body;
        if (!product_id || !pack_size_value || !pack_size_type) {
          return res.status(400).json({ error: 'product_id, pack_size_value and pack_size_type are required' });
        }

        const stmt = db.prepare(`
          INSERT INTO variants (product_id, pack_size_value, pack_size_type, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `);
        const result = stmt.run(product_id, pack_size_value, pack_size_type);
        try {
          dataBus.broadcast('inventory:variant', 'created', { id: result.lastInsertRowid, product_id });
        } catch (_) {}
        res.status(201).json({ success: true, id: result.lastInsertRowid });
      } catch (error) {
        console.error('Error creating variant:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    createBatch: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const { variant_id, batch_no, mrp, mfg_date, exp_date } = req.body;
        if (!variant_id || !batch_no || !mrp) {
          return res.status(400).json({ error: 'variant_id, batch_no and mrp are required' });
        }

        const stmt = db.prepare(`
          INSERT INTO batches (variant_id, batch_no, mrp, mfg_date, exp_date, units_sold, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
        `);
        const result = stmt.run(variant_id, batch_no, mrp, mfg_date || null, exp_date || null);
        try {
          dataBus.broadcast('inventory:batch', 'created', { id: result.lastInsertRowid, variant_id, batch_no });
        } catch (_) {}
        res.status(201).json({ success: true, id: result.lastInsertRowid });
      } catch (error) {
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Batch number already exists for this variant' });
        }
        console.error('Error creating batch:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    getPublicCatalog: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');

        const stmt = db.prepare(`
          SELECT p.*, c.name as category_name
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          ORDER BY p.created_at DESC
        `);
        const products = stmt.all();

        const enrichedProducts = products.map(product => {
          const variantsStmt = db.prepare(`
            SELECT id, product_id, pack_size_value, pack_size_type
            FROM variants
            WHERE product_id = ?
            ORDER BY id
          `);
          const variants = variantsStmt.all(product.id);

          const enrichedVariants = variants.map(variant => {
            const batchesStmt = db.prepare(`
              SELECT id, batch_no, mrp, mfg_date, exp_date,
                (
                  COALESCE((
                    SELECT SUM(ii.qty) 
                    FROM invoice_items ii 
                    WHERE ii.batch_id = batches.id
                       OR (ii.batch_id IS NULL AND ii.variant_id = batches.variant_id AND ii.batch_no = batches.batch_no)
                       OR (ii.batch_id IS NULL AND ii.variant_id IS NULL AND ii.batch_no = batches.batch_no AND ii.product_id = (SELECT product_id FROM variants WHERE id = batches.variant_id))
                  ), 0) + COALESCE(batches.units_sold, 0)
                ) AS units_sold
              FROM batches
              WHERE variant_id = ?
              ORDER BY batch_no COLLATE NOCASE ASC
            `);
            const batches = naturalSortBatches(batchesStmt.all(variant.id));
            return { ...variant, batches };
          });

          let pack = null, batch_no = null, mrp = null;
          if (enrichedVariants.length > 0) {
            const firstVariant = enrichedVariants[0];
            pack = `${firstVariant.pack_size_value} ${firstVariant.pack_size_type}`;

            if (firstVariant.batches && firstVariant.batches.length > 0) {
              const firstBatch = firstVariant.batches[0];
              batch_no = firstBatch.batch_no;
              mrp = firstBatch.mrp;
            }
          }

          return { ...product, variants: enrichedVariants, pack, batch_no, mrp };
        });

        res.json(enrichedProducts);
      } catch (error) {
        console.error('Error in getPublicCatalog:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    getPublicProduct: (req, res) => {
      try {
        if (!db) throw new Error('Database connection lost');
        const sku = req.params.sku;

        const productByIdStmt = db.prepare(`
          SELECT DISTINCT p.*, c.name as category_name
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE p.id = ?
          LIMIT 1
        `);
        const productByNameStmt = db.prepare(`
          SELECT p.*, c.name as category_name
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE p.name = ?
          LIMIT 1
        `);
        const productsByBatchStmt = db.prepare(`
          SELECT DISTINCT p.id, v.id AS variant_id, b.id AS batch_id
          FROM products p
          INNER JOIN variants v ON v.product_id = p.id
          INNER JOIN batches b ON b.variant_id = v.id
          WHERE b.batch_no = ?
          LIMIT 2
        `);
        let product = productByIdStmt.get(sku) || productByNameStmt.get(sku);

        if (!product) {
          const batchMatches = productsByBatchStmt.all(sku);
          if (batchMatches.length > 1) {
            return res.status(409).json({ error: 'Batch number is ambiguous; use a QR label with product and batch IDs.' });
          }
          product = batchMatches[0] ? productByIdStmt.get(batchMatches[0].id) : null;
        }

        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }

        const variantsStmt = db.prepare(`
          SELECT id, product_id, pack_size_value, pack_size_type
          FROM variants
          WHERE product_id = ?
        `);
        const variants = variantsStmt.all(product.id);

        const enrichedVariants = variants.map(variant => {
          const batchesStmt = db.prepare(`
            SELECT id, batch_no, mrp, mfg_date, exp_date,
              (
                COALESCE((
                  SELECT SUM(ii.qty) 
                  FROM invoice_items ii 
                  WHERE ii.batch_id = batches.id
                     OR (ii.batch_id IS NULL AND ii.variant_id = batches.variant_id AND ii.batch_no = batches.batch_no)
                     OR (ii.batch_id IS NULL AND ii.variant_id IS NULL AND ii.batch_no = batches.batch_no AND ii.product_id = (SELECT product_id FROM variants WHERE id = batches.variant_id))
                ), 0) + COALESCE(batches.units_sold, 0)
              ) AS units_sold
            FROM batches
            WHERE variant_id = ?
            ORDER BY batch_no COLLATE NOCASE ASC
          `);
          const batches = naturalSortBatches(batchesStmt.all(variant.id));
          return { ...variant, batches };
        });

        res.json({ ...product, variants: enrichedVariants });
      } catch (error) {
        console.error('Error in getPublicProduct:', error.message);
        res.status(500).json({ error: 'Internal server error' });
      }
    },

    // ============= PDF CATALOG GENERATION =============
    generateCatalogPDF: async (req, res) => {
      try {
        const action = req.body?.action || req.query?.action || 'download';
        const filename = req.body?.filename || 'UCA_Product_Catalog.pdf';

        if (!SuiteCoreBridge || typeof SuiteCoreBridge.renderCatalogPdf !== 'function') {
          throw new Error('The Rust SuiteCore renderer is unavailable. Rebuild and deploy suite_core.wasm before generating catalog PDFs.');
        }

        let catalogData = req.body?.catalog_data;
        if (!catalogData) {
          const prodCols = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
          const hasClassification = prodCols.includes('classification');
          const hasCreatedAt = prodCols.includes('created_at');
          const hasUpdatedAt = prodCols.includes('updated_at');

          const productRows = db.prepare(`
            SELECT p.id AS product_id, p.name AS product_name, p.odia_name,
                   ${hasClassification ? 'p.classification' : "NULL AS classification"},
                   ${hasCreatedAt ? 'p.created_at' : "NULL AS created_at"},
                   ${hasUpdatedAt ? 'p.updated_at' : "NULL AS updated_at"},
                   c.name AS category_name, v.id AS variant_id,
                   v.pack_size_value, v.pack_size_type,
                   b.id AS batch_id, b.batch_no, b.mrp, b.mfg_date, b.exp_date
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN variants v ON v.product_id = p.id
            LEFT JOIN batches b ON b.variant_id = v.id
            ORDER BY 
              p.name COLLATE NOCASE ASC,
              p.id ASC,
              v.pack_size_value ASC,
              v.pack_size_type ASC,
              v.id ASC,
              b.batch_no COLLATE NOCASE ASC,
              b.id ASC
          `).all();

          const productsMap = new Map();
          for (const row of productRows) {
            let prod = productsMap.get(row.product_id);
            if (!prod) {
              prod = {
                product_id: String(row.product_id),
                product_name: String(row.product_name || ''),
                odia_name: row.odia_name || null,
                category: String(row.category_name || 'Uncategorized'),
                is_gold: String(row.classification || '').toLowerCase() === 'gold',
                created_at: row.created_at ? new Date(row.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : null,
                updated_at: row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : null,
                variants: []
              };
              productsMap.set(row.product_id, prod);
            }

            if (row.variant_id) {
              const packSize = `${row.pack_size_value || ''} ${row.pack_size_type || ''}`.trim() || 'Standard';
              let variant = prod.variants.find(v => v.variant_id === String(row.variant_id));
              if (!variant) {
                variant = {
                  variant_id: String(row.variant_id),
                  pack_size: packSize,
                  batches: []
                };
                prod.variants.push(variant);
              }

              if (row.batch_id) {
                variant.batches.push({
                  batch_id: String(row.batch_id),
                  batch_no: String(row.batch_no || ''),
                  mrp: Number(row.mrp || 0),
                  mfg_date: row.mfg_date ? String(row.mfg_date) : null,
                  expiry_date: row.exp_date ? String(row.exp_date) : null
                });
              }
            }
          }

          catalogData = {
            catalog_type: 'master',
            title: 'UCA Product Catalog',
            subtitle: 'QR Code Price List & Master Reference',
            base_url: req.body?.baseUrl || 'https://catalog.uca',
            generated_at: new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }),
            products: Array.from(productsMap.values())
          };
        }

        const renderedPdf = SuiteCoreBridge.renderCatalogPdf(catalogData);
        if (!renderedPdf || !renderedPdf.success || !renderedPdf.pdf_base64) {
          throw new Error(`Rust catalog rendering failed: ${renderedPdf ? renderedPdf.error : 'Unknown error'}`);
        }

        const pdfBuffer = Buffer.from(renderedPdf.pdf_base64, 'base64');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdfBuffer.length);
        
        if (action === 'inline' || action === 'print') {
          res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        } else {
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }

        return res.end(pdfBuffer, 'binary');
      } catch (err) {
        console.error('Error in generateCatalogPDF handler:', err);
        return res.status(500).json({ error: 'Failed to generate catalog PDF', details: err.message });
      }
    },

    generateCatalogPrintAssets: async (req, res) => {
      try {
        const format = req.body?.format;
        if (format !== 'pdf' && format !== 'zip') {
          return res.status(400).json({ error: 'Choose either the PDF label sheet or the SVG designer ZIP.' });
        }
        if (typeof req.body?.baseUrl !== 'string' || !req.body.baseUrl.trim()) {
          return res.status(400).json({ error: 'A public HTTPS base URL is required for product QR labels.' });
        }

        const { resolveCatalogQrBaseUrl, createCatalogProductQrUrl, createCatalogBatchQrUrl } =
          await import('../../../../frontend/shared/catalog-qr-url.mjs');
        let baseUrl;
        try {
          baseUrl = resolveCatalogQrBaseUrl('', req.body.baseUrl);
        } catch (error) {
          return res.status(400).json({ error: error.message });
        }

        const productRows = db.prepare(`
          SELECT p.id AS product_id, p.name AS product_name, p.odia_name,
                 c.name AS category_name, v.id AS variant_id,
                 v.pack_size_value, v.pack_size_type,
                 b.id AS batch_id, b.batch_no, b.mrp
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN variants v ON v.product_id = p.id
          LEFT JOIN batches b ON b.variant_id = v.id
          ORDER BY 
            COALESCE(c.name, 'Uncategorized') COLLATE NOCASE ASC,
            p.name COLLATE NOCASE ASC,
            p.id ASC,
            v.pack_size_value ASC,
            v.pack_size_type ASC,
            v.id ASC,
            b.batch_no COLLATE NOCASE ASC,
            b.id ASC
        `).all();

        if (productRows.length === 0) {
          return res.status(404).json({ error: 'There are no products in the catalog to export.' });
        }

        const labels = [];
        const productsWithBatch = new Set(
          productRows
            .filter(row => row.batch_id !== null && row.batch_id !== undefined)
            .map(row => String(row.product_id))
        );
        const productOnlyLabels = new Set();
        const usedSvgFilenames = new Set();

        const sanitizeFilenamePart = str => {
          return String(str || '')
            .trim()
            .replace(/[^\w\s.-]/g, '')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_');
        };

        for (const row of productRows) {
          const productId = String(row.product_id);
          let qrUrl;
          let type;
          if (row.batch_id !== null && row.batch_id !== undefined) {
            type = 'batch';
            qrUrl = createCatalogBatchQrUrl(
              baseUrl,
              row.batch_no,
              row.product_id,
              row.variant_id,
              row.batch_id
            );
          } else {
            if (productOnlyLabels.has(productId) || productsWithBatch.has(productId)) continue;
            productOnlyLabels.add(productId);
            type = 'product';
            qrUrl = createCatalogProductQrUrl(baseUrl, row.product_id);
          }

          if (labels.length >= 2_000) {
            return res.status(413).json({ error: 'This export exceeds the 2,000-label limit. Export a smaller catalog selection.' });
          }

          const safeVariant = row.variant_id === null || row.variant_id === undefined
            ? ''
            : `${row.pack_size_value || ''} ${row.pack_size_type || ''}`.trim();
          const qrRows = qrRowsFromUrl(qrUrl);

          const cleanProd = sanitizeFilenamePart(row.product_name) || `Product_${productId}`;
          const cleanBatch = sanitizeFilenamePart(row.batch_no) || `Batch_${row.batch_id}`;
          const cleanPack = sanitizeFilenamePart(safeVariant);

          let baseSvgName = type === 'batch'
            ? (cleanPack ? `${cleanProd}_${cleanPack}_Batch_${cleanBatch}` : `${cleanProd}_Batch_${cleanBatch}`)
            : cleanProd;

          let svgFile = `qrs/${baseSvgName}.svg`;
          let counter = 1;
          while (usedSvgFilenames.has(svgFile.toLowerCase())) {
            counter++;
            svgFile = `qrs/${baseSvgName}_${counter}.svg`;
          }
          usedSvgFilenames.add(svgFile.toLowerCase());

          const label = {
            type,
            product_id: productId,
            product_name: String(row.product_name || ''),
            category: String(row.category_name || ''),
            variant_id: row.variant_id === null || row.variant_id === undefined ? '' : String(row.variant_id),
            variant: safeVariant,
            batch_id: row.batch_id === null || row.batch_id === undefined ? '' : String(row.batch_id),
            batch_no: row.batch_no === null || row.batch_no === undefined ? '' : String(row.batch_no),
            mrp: row.mrp === null || row.mrp === undefined ? null : Number(row.mrp),
            qr_url: qrUrl,
            qr_rows: qrRows,
            svg_file: svgFile
          };
          labels.push(label);
        }

        if (labels.length === 0) {
          return res.status(404).json({ error: 'There are no product or batch QR labels available to export.' });
        }

        if (!SuiteCoreBridge || typeof SuiteCoreBridge.renderCatalogQrLabelPdf !== 'function') {
          throw new Error('The Rust SuiteCore renderer is unavailable. Rebuild and deploy suite_core.wasm before generating press PDFs.');
        }
        const renderedPdf = SuiteCoreBridge.renderCatalogQrLabelPdf({
          labels: labels.map(({ qr_url, svg_file, type, ...label }) => label)
        });
        const pdfBuffer = Buffer.from(renderedPdf.pdf_base64, 'base64');
        if (
          renderedPdf.byte_count !== pdfBuffer.length ||
          !pdfBuffer.subarray(0, 8).equals(Buffer.from('%PDF-1.4'))
        ) {
          throw new Error('The Rust renderer returned an invalid QR label PDF.');
        }

        if (format === 'pdf') {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', pdfBuffer.length);
          res.setHeader('Content-Disposition', 'attachment; filename="UCA_QR_Label_Sheets.pdf"');
          return res.end(pdfBuffer);
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="UCA_QR_Label_Designer_Pack.zip"');
        const archive = archiver('zip', { zlib: { level: 9 } });
        let archiveFailed = false;
        const failArchive = error => {
          if (archiveFailed) return;
          archiveFailed = true;
          console.error('[ProductCatalog] Print-asset archive failed:', error);
          archive.abort();
          if (!res.headersSent) res.status(500).json({ error: 'Unable to package product QR print assets.' });
          else res.destroy(error);
        };
        archive.on('warning', failArchive);
        archive.on('error', failArchive);
        archive.pipe(res);
        archive.append(pdfBuffer, { name: 'UCA_QR_Label_Sheets.pdf' });
        archive.append(catalogLabelsCsv(labels), { name: 'labels.csv' });
        archive.append(
          'Scalable monochrome vector QR artwork. Set final label dimensions in your label-design or print-imposition software. The PDF is an A4 reference sheet laid out 3 columns by 8 rows; confirm press stock, safe area, and cut lines before production.',
          { name: 'README.txt' }
        );
        for (const label of labels) {
          archive.append(renderQrSvg(label), { name: label.svg_file });
        }
        await archive.finalize();
        return undefined;
      } catch (error) {
        console.error('[ProductCatalog] QR print-asset generation failed:', error);
        if (res.headersSent) {
          res.destroy(error);
          return undefined;
        }
        return res.status(500).json({
          error: 'Failed to generate Rust QR print assets.',
          details: error.message
        });
      }
    }
  };
};
