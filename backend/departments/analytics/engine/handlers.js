const { buildDashboardSummaryResponse, buildExecutiveKpiResponse } = require('../../../shared/api/analytics-contract');
const analyticsDepartment = require('../service');

module.exports = function(db) {
  function getContactScopeFilter(req, tableAlias = 'c') {
    if (req.user && req.user.role === 'worker') {
      const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
      return `(
        (${tableAlias}.id IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}') OR ${tableAlias}.created_by_user_id IN (SELECT id FROM users WHERE role = 'worker') OR ${tableAlias}.created_by_user_id = '${safeUserId}')
        AND ${tableAlias}.id NOT IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}' AND exclude_from_stats = 1)
      )`;
    }
    return `${tableAlias}.exclude_from_stats = 0`;
  }

  return {
    getAnalytics: (req, res) => {
      try {
        const stmt = db.prepare('SELECT * FROM analytics ORDER BY created_at DESC');
        const data = stmt.all();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getAnalyticsByType: (req, res) => {
      try {
        const { metricType } = req.params;
        const stmt = db.prepare('SELECT * FROM analytics WHERE metric_type = ? ORDER BY created_at DESC');
        const data = stmt.all(metricType);
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getDashboardSummary: (req, res) => {
      try {
        const response = analyticsDepartment.getDashboardSummary(db, req.user, {
          preset: 'all',
          requestId: req.requestId
        });
        return res.json(response);
      } catch (error) {
        console.error('Error in getDashboardSummary:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    },

    createAnalytic: (req, res) => {
      try {
        const { id, metric_type, metric_name, metric_value, metric_json, period } = req.body;
        if (!metric_type) return res.status(400).json({ error: 'metric_type required' });

        const existing = db.prepare('SELECT id FROM analytics WHERE id = ?').get(id);
        
        if (existing) {
          const stmt = db.prepare(`
            UPDATE analytics SET 
              metric_name = ?, 
              metric_value = ?, 
              metric_json = ?,
              period = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `);
          stmt.run(metric_name || null, metric_value || null, metric_json || null, period || null, id);
        } else {
          const stmt = db.prepare(`
            INSERT INTO analytics (id, metric_type, metric_name, metric_value, metric_json, period, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `);
          stmt.run(id, metric_type, metric_name || null, metric_value || null, metric_json || null, period || null);
        }

        const result = db.prepare('SELECT * FROM analytics WHERE id = ?').get(id);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    updateAnalytic: (req, res) => {
      try {
        const { id } = req.params;
        const { metric_name, metric_value, metric_json, period } = req.body;

        const stmt = db.prepare(`
          UPDATE analytics SET 
            metric_name = ?, 
            metric_value = ?, 
            metric_json = ?,
            period = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `);
        stmt.run(metric_name, metric_value, metric_json, period, id);

        const result = db.prepare('SELECT * FROM analytics WHERE id = ?').get(id);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getTopProducts: (req, res) => {
      try {
        const scope = getContactScopeFilter(req, 'c');
        const stmt = db.prepare(`
          SELECT 
            p.name, 
            v.pack_size_value, 
            v.pack_size_type, 
            COALESCE(SUM(ii.qty), 0) as total_qty, 
            COALESCE(SUM(ii.final_amount), 0) as total_revenue
          FROM invoice_items ii
          JOIN products p ON ii.product_id = p.id
          LEFT JOIN variants v ON ii.variant_id = v.id
          JOIN invoices i ON ii.invoice_id = i.id
          JOIN contacts c ON i.customer_id = c.id
          WHERE ${scope}
          GROUP BY ii.product_id, ii.variant_id
          ORDER BY total_revenue DESC
          LIMIT 10
        `);
        const data = stmt.all();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getTopCustomers: (req, res) => {
      try {
        const scope = getContactScopeFilter(req, 'c');
        const stmt = db.prepare(`
          SELECT 
            c.id, 
            c.name, 
            COALESCE(SUM(i.grand_total), 0) as total_spent, 
            COUNT(i.id) as order_count
          FROM invoices i
          JOIN contacts c ON i.customer_id = c.id
          WHERE ${scope}
          GROUP BY i.customer_id
          ORDER BY total_spent DESC
          LIMIT 10
        `);
        const data = stmt.all();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getCustomerStats: (req, res) => {
      try {
        const { id } = req.params;
        
        // Avg Order Value
        const avgOrder = db.prepare('SELECT AVG(grand_total) as avg_value FROM invoices WHERE customer_id = ?').get(id);
        
        // Favorite Products
        const favProducts = db.prepare(`
          SELECT p.name, COUNT(*) as frequency
          FROM invoice_items ii
          JOIN products p ON ii.product_id = p.id
          WHERE ii.invoice_id IN (SELECT id FROM invoices WHERE customer_id = ?)
          GROUP BY ii.product_id
          ORDER BY frequency DESC
          LIMIT 3
        `).all(id);

        // Settlement Time (Approximate: Avg days between invoice and payment for this customer)
        const settlement = db.prepare(`
          WITH CustomerDates AS (
            SELECT created_at as date, 'invoice' as type FROM invoices WHERE customer_id = ?
            UNION ALL
            SELECT created_at as date, 'payment' as type FROM payments WHERE customer_id = ?
          )
          SELECT 
            AVG(JulianDay(p.date) - JulianDay(i.date)) as avg_settlement_days
          FROM CustomerDates i
          JOIN CustomerDates p ON p.date > i.date
          WHERE i.type = 'invoice' AND p.type = 'payment'
          AND i.date = (SELECT MAX(date) FROM CustomerDates WHERE type = 'invoice' AND date < p.date)
        `).get(id, id);

        // Current Debt
        const ledger = db.prepare('SELECT current_due FROM ledger WHERE customer_id = ?').get(id);

        // Total Sales (Lifetime Revenue)
        const totalSales = db.prepare('SELECT SUM(grand_total) as total FROM invoices WHERE customer_id = ?').get(id);

        res.json({
          avg_order_value: avgOrder?.avg_value || 0,
          favorite_products: favProducts,
          avg_settlement_days: settlement?.avg_settlement_days || 0,
          current_due: ledger?.current_due || 0,
          total_sales: totalSales?.total || 0
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getSalesTrend: (req, res) => {
      try {
        const scope = getContactScopeFilter(req, 'c');
        const stmt = db.prepare(`
          SELECT 
            strftime('%Y-%m', i.created_at) as month,
            SUM(i.grand_total) as revenue,
            COUNT(i.id) as count
          FROM invoices i
          JOIN contacts c ON i.customer_id = c.id
          WHERE ${scope}
          GROUP BY month
          ORDER BY month DESC
          LIMIT 12
        `);
        const data = stmt.all();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getProductCategoryPerformance: (req, res) => {
      try {
        const scope = getContactScopeFilter(req, 'c');
        const stmt = db.prepare(`
          SELECT 
            COALESCE(cat.name, 'Uncategorized') as category,
            SUM(ii.qty) as total_qty,
            SUM(ii.final_amount) as total_revenue
          FROM invoice_items ii
          JOIN products p ON ii.product_id = p.id
          JOIN invoices i ON ii.invoice_id = i.id
          JOIN contacts c ON i.customer_id = c.id
          LEFT JOIN categories cat ON p.category_id = cat.id
          WHERE ${scope}
          GROUP BY category
          ORDER BY total_revenue DESC
        `);
        const data = stmt.all();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    deleteAnalytic: (req, res) => {
      try {
        const { id } = req.params;
        const stmt = db.prepare('DELETE FROM analytics WHERE id = ?');
        stmt.run(id);
        res.json({ success: true, id });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getExecutiveKPI: (req, res) => {
      try {
        const response = analyticsDepartment.getExecutiveKpi(db, req.user, {
          startDate: req.query.startDate || req.query.start_date || null,
          endDate: req.query.endDate || req.query.end_date || null,
          requestId: req.requestId
        });
        return res.json(response);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    },

    getSalesDeepDive: (req, res) => {
      try {
        const { period = 'monthly' } = req.query; // 'daily', 'monthly', 'quarterly'
        const scope = getContactScopeFilter(req, 'c');
        
        let groupByFormat = "%Y-%m";
        if (period === 'daily') groupByFormat = "%Y-%m-%d";

        const stmt = db.prepare(`
          SELECT 
            strftime('${groupByFormat}', i.invoice_date) as period,
            COALESCE(SUM(i.grand_total), 0) as gross_revenue,
            COALESCE(SUM(i.total_amount), 0) as taxable_amount,
            COALESCE(SUM(i.total_gst), 0) as gst_collected,
            COALESCE(SUM(i.total_discount), 0) as discount_given,
            COUNT(i.id) as invoice_count
          FROM invoices i
          JOIN contacts c ON i.customer_id = c.id
          WHERE ${scope} AND i.invoice_date IS NOT NULL
          GROUP BY period
          ORDER BY period ASC
          LIMIT 24
        `);
        const data = stmt.all();

        // Tax details (SGST/CGST breakdown)
        const taxDetailsStmt = db.prepare(`
          SELECT 
            COALESCE(SUM(ii.sgst_amount), 0) as total_sgst,
            COALESCE(SUM(ii.cgst_amount), 0) as total_cgst,
            COALESCE(SUM(ii.discount_1_amount + ii.discount_2_amount), 0) as line_item_discounts
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.id
          JOIN contacts c ON i.customer_id = c.id
          WHERE ${scope}
        `);
        const taxData = taxDetailsStmt.get();

        res.json({
          time_series: data,
          tax_summary: taxData
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getOrderFunnel: (req, res) => {
      try {
        const scope = getContactScopeFilter(req, 'c');
        // Stage breakdown
        const stagesStmt = db.prepare(`
          SELECT 
            o.current_stage,
            COUNT(o.id) as order_count,
            COALESCE(SUM(o.total_amount), 0) as total_value
          FROM orders o
          JOIN contacts c ON o.customer_id = c.id
          WHERE ${scope}
          GROUP BY o.current_stage
        `);
        const stageData = stagesStmt.all();

        // Status breakdown
        const statusStmt = db.prepare(`
          SELECT 
            o.status,
            COUNT(o.id) as order_count,
            COALESCE(SUM(o.total_amount), 0) as total_value
          FROM orders o
          JOIN contacts c ON o.customer_id = c.id
          WHERE ${scope}
          GROUP BY o.status
        `);
        const statusData = statusStmt.all();

        // Recent pending pipeline
        const pipelineStmt = db.prepare(`
          SELECT 
            o.id,
            o.order_number,
            c.name as customer_name,
            o.current_stage,
            o.status,
            o.total_amount,
            o.order_date
          FROM orders o
          JOIN contacts c ON o.customer_id = c.id
          WHERE ${scope} AND o.current_stage IN ('stage1', 'stage2')
          ORDER BY o.order_date DESC
          LIMIT 10
        `);
        const pipelineData = pipelineStmt.all();

        res.json({
          stages: stageData,
          statuses: statusData,
          pending_pipeline: pipelineData
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getARAging: (req, res) => {
      try {
        const scope = getContactScopeFilter(req, 'c');
        // Calculate aging brackets based on invoices and payments
        const invoicesStmt = db.prepare(`
          SELECT 
            i.id,
            i.invoice_no,
            i.customer_id,
            c.name as customer_name,
            i.grand_total,
            i.invoice_date,
            i.due_date,
            CAST(julianday('now') - julianday(COALESCE(i.due_date, i.invoice_date)) AS INTEGER) as days_overdue
          FROM invoices i
          JOIN contacts c ON i.customer_id = c.id
          WHERE ${scope}
        `);
        const invoices = invoicesStmt.all();

        const ledgerStmt = db.prepare(`
          SELECT 
            c.id as customer_id,
            c.name as customer_name,
            l.current_due,
            l.current_status
          FROM ledger l
          JOIN contacts c ON l.customer_id = c.id
          WHERE ${scope} AND l.current_due > 0
          ORDER BY l.current_due DESC
        `);
        const customerDues = ledgerStmt.all();

        // Aging Buckets
        let b0_30 = 0, b31_60 = 0, b61_90 = 0, b90_plus = 0;

        invoices.forEach(inv => {
          const days = inv.days_overdue || 0;
          const val = inv.grand_total || 0;
          if (days <= 30) b0_30 += val;
          else if (days <= 60) b31_60 += val;
          else if (days <= 90) b61_90 += val;
          else b90_plus += val;
        });

        res.json({
          buckets: {
            "0-30 days": b0_30,
            "31-60 days": b31_60,
            "61-90 days": b61_90,
            "90+ days": b90_plus
          },
          top_debtors: customerDues.slice(0, 15)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getRFMSegmentation: (req, res) => {
      try {
        const scope = getContactScopeFilter(req, 'c');
        const stmt = db.prepare(`
          SELECT 
            c.id,
            c.name,
            COUNT(i.id) as order_frequency,
            COALESCE(SUM(i.grand_total), 0) as monetary_value,
            MAX(i.invoice_date) as last_order_date,
            CAST(julianday('now') - julianday(MAX(i.invoice_date)) AS INTEGER) as recency_days
          FROM contacts c
          LEFT JOIN invoices i ON c.id = i.customer_id
          WHERE (c.type IS NULL OR LOWER(c.type) = 'customer') AND ${scope}
          GROUP BY c.id
          HAVING order_frequency > 0
          ORDER BY monetary_value DESC
        `);
        const customers = stmt.all();

        // Classify customers into segments
        const segmented = customers.map(cust => {
          let tier = 'Regular';
          if (cust.monetary_value > 50000 && cust.order_frequency >= 5) {
            tier = 'VIP Tier';
          } else if (cust.recency_days > 90) {
            tier = 'At Risk / Dormant';
          } else if (cust.order_frequency >= 3) {
            tier = 'Frequent Buyer';
          }
          return { ...cust, tier };
        });

        res.json(segmented);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getProductVelocity: (req, res) => {
      try {
        const scope = getContactScopeFilter(req, 'c');
        // Product velocity (sales quantity & revenue)
        const velocityStmt = db.prepare(`
          SELECT 
            p.id as product_id,
            p.name as product_name,
            COALESCE(cat.name, 'Uncategorized') as category_name,
            SUM(ii.qty) as total_units_sold,
            SUM(ii.final_amount) as total_revenue
          FROM invoice_items ii
          JOIN products p ON ii.product_id = p.id
          LEFT JOIN categories cat ON p.category_id = cat.id
          JOIN invoices i ON ii.invoice_id = i.id
          JOIN contacts c ON i.customer_id = c.id
          WHERE ${scope}
          GROUP BY p.id
          ORDER BY total_revenue DESC
          LIMIT 20
        `);
        const velocity = velocityStmt.all();

        // Batch Expiry Risk Watchlist (Batches expiring soon)
        const expiryStmt = db.prepare(`
          SELECT 
            b.id as batch_id,
            b.batch_no,
            p.name as product_name,
            b.mrp,
            b.exp_date,
            b.units_sold,
            CAST(julianday(b.exp_date) - julianday('now') AS INTEGER) as days_to_expiry
          FROM batches b
          JOIN variants v ON b.variant_id = v.id
          JOIN products p ON v.product_id = p.id
          WHERE b.exp_date IS NOT NULL AND days_to_expiry <= 180
          ORDER BY days_to_expiry ASC
          LIMIT 15
        `);
        const expiringBatches = expiryStmt.all();

        res.json({
          product_velocity: velocity,
          expiring_batches: expiringBatches
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getComparativeAnalysis: (req, res) => {
      try {
        const { type = 'yoy', startDateA, endDateA, startDateB, endDateB } = req.query;
        const scope = getContactScopeFilter(req, 'c');

        if (type === 'yoy') {
          // Year on Year: Group by Year and Month
          const stmt = db.prepare(`
            SELECT 
              strftime('%Y', i.invoice_date) as year,
              strftime('%m', i.invoice_date) as month,
              COALESCE(SUM(i.grand_total), 0) as revenue,
              COUNT(i.id) as invoice_count
            FROM invoices i
            JOIN contacts c ON i.customer_id = c.id
            WHERE ${scope} AND i.invoice_date IS NOT NULL
            GROUP BY year, month
            ORDER BY year DESC, month ASC
          `);
          const rows = stmt.all();

          // Organize by year -> month
          const yearMap = {};
          rows.forEach(r => {
            if (!yearMap[r.year]) yearMap[r.year] = Array(12).fill(0);
            const mIdx = parseInt(r.month, 10) - 1;
            if (mIdx >= 0 && mIdx < 12) {
              yearMap[r.year][mIdx] = r.revenue;
            }
          });

          return res.json({ yearMap, raw: rows });
        }

        if (type === 'mom') {
          // Month-on-Month: Sequential 18 months
          const stmt = db.prepare(`
            SELECT 
              strftime('%Y-%m', i.invoice_date) as month,
              COALESCE(SUM(i.grand_total), 0) as revenue,
              COUNT(i.id) as invoice_count
            FROM invoices i
            JOIN contacts c ON i.customer_id = c.id
            WHERE ${scope} AND i.invoice_date IS NOT NULL
            GROUP BY month
            ORDER BY month ASC
            LIMIT 24
          `);
          const rows = stmt.all();

          const result = rows.map((curr, idx) => {
            const prev = idx > 0 ? rows[idx - 1] : null;
            const prevRevenue = prev ? prev.revenue : 0;
            const diff = prev ? curr.revenue - prevRevenue : 0;
            const percentChange = prevRevenue > 0 ? ((diff / prevRevenue) * 100).toFixed(1) : (curr.revenue > 0 ? 100 : 0);
            return {
              ...curr,
              prev_revenue: prevRevenue,
              variance_amount: diff,
              growth_percent: Number(percentChange)
            };
          });

          return res.json(result);
        }

        if (type === 'qoq') {
          // Quarter-on-Quarter
          const stmt = db.prepare(`
            SELECT 
              strftime('%Y', i.invoice_date) as year,
              CASE 
                WHEN CAST(strftime('%m', i.invoice_date) AS INTEGER) BETWEEN 1 AND 3 THEN 'Q1'
                WHEN CAST(strftime('%m', i.invoice_date) AS INTEGER) BETWEEN 4 AND 6 THEN 'Q2'
                WHEN CAST(strftime('%m', i.invoice_date) AS INTEGER) BETWEEN 7 AND 9 THEN 'Q3'
                ELSE 'Q4'
              END as quarter,
              COALESCE(SUM(i.grand_total), 0) as revenue,
              COUNT(i.id) as invoice_count
            FROM invoices i
            JOIN contacts c ON i.customer_id = c.id
            WHERE ${scope} AND i.invoice_date IS NOT NULL
            GROUP BY year, quarter
            ORDER BY year DESC, quarter ASC
          `);
          const rows = stmt.all();

          return res.json(rows);
        }

        if (type === 'custom') {
          if (!startDateA || !endDateA || !startDateB || !endDateB) {
            return res.status(400).json({ error: 'startDateA, endDateA, startDateB, and endDateB required for custom comparison' });
          }

          const getPeriodMetrics = (sDate, eDate) => {
            const billed = db.prepare(`
              SELECT 
                COALESCE(SUM(i.grand_total), 0) as revenue,
                COALESCE(SUM(i.total_gst), 0) as total_gst,
                COALESCE(SUM(i.total_discount), 0) as total_discount,
                COUNT(i.id) as invoice_count
              FROM invoices i
              JOIN contacts c ON i.customer_id = c.id
              WHERE ${scope} AND i.invoice_date BETWEEN ? AND ?
            `).get(sDate, eDate);

            const collected = db.prepare(`
              SELECT COALESCE(SUM(p.amount), 0) as total_collected
              FROM payments p
              JOIN contacts c ON p.customer_id = c.id
              WHERE ${scope} AND p.type = 'PAYMENT' AND p.payment_date BETWEEN ? AND ?
            `).get(sDate, eDate);

            const rev = billed.revenue || 0;
            const invCount = billed.invoice_count || 0;
            const aiv = invCount > 0 ? rev / invCount : 0;

            return {
              revenue: rev,
              total_gst: billed.total_gst || 0,
              total_discount: billed.total_discount || 0,
              invoice_count: invCount,
              avg_invoice_value: aiv,
              total_collected: collected.total_collected || 0
            };
          };

          const periodA = getPeriodMetrics(startDateA, endDateA);
          const periodB = getPeriodMetrics(startDateB, endDateB);

          const revDiff = periodA.revenue - periodB.revenue;
          const revPercent = periodB.revenue > 0 ? ((revDiff / periodB.revenue) * 100).toFixed(1) : (periodA.revenue > 0 ? 100 : 0);

          return res.json({
            periodA: { ...periodA, startDate: startDateA, endDate: endDateA },
            periodB: { ...periodB, startDate: startDateB, endDate: endDateB },
            variance: {
              revenue_diff: revDiff,
              revenue_growth_percent: Number(revPercent)
            }
          });
        }

        res.status(400).json({ error: 'Invalid comparison type' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getCustomerStats: (req, res) => {
      try {
        const { id } = req.params;
        const scope = getContactScopeFilter(req, 'c');
        
        const customer = db.prepare(`
          SELECT c.*, l.current_due as ledger_due, l.current_due as total_outstanding
          FROM contacts c
          LEFT JOIN ledger l ON c.id = l.customer_id
          WHERE c.id = ? AND ${scope}
        `).get(id);

        if (!customer) {
          return res.status(404).json({ error: 'Customer not found or not accessible' });
        }

        // Total sales and average order value
        const salesStats = db.prepare(`
          SELECT 
            COALESCE(SUM(grand_total), 0) as total_sales,
            COALESCE(AVG(grand_total), 0) as avg_order_value,
            COUNT(id) as invoice_count
          FROM invoices
          WHERE customer_id = ?
        `).get(id);

        // Favorite products
        const favoriteProducts = db.prepare(`
          SELECT 
            p.name,
            COUNT(ii.id) as frequency,
            SUM(ii.qty) as total_qty
          FROM invoice_items ii
          JOIN products p ON ii.product_id = p.id
          JOIN invoices i ON ii.invoice_id = i.id
          WHERE i.customer_id = ?
          GROUP BY p.id
          ORDER BY frequency DESC, total_qty DESC
          LIMIT 8
        `).all(id);

        // Average settlement days
        const settlementStmt = db.prepare(`
          SELECT 
            AVG(CAST(julianday(p.payment_date) - julianday(i.invoice_date) AS REAL)) as avg_days
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE p.customer_id = ? AND p.payment_date >= i.invoice_date
        `).get(id);

        const avgSettlementDays = settlementStmt && settlementStmt.avg_days ? Math.max(0, settlementStmt.avg_days) : 0;

        res.json({
          total_sales: salesStats.total_sales || 0,
          avg_order_value: salesStats.avg_order_value || 0,
          invoice_count: salesStats.invoice_count || 0,
          avg_settlement_days: avgSettlementDays,
          current_due: customer.ledger_due !== null && customer.ledger_due !== undefined ? customer.ledger_due : (customer.opening_balance || 0),
          favorite_products: favoriteProducts || []
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  };
};
