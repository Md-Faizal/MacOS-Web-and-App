const crypto = require('crypto');

function createManifestHandlers(db) {
  // Helper to generate clean unique plant token: e.g. PLANT-8F29K
  function generateToken() {
    let token;
    let attempts = 0;
    while (attempts < 10) {
      const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex characters
      token = `PLANT-${code}`;
      const existing = db.prepare('SELECT id FROM plant_manifests WHERE token = ?').get(token);
      if (!existing) return token;
      attempts++;
    }
    return `PLANT-${Date.now().toString().slice(-6)}`;
  }

  return {
    /**
     * Create a new manifest or append orders to an existing manifest
     * POST /api/billing/orders/manifest
     */
    createOrAppendManifest: (req, res) => {
      try {
        const { order_ids, manifest_id, title } = req.body;
        if (!Array.isArray(order_ids) || order_ids.length === 0) {
          return res.status(400).json({ error: 'order_ids array is required and must contain at least 1 order id' });
        }

        const validOrders = db.prepare(`
          SELECT o.id, o.order_number, o.customer_id, c.name as customer_name, o.current_stage, o.status
          FROM orders o
          LEFT JOIN contacts c ON o.customer_id = c.id
          WHERE o.id IN (${order_ids.map(() => '?').join(',')})
        `).all(...order_ids);

        if (validOrders.length === 0) {
          return res.status(404).json({ error: 'None of the specified orders were found' });
        }

        let manifest;
        let isNew = false;

        const runTx = db.transaction(() => {
          if (manifest_id) {
            manifest = db.prepare('SELECT * FROM plant_manifests WHERE id = ?').get(manifest_id);
            if (!manifest) {
              throw new Error(`Manifest #${manifest_id} not found`);
            }
            // Increment version on update
            db.prepare(`
              UPDATE plant_manifests
              SET version = version + 1, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(manifest.id);
            manifest.version += 1;
          } else {
            isNew = true;
            const token = generateToken();
            const manifestTitle = title || `Manifest - ${new Date().toLocaleDateString('en-GB')} (${validOrders.map(o => o.order_number).join(', ')})`;
            const insertResult = db.prepare(`
              INSERT INTO plant_manifests (token, title, status, version, created_by_user_id)
              VALUES (?, ?, 'active', 1, ?)
            `).run(token, manifestTitle, req.user?.id || 'admin');

            manifest = db.prepare('SELECT * FROM plant_manifests WHERE id = ?').get(insertResult.lastInsertRowid);
          }

          // Link orders to manifest
          const insertOrderLink = db.prepare(`
            INSERT OR IGNORE INTO plant_manifest_orders (manifest_id, order_id)
            VALUES (?, ?)
          `);

          const updateOrderToken = db.prepare(`
            UPDATE orders
            SET share_token = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `);

          // Snapshot last_known_quantity for diff detection
          const snapshotItemQty = db.prepare(`
            UPDATE order_items
            SET last_known_quantity = quantity
            WHERE order_id = ? AND (last_known_quantity IS NULL OR last_known_quantity = 0)
          `);

          for (const ord of validOrders) {
            insertOrderLink.run(manifest.id, ord.id);
            updateOrderToken.run(manifest.token, ord.id);
            snapshotItemQty.run(ord.id);
          }
        });

        runTx();

        const host = req.get('host') || 'localhost:3000';
        const proto = req.protocol || 'http';
        const shareUrl = `${proto}://${host}/plant/${manifest.token}`;

        res.json({
          success: true,
          isNew,
          manifest: {
            id: manifest.id,
            token: manifest.token,
            title: manifest.title,
            version: manifest.version,
            status: manifest.status,
            share_url: shareUrl,
            orders_count: validOrders.length,
            orders: validOrders
          }
        });
      } catch (err) {
        console.error('Error creating/appending manifest:', err);
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * List all plant manifests for the dashboard
     * GET /api/billing/orders/manifests
     */
    getManifests: (req, res) => {
      try {
        const { status } = req.query;
        let sql = `SELECT * FROM plant_manifests WHERE 1=1`;
        const params = [];

        if (status && status !== 'all') {
          sql += ` AND status = ?`;
          params.push(status);
        }

        sql += ` ORDER BY id DESC`;
        const manifests = db.prepare(sql).all(...params);

        const host = req.get('host') || 'localhost:3000';
        const proto = req.protocol || 'http';

        const enriched = manifests.map(m => {
          // Get linked orders
          const linkedOrders = db.prepare(`
            SELECT o.id, o.order_number, o.customer_id, c.name as customer_name,
                   o.current_stage, o.status, o.total_amount, o.order_date, o.created_at
            FROM plant_manifest_orders pmo
            JOIN orders o ON pmo.order_id = o.id
            LEFT JOIN contacts c ON o.customer_id = c.id
            WHERE pmo.manifest_id = ?
            ORDER BY o.id ASC
          `).all(m.id);

          // Get item progress
          const orderIds = linkedOrders.map(o => o.id);
          let progress = { total_items: 0, checked_items: 0, available: 0, partial: 0, out_of_stock: 0 };

          if (orderIds.length > 0) {
            const items = db.prepare(`
              SELECT plant_status, count(*) as count
              FROM order_items
              WHERE order_id IN (${orderIds.map(() => '?').join(',')})
              GROUP BY plant_status
            `).all(...orderIds);

            items.forEach(row => {
              const c = row.count || 0;
              progress.total_items += c;
              if (row.plant_status === 'available') progress.available += c;
              else if (row.plant_status === 'partial') progress.partial += c;
              else if (row.plant_status === 'out_of_stock') progress.out_of_stock += c;
            });
            progress.checked_items = progress.available + progress.partial + progress.out_of_stock;
          }

          // Check if all orders are locked (delivered or complete)
          const is_locked = linkedOrders.length > 0 && linkedOrders.every(
            o => o.current_stage === 'stage3' || o.status === 'complete' || o.status === 'completed'
          );

          return {
            ...m,
            share_url: `${proto}://${host}/plant/${m.token}`,
            orders: linkedOrders,
            progress,
            is_locked
          };
        });

        res.json({ success: true, manifests: enriched });
      } catch (err) {
        console.error('Error fetching manifests:', err);
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * Get single manifest details
     * GET /api/billing/orders/manifests/:id
     */
    getManifestById: (req, res) => {
      try {
        const { id } = req.params;
        const manifest = db.prepare('SELECT * FROM plant_manifests WHERE id = ? OR token = ?').get(id, id);
        if (!manifest) {
          return res.status(404).json({ error: 'Manifest not found' });
        }
        res.json({ success: true, manifest });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * Update manifest details
     * PUT /api/billing/orders/manifests/:id
     */
    updateManifest: (req, res) => {
      try {
        const { id } = req.params;
        const { title, cases_count, plant_notes, status } = req.body;

        const existing = db.prepare('SELECT * FROM plant_manifests WHERE id = ?').get(id);
        if (!existing) {
          return res.status(404).json({ error: 'Manifest not found' });
        }

        db.prepare(`
          UPDATE plant_manifests
          SET title = COALESCE(?, title),
              cases_count = COALESCE(?, cases_count),
              plant_notes = COALESCE(?, plant_notes),
              status = COALESCE(?, status),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(title, cases_count, plant_notes, status, id);

        const updated = db.prepare('SELECT * FROM plant_manifests WHERE id = ?').get(id);
        res.json({ success: true, manifest: updated });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * Delete / Close manifest
     * DELETE /api/billing/orders/manifests/:id
     */
    deleteManifest: (req, res) => {
      try {
        const { id } = req.params;
        const existing = db.prepare('SELECT * FROM plant_manifests WHERE id = ?').get(id);
        if (!existing) {
          return res.status(404).json({ error: 'Manifest not found' });
        }

        db.transaction(() => {
          // Clear share token from orders
          db.prepare(`
            UPDATE orders
            SET share_token = NULL
            WHERE id IN (SELECT order_id FROM plant_manifest_orders WHERE manifest_id = ?)
          `).run(id);

          db.prepare('DELETE FROM plant_manifest_orders WHERE manifest_id = ?').run(id);
          db.prepare('DELETE FROM plant_manifests WHERE id = ?').run(id);
        })();

        res.json({ success: true, message: 'Manifest deleted successfully' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * PUBLIC ENDPOINT: Retrieve complete manifest for plant mobile portal
     * GET /api/orders/public/manifest/:token
     */
    getPublicManifestData: (req, res) => {
      try {
        const { token } = req.params;
        const manifest = db.prepare('SELECT * FROM plant_manifests WHERE token = ?').get(token);
        if (!manifest) {
          return res.status(404).json({ error: 'Invalid or expired plant link.' });
        }

        // Fetch all linked orders
        const orders = db.prepare(`
          SELECT o.id, o.order_number, o.customer_id, c.name as customer_name,
                 o.current_stage, o.status, o.order_date, o.order_notes, o.plant_notes, o.plant_cases
          FROM plant_manifest_orders pmo
          JOIN orders o ON pmo.order_id = o.id
          LEFT JOIN contacts c ON o.customer_id = c.id
          WHERE pmo.manifest_id = ?
          ORDER BY o.id ASC
        `).all(manifest.id);

        if (orders.length === 0) {
          return res.status(404).json({ error: 'No orders found attached to this plant manifest.' });
        }

        // Check if all orders are locked
        const is_locked = orders.every(
          o => o.current_stage === 'stage3' || o.status === 'complete' || o.status === 'completed'
        );

        const orderIds = orders.map(o => o.id);
        const rawItems = db.prepare(`
          SELECT oi.id, oi.order_id, oi.product_id, oi.variant_id, oi.batch_id,
                 oi.quantity, oi.received_quantity, oi.plant_status, oi.packed_quantity,
                 oi.packed_batch_id, oi.packed_batch_no, oi.packed_expiry, oi.plant_notes,
                 oi.last_known_quantity,
                 p.name as product_name,
                 v.pack_size_value, v.pack_size_type,
                 b.batch_no as req_batch_no, b.exp_date as req_exp_date, b.mrp as req_mrp
          FROM order_items oi
          LEFT JOIN products p ON oi.product_id = p.id
          LEFT JOIN variants v ON oi.variant_id = v.id
          LEFT JOIN batches b ON oi.batch_id = b.id
          WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})
          ORDER BY oi.order_id ASC, oi.id ASC
        `).all(...orderIds);

        // Fetch available alternate batches for these variants
        const variantIds = Array.from(new Set(rawItems.map(i => i.variant_id).filter(Boolean)));
        let batchesByVariant = {};
        if (variantIds.length > 0) {
          const availBatches = db.prepare(`
            SELECT b.id, b.variant_id, b.batch_no, b.mrp, b.exp_date, b.mfg_date
            FROM batches b
            WHERE b.variant_id IN (${variantIds.map(() => '?').join(',')})
            ORDER BY b.id DESC
          `).all(...variantIds);

          availBatches.forEach(b => {
            if (!batchesByVariant[b.variant_id]) batchesByVariant[b.variant_id] = [];
            batchesByVariant[b.variant_id].push(b);
          });
        }

        // Structure items per order & calculate diff hints
        const diffs = [];
        const itemsByOrder = {};

        rawItems.forEach(item => {
          let diffBadge = null;
          let diffText = null;

          if (item.last_known_quantity !== null && item.last_known_quantity !== undefined && item.last_known_quantity !== item.quantity) {
            diffBadge = 'modified';
            diffText = `Qty changed: ${item.last_known_quantity} ➔ ${item.quantity}`;
            diffs.push({
              item_id: item.id,
              product_name: item.product_name,
              diffBadge,
              diffText
            });
          }

          const formattedItem = {
            id: item.id,
            order_id: item.order_id,
            product_id: item.product_id,
            product_name: item.product_name || `Product #${item.product_id}`,
            variant_id: item.variant_id,
            pack_size: item.pack_size_value ? `${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '',
            quantity: item.quantity,
            received_quantity: item.received_quantity,
            plant_status: item.plant_status || 'pending',
            packed_quantity: item.packed_quantity !== null && item.packed_quantity !== undefined ? item.packed_quantity : (item.plant_status === 'available' ? item.quantity : null),
            requested_batch: {
              id: item.batch_id,
              batch_no: item.req_batch_no || 'Standard',
              exp_date: item.req_exp_date || '',
              mrp: item.req_mrp || 0
            },
            packed_batch: {
              id: item.packed_batch_id || item.batch_id,
              batch_no: item.packed_batch_no || item.req_batch_no || 'Standard',
              exp_date: item.packed_expiry || item.req_exp_date || ''
            },
            available_batches: (item.variant_id && batchesByVariant[item.variant_id]) ? batchesByVariant[item.variant_id] : [],
            plant_notes: item.plant_notes || '',
            diffBadge,
            diffText
          };

          if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
          itemsByOrder[item.order_id].push(formattedItem);
        });

        // Attach items to orders
        const ordersWithItems = orders.map(ord => ({
          ...ord,
          items: itemsByOrder[ord.id] || []
        }));

        res.json({
          success: true,
          manifest: {
            id: manifest.id,
            token: manifest.token,
            title: manifest.title,
            status: manifest.status,
            cases_count: manifest.cases_count,
            plant_notes: manifest.plant_notes,
            version: manifest.version,
            submitted_at: manifest.submitted_at,
            is_locked,
            created_at: manifest.created_at,
            updated_at: manifest.updated_at
          },
          orders: ordersWithItems,
          diffs
        });
      } catch (err) {
        console.error('Error in getPublicManifestData:', err);
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * PUBLIC ENDPOINT: Submit plant worker fulfillment inputs
     * POST /api/orders/public/manifest/:token/submit
     */
    submitPublicManifestData: (req, res) => {
      try {
        const { token } = req.params;
        const { items, cases_count, plant_notes } = req.body;

        const manifest = db.prepare('SELECT * FROM plant_manifests WHERE token = ?').get(token);
        if (!manifest) {
          return res.status(404).json({ error: 'Manifest not found or invalid token.' });
        }

        // Get linked orders
        const orders = db.prepare(`
          SELECT o.id, o.current_stage, o.status
          FROM plant_manifest_orders pmo
          JOIN orders o ON pmo.order_id = o.id
          WHERE pmo.manifest_id = ?
        `).all(manifest.id);

        // Check if locked
        const is_locked = orders.every(
          o => o.current_stage === 'stage3' || o.status === 'complete' || o.status === 'completed'
        );
        if (is_locked) {
          return res.status(403).json({ error: 'Order is finalized and delivered. Read-only view.' });
        }

        const runTx = db.transaction(() => {
          // 1. Update items
          if (Array.isArray(items) && items.length > 0) {
            const updateItemStmt = db.prepare(`
              UPDATE order_items
              SET plant_status = ?,
                  packed_quantity = ?,
                  received_quantity = ?,
                  packed_batch_id = ?,
                  packed_batch_no = ?,
                  packed_expiry = ?,
                  plant_notes = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `);

            for (const item of items) {
              const packedQty = item.packed_quantity !== undefined && item.packed_quantity !== null
                ? Number(item.packed_quantity)
                : (item.plant_status === 'available' ? Number(item.quantity) : 0);

              updateItemStmt.run(
                item.plant_status || 'available',
                packedQty,
                packedQty, // Pre-fill received_quantity for Stage 2 QC
                item.packed_batch_id || null,
                item.packed_batch_no || null,
                item.packed_expiry || null,
                item.plant_notes || '',
                item.order_item_id || item.id
              );
            }
          }

          // 2. Update manifest record
          db.prepare(`
            UPDATE plant_manifests
            SET cases_count = ?,
                plant_notes = ?,
                status = 'submitted',
                submitted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(cases_count || 0, plant_notes || '', manifest.id);

          // 3. Update orders and advance stage1 -> stage2
          const updateOrderStmt = db.prepare(`
            UPDATE orders
            SET plant_status = 'submitted',
                plant_submitted_at = CURRENT_TIMESTAMP,
                plant_cases = ?,
                plant_notes = ?,
                current_stage = CASE WHEN current_stage = 'stage1' THEN 'stage2' ELSE current_stage END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `);

          for (const ord of orders) {
            updateOrderStmt.run(cases_count || 0, plant_notes || '', ord.id);
          }
        });

        runTx();

        res.json({
          success: true,
          message: 'Fulfillment submitted to office successfully.'
        });
      } catch (err) {
        console.error('Error submitting plant manifest:', err);
        res.status(500).json({ error: err.message });
      }
    }
  };
}

module.exports = createManifestHandlers;

