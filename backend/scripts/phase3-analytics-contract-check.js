const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '../../database/MacOS.db'));
const billingCalculator = require('../core/billing/calculator');
const { buildDashboardSummaryResponse, buildExecutiveKpiResponse } = require('../shared/api/analytics-contract');

const adminUser = { id: 1, role: 'owner' };
const metrics = billingCalculator.calculateDashboardMetrics(db, adminUser, { preset: 'all' });
const km = metrics.keyMetrics;
const sm = metrics.salesMetrics;
const om = metrics.orderMetrics;

const summary = {
  totalRevenue: km.totalBilled,
  totalOrders: om ? (om.totalOrders || km.totalBillsCount) : km.totalBillsCount,
  averageOrderValue: sm.averageBill,
  totalCustomers: km.activeCustomersCount,
  netProfit: Number((km.totalBilled * 0.25).toFixed(2)),
  growthRate: sm.monthly.percentageChange,
  dashboard: {
    revenue: km.totalBilled,
    orders: om ? (om.totalOrders || km.totalBillsCount) : km.totalBillsCount,
    receivables: km.amountDue
  },
  sales: metrics.topProducts,
  products: metrics.topProducts,
  receivables: km.amountDue,
  scope: 'all'
};

const kpi = {
  total_billed: Number((km.totalBilled || 0).toFixed(2)),
  total_invoiced_only: Number((km.totalBilled || 0).toFixed(2)),
  total_opening_balance: 0,
  total_collected: Number((km.totalCollected || 0).toFixed(2)),
  total_credit_notes: 0,
  total_receivables: Number((km.amountDue || 0).toFixed(2)),
  total_invoices: Number(km.totalBillsCount || 0),
  total_gst: Number((km.totalTax || 0).toFixed(2)),
  total_discount: Number((km.totalDiscount || 0).toFixed(2)),
  total_customers: Number(km.activeCustomersCount || 0),
  collection_rate_percent: Number(km.collectionRatePercent || 0),
  revenue: Number((km.totalBilled || 0).toFixed(2)),
  ordersCount: Number(km.totalBillsCount || 0),
  activeCustomers: Number(km.activeCustomersCount || 0),
  receivables: Number((km.amountDue || 0).toFixed(2)),
  scope: 'all'
};

const summaryResponse = buildDashboardSummaryResponse(summary, 'phase3-check');
const kpiResponse = buildExecutiveKpiResponse(kpi, 'phase3-check');

console.log('=== PHASE 3 ANALYTICS CONTRACT CHECK ===');
console.log('summary success:', summaryResponse.success, 'revenue:', summaryResponse.data.totalRevenue);
console.log('kpi success:', kpiResponse.success, 'receivables:', kpiResponse.data.summary.total_receivables);

const ok = summaryResponse.success && kpiResponse.success && summaryResponse.data.totalRevenue > 0 && kpiResponse.data.summary.total_receivables >= 0;
if (!ok) {
  console.error('Phase 3 analytics contract check failed.');
  process.exit(1);
}

console.log('\nPhase 3 analytics contract checks passed.');
