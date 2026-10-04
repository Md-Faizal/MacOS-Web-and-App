const path = require('path');
const createActivityLogger = require('../../../core/audit/activity-logger');
const { buildProductListResponse, buildProductCategoriesResponse } = require('../../../shared/api/product-list-contract');
const productListDepartment = require('../service');
const dataBus = require('../../../core/sync/data-bus');

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
        
        // Find product by ID, Name, or Batch Number
        const stmt = db.prepare(`
          SELECT DISTINCT p.*, c.name as category_name
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN variants v ON v.product_id = p.id
          LEFT JOIN batches b ON b.variant_id = v.id
          WHERE p.id = ? OR p.name = ? OR b.batch_no = ?
          LIMIT 1
        `);
        const product = stmt.get(sku, sku, sku);

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
        let generatePDFFromHTML;
        try {
          generatePDFFromHTML = require('../../../core/products/pdf-generator').generatePDFFromHTML;
        } catch (e1) {
          try {
            generatePDFFromHTML = require('../../../core/products/pdf-generator').generatePDFFromHTML;
          } catch (e2) {
            const path = require('path');
            generatePDFFromHTML = require(path.join(process.cwd(), 'backend/core/products/pdf-generator')).generatePDFFromHTML;
          }
        }

        const action = req.body?.action || req.query?.action || 'download';
        const filename = req.body?.filename || 'UCA_Product_Catalog.pdf';
        
        let htmlContent = req.body?.html;

        if (!htmlContent) {
          // Fallback: build HTML dynamically from database products
          const stmt = db.prepare(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.name ASC
          `);
          const products = stmt.all();
          const enrichedProducts = products.map(product => {
            const variantsStmt = db.prepare(`SELECT * FROM variants WHERE product_id = ? ORDER BY id`);
            const variants = variantsStmt.all(product.id);
            const enrichedVariants = variants.map(v => {
              const batchesStmt = db.prepare(`
                SELECT *,
                  (
                    COALESCE((
                      SELECT SUM(ii.qty) 
                      FROM invoice_items ii 
                      WHERE ii.batch_id = batches.id
                         OR (ii.batch_id IS NULL AND ii.variant_id = batches.variant_id AND ii.batch_no = batches.batch_no)
                         OR (ii.batch_id IS NULL AND ii.variant_id IS NULL AND ii.batch_no = batches.batch_no AND ii.product_id = (SELECT product_id FROM variants WHERE id = batches.variant_id))
                    ), 0) + COALESCE(batches.units_sold, 0)
                  ) AS units_sold
                FROM batches WHERE variant_id = ? ORDER BY batch_no COLLATE NOCASE ASC
              `);
              return { ...v, packSize: `${v.pack_size_value} ${v.pack_size_type}`, batches: naturalSortBatches(batchesStmt.all(v.id)) };
            });
            return { ...product, category: product.category_name || 'General', variants: enrichedVariants };
          });

          let tocItems = enrichedProducts.map(p => `
            <a href="#prod-${p.id}" class="qr-toc-entry">
              <span class="qr-toc-name">${p.name}</span>
              <span class="qr-toc-dots"></span>
              <span class="qr-toc-info">${p.variants.length}V</span>
            </a>
          `).join('');

          let productItems = enrichedProducts.map(p => `
            <div class="qr-product-block" id="prod-${p.id}">
              <div class="qr-product-header">
                <div class="qr-product-title-group">
                  <h2 class="qr-product-name"><a href="https://mac.faizal.uk/public/product/${p.id}">${p.name}</a></h2>
                  <span class="qr-category-pill">${p.category}</span>
                </div>
              </div>
            </div>
          `).join('');

          htmlContent = `
            <div class="qr-print-page qr-toc-page">
              <div class="qr-doc-header">
                <p class="qr-doc-brand"><a href="https://mac.faizal.uk">UCA Inventory System</a></p>
                <h1 class="qr-doc-title">Product Catalog</h1>
              </div>
              <div class="qr-toc-section">
                <div class="qr-toc-heading">Index (A–Z)</div>
                <div class="qr-toc-columns">${tocItems}</div>
              </div>
            </div>
            <div class="qr-print-page">
              <div class="qr-catalog-products">${productItems}</div>
            </div>
          `;
        }

        const pdfBuffer = await generatePDFFromHTML(htmlContent);

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
    }
  };
};

