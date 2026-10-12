const express = require('express');
const contract = require('../../shared/api/billing-contract');
const calculator = require('../../core/billing/calculator');
const service = require('./service');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');
const ordersModule = require('../../core/orders');
const paymentsModule = require('../../core/payments');
const variantsModule = require('../../core/variants');
const batchesModule = require('../../core/batches');
const creditNotesModule = require('../../core/creditnotes');
const invoicesModule = require('../../core/invoices');
const { EmailReminderScheduler } = require('./services/email-reminder-scheduler');

module.exports = {
  name: 'billing',
  namespace: 'billing',
  path: __dirname,
  description: 'Financial truth and customer statement domain',
  contract,
  service,
  engine: calculator,
  adapterPaths: [],
  create(db) {
    if (!db) throw new TypeError('Billing department requires a database');
    const router = express.Router();
    const domainService = createHandlers(db);
    router.get('/status', (req, res) => {
      res.json({
        status: 'running',
        name: 'Billing App',
        version: '1.0.1',
        description: 'Handles transactions, invoices, and related financial domains',
        endpoints: {
          billing: '/api/billing',
          products: '/api/billing/products',
          orders: '/api/billing/orders',
          payments: '/api/billing/payments',
          variants: '/api/billing/variants',
          batches: '/api/billing/batches',
          creditnotes: '/api/billing/creditnotes',
          invoices: '/api/billing/invoices'
        }
      });
    });
    let emailScheduler = null;

    return {
      name: 'billing',
      compatibilityEngine: false,
      router,
      service: domainService,
      initializeDatabase() {
        const relatedModules = [ordersModule, paymentsModule, variantsModule, batchesModule, creditNotesModule, invoicesModule];
        relatedModules.forEach(module => module.initializeDatabase(db));
        router.use('/orders', ordersModule.router);
        router.use('/payments', paymentsModule.router);
        router.use('/variants', variantsModule.router);
        router.use('/batches', batchesModule.router);
        router.use('/creditnotes', creditNotesModule.router);
        router.use('/invoices', invoicesModule.router);
        createRoutes(router, domainService);

        // Start email reminder scheduler
        emailScheduler = new EmailReminderScheduler(db);

        // ── Email Reminder API endpoints ─────────────────────────────────
        // GET  /api/billing/email/status  — returns current email config summary
        router.get('/email/status', (req, res) => {
          try {
            const getSetting = (key, fb) => {
              try { const r = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?').get(key); return r ? r.setting_value : fb; } catch(_) { return fb; }
            };
            res.json({
              enabled:         getSetting('email_reminders_enabled', 'false'),
              recipient:       getSetting('email_reminder_to', 'me@faizal.uk'),
              sender:          getSetting('email_reminder_from', 'reports@faizal.uk'),
              smtp_host:       getSetting('email_smtp_host', '127.0.0.1'),
              smtp_port:       getSetting('email_smtp_port', '587'),
              smtp_user:       getSetting('email_smtp_user', 'reports@faizal.uk'),
              smtp_secure:     getSetting('email_smtp_secure', 'false'),
              daily_enabled:   getSetting('email_daily_summary_enabled', 'false'),
              daily_time:      getSetting('email_daily_summary_time', '08:00'),
              weekly_enabled:  getSetting('email_weekly_summary_enabled', 'false'),
              weekly_day:      getSetting('email_weekly_summary_day', '1'),
              weekly_time:     getSetting('email_weekly_summary_time', '09:00'),
              invoice_7d:      getSetting('email_invoice_7d_enabled', 'false'),
              invoice_14d:     getSetting('email_invoice_14d_enabled', 'false'),
              invoice_30d:     getSetting('email_invoice_30d_enabled', 'false'),
              invoice_time:    getSetting('email_invoice_check_time', '10:00'),
              order_3d:        getSetting('email_order_3d_enabled', 'false'),
              order_7d:        getSetting('email_order_7d_enabled', 'false'),
              order_time:      getSetting('email_order_check_time', '10:30'),
              low_stock:       getSetting('email_low_stock_enabled', 'false'),
              low_stock_time:  getSetting('email_low_stock_check_time', '07:00'),
            });
          } catch (err) { res.status(500).json({ error: err.message }); }
        });

        // POST /api/billing/email/test  — send a test SMTP email
        router.post('/email/test', async (req, res) => {
          try { res.json(await emailScheduler.testSmtp()); }
          catch (err) { res.status(500).json({ ok: false, error: err.message }); }
        });

        // POST /api/billing/email/trigger  — manually fire any reminder
        router.post('/email/trigger', async (req, res) => {
          try {
            const { type, days } = req.body;
            let ok = false;
            if (type === 'daily')          ok = await emailScheduler.triggerDaily();
            else if (type === 'weekly')    ok = await emailScheduler.triggerWeekly();
            else if (type === 'invoice')   ok = await emailScheduler.triggerInvoiceOverdue(parseInt(days, 10) || 7);
            else if (type === 'order')     ok = await emailScheduler.triggerOrderPending(parseInt(days, 10) || 3);
            else if (type === 'lowstock')  ok = await emailScheduler.triggerLowStock();
            else return res.status(400).json({ error: 'Unknown trigger type' });
            res.json({ ok });
          } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
        });
      },
      getDatabase() { return db; },
      destroy() { if (emailScheduler) emailScheduler.destroy(); },
    };
  },
  ownedResponsibilities: [
    'invoices',
    'payments',
    'credit-notes',
    'ledger',
    'aging',
    'customer-statements',
    'dashboard-metrics'
  ]
};
