const billingCalculator = require('../../core/billing/calculator');
const { buildDashboardMetricsResponse, buildCustomerStatementResponse } = require('../../shared/api/billing-contract');

function normalizeOptions(options = {}) {
  return {
    preset: options.preset || 'all',
    startDate: options.startDate || options.start_date || null,
    endDate: options.endDate || options.end_date || null,
    customerId: options.customerId || options.customer_id || null
  };
}

function getDashboardMetrics(db, user, options = {}) {
  const normalized = normalizeOptions(options);
  const metrics = billingCalculator.calculateDashboardMetrics(db, user, normalized);
  return buildDashboardMetricsResponse(metrics, options.requestId || null);
}

function getCustomerStatement(db, customerId, user, options = {}) {
  const statement = billingCalculator.calculateCustomerStatement(db, customerId, user, options || {});
  return buildCustomerStatementResponse(statement, options.requestId || null);
}

module.exports = {
  name: 'billing',
  calculator: billingCalculator,
  getDashboardMetrics,
  getCustomerStatement,
  normalizeOptions
};
