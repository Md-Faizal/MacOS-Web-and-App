const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '../../database/MacOS.db'));
const billingCalculator = require('../core/billing/calculator');
const { buildDashboardMetricsResponse, buildCustomerStatementResponse } = require('../shared/api/billing-contract');

const adminUser = { id: 1, role: 'owner' };
const metrics = billingCalculator.calculateDashboardMetrics(db, adminUser, { preset: 'all' });
const statement = billingCalculator.calculateCustomerStatement(db, 5, adminUser);

const dashboardResponse = buildDashboardMetricsResponse(metrics, 'phase2-check');
const statementResponse = buildCustomerStatementResponse(statement, 'phase2-check');

console.log('=== PHASE 2 BILLING CONTRACT CHECK ===');
console.log('dashboard success:', dashboardResponse.success, 'total billed:', dashboardResponse.data.summary.totalBilled);
console.log('statement success:', statementResponse.success, 'customer:', statementResponse.data?.customer?.name, 'current due:', statementResponse.data?.summary?.current_due);

const ok = dashboardResponse.success && statementResponse.success && dashboardResponse.data.summary.totalBilled > 0 && statementResponse.data.summary.current_due !== undefined;
if (!ok) {
  console.error('Phase 2 billing contract check failed.');
  process.exit(1);
}

console.log('\nPhase 2 billing contract checks passed.');
