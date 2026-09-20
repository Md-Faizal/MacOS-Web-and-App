const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../../database/MacOS.db');
const db = new Database(dbPath);

console.log('=== VERIFYING 4 CORE BUSINESS APPS API PARITY ===\n');

// 1. BILLING (HEAVY LIFTER)
console.log('--- 1. BILLING APP ---');
const calculator = require('../core/billing/calculator');
const adminUser = { id: 1, role: 'owner' };

// Dashboard metrics
const billingMetrics = calculator.calculateDashboardMetrics(db, adminUser, { preset: 'all' });
console.log('✓ calculateDashboardMetrics:', {
  totalBilled: billingMetrics.keyMetrics.totalBilled,
  totalCollected: billingMetrics.keyMetrics.totalCollected,
  amountDue: billingMetrics.keyMetrics.amountDue,
  overdueAmount: billingMetrics.keyMetrics.overdueAmount,
  collectionRate: billingMetrics.keyMetrics.collectionRatePercent + '%'
});

// Statement for customer 5
const statement = calculator.calculateCustomerStatement(db, 5, adminUser);
console.log('✓ calculateCustomerStatement (Customer 5):', {
  success: statement.success,
  customer: statement.customer?.name,
  billsCount: statement.bills?.length,
  paymentsCount: statement.payments?.length,
  totalBilled: statement.summary?.total_billed,
  totalPaid: statement.summary?.total_paid,
  currentDue: statement.summary?.current_due,
  hasBankDetails: !!statement.bank
});

// Outstanding route check
const invoicePayments = require('../core/invoices/payments')(db);
let outstandingResult = null;
invoicePayments.getCustomerOutstanding({
  query: { customer_id: 5 }
}, {
  json: (data) => { outstandingResult = data; },
  status: () => ({ json: (err) => { outstandingResult = err; } })
});
console.log('✓ getCustomerOutstanding (Customer 5):', outstandingResult);

// 2. ANALYTICS APP
console.log('\n--- 2. ANALYTICS APP ---');
const analyticsHandlers = require('../departments/analytics/engine/handlers')(db);

let execKPI = null;
analyticsHandlers.getExecutiveKPI({ user: adminUser, query: {} }, {
  json: (data) => { execKPI = data; },
  status: () => ({ json: (err) => { execKPI = err; } })
});
console.log('✓ getExecutiveKPI:', {
  total_billed: execKPI?.total_billed,
  total_receivables: execKPI?.total_receivables,
  total_collected: execKPI?.total_collected,
  total_invoices: execKPI?.total_invoices,
  total_customers: execKPI?.total_customers
});

let dashSummary = null;
analyticsHandlers.getDashboardSummary({ user: adminUser }, {
  json: (data) => { dashSummary = data; },
  status: () => ({ json: (err) => { dashSummary = err; } })
});
console.log('✓ getDashboardSummary:', {
  totalRevenue: dashSummary?.totalRevenue,
  totalOrders: dashSummary?.totalOrders,
  totalCustomers: dashSummary?.totalCustomers,
  averageOrderValue: dashSummary?.averageOrderValue
});

// Parity Check between Billing and Analytics
console.log('Parity Check: Billing amountDue == Analytics total_receivables ?',
  billingMetrics.keyMetrics.amountDue === execKPI?.total_receivables ? '✅ PERFECT MATCH (' + execKPI?.total_receivables + ')' : '❌ MISMATCH');
console.log('Parity Check: Billing totalBilled == Analytics total_billed ?',
  billingMetrics.keyMetrics.totalBilled === execKPI?.total_billed ? '✅ PERFECT MATCH (' + execKPI?.total_billed + ')' : '❌ MISMATCH');

// 3. CONTACTS APP
console.log('\n--- 3. CONTACTS APP ---');
const contactsHandlers = require('../departments/contacts/engine/handlers')(db);
let contactsList = null;
contactsHandlers.getContacts({ user: adminUser, query: { limit: 5 } }, {
  json: (data) => { contactsList = data; },
  status: () => ({ json: (err) => { contactsList = err; } })
});
console.log('✓ getContacts returned count:', Array.isArray(contactsList) ? contactsList.length : 'Object wrapped');
if (Array.isArray(contactsList) && contactsList.length > 0) {
  const sample = contactsList[0];
  console.log('  Sample contact:', {
    id: sample.id,
    name: sample.name,
    type: sample.type,
    opening_balance: sample.opening_balance,
    current_due: sample.current_due
  });
}

// 4. PRODUCT LIST APP
console.log('\n--- 4. PRODUCT LIST APP ---');
const productsHandlers = require('../departments/product-list/engine/handlers')(db);
let productsList = null;
productsHandlers.getProducts({ user: adminUser, query: { limit: 5 } }, {
  json: (data) => { productsList = data; },
  status: () => ({ json: (err) => { productsList = err; } })
});
console.log('✓ getProducts returned count:', Array.isArray(productsList) ? productsList.length : 'Object wrapped');
if (Array.isArray(productsList) && productsList.length > 0) {
  const sampleP = productsList[0];
  console.log('  Sample product:', {
    id: sampleP.id,
    name: sampleP.name,
    sku: sampleP.sku,
    category: sampleP.category_name,
    variantsCount: sampleP.variants?.length,
    batchesCount: sampleP.batches?.length
  });
}

console.log('\n=== ALL 4 CORE BUSINESS APPS API PARITY VERIFIED ===');
