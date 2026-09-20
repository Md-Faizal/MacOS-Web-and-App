const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../../database/MacOS.db');
const db = new Database(dbPath);
const billingCalculator = require('../core/billing/calculator');
const analyticsHandlers = require('../../frontend/modules/analytics/api/handlers')(db);
const contactsHandlers = require('../../frontend/modules/contacts/api/handlers')(db);
const productsHandlers = require('../../frontend/modules/product-list/api/handlers')(db);

const adminUser = { id: 1, role: 'owner' };
const checks = [];

function capture(fn, req) {
  return new Promise((resolve) => {
    const res = {
      status(code) {
        this.code = code;
        return this;
      },
      json(payload) {
        resolve({ code: this.code || 200, payload });
      }
    };

    fn(req, res);
  });
}

(async () => {
  const dashboard = billingCalculator.calculateDashboardMetrics(db, adminUser, { preset: 'all' });
  checks.push({
    name: 'billing_dashboard_metrics',
    ok: !!dashboard && !!dashboard.keyMetrics,
    details: {
      totalBilled: dashboard?.keyMetrics?.totalBilled,
      amountDue: dashboard?.keyMetrics?.amountDue,
      overdueAmount: dashboard?.keyMetrics?.overdueAmount
    }
  });

  const analyticsSummary = await capture(analyticsHandlers.getDashboardSummary, { user: adminUser });
  checks.push({
    name: 'analytics_dashboard_summary',
    ok: analyticsSummary.payload && typeof analyticsSummary.payload === 'object',
    details: {
      statusCode: analyticsSummary.code,
      totalRevenue: analyticsSummary.payload?.totalRevenue,
      totalCustomers: analyticsSummary.payload?.totalCustomers
    }
  });

  const contactsList = await capture(contactsHandlers.getContacts, { user: adminUser, query: { limit: 5 } });
  checks.push({
    name: 'contacts_list',
    ok: Array.isArray(contactsList.payload),
    details: {
      statusCode: contactsList.code,
      count: Array.isArray(contactsList.payload) ? contactsList.payload.length : 0
    }
  });

  const productsList = await capture(productsHandlers.getProducts, { user: adminUser, query: { limit: 5 } });
  checks.push({
    name: 'products_list',
    ok: Array.isArray(productsList.payload),
    details: {
      statusCode: productsList.code,
      count: Array.isArray(productsList.payload) ? productsList.payload.length : 0
    }
  });

  const failed = checks.filter(check => !check.ok);
  console.log('=== PHASE 0 BASELINE CHECK ===');
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} :: ${check.name}`, JSON.stringify(check.details));
  }

  if (failed.length) {
    console.error(`\n${failed.length} baseline check(s) failed.`);
    process.exit(1);
  }

  console.log('\nPhase 0 baseline checks passed. Ready for shared API foundation.');
})();
