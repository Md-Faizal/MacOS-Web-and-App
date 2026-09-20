function buildDashboardMetricsResponse(metrics, requestId) {
  const payload = metrics || {};
  const keyMetrics = payload.keyMetrics || {};
  const salesMetrics = payload.salesMetrics || {};
  const orderMetrics = payload.orderMetrics || {};

  return {
    success: true,
    data: {
      requestId: requestId || null,
      domain: 'billing',
      resource: 'dashboard-metrics',
      period: payload.period || null,
      summary: {
        totalBilled: Number(keyMetrics.totalBilled || 0),
        totalCollected: Number(keyMetrics.totalCollected || 0),
        amountDue: Number(keyMetrics.amountDue || 0),
        overdueAmount: Number(keyMetrics.overdueAmount || 0),
        collectionRatePercent: Number(keyMetrics.collectionRatePercent || 0),
        billCount: Number(keyMetrics.totalBillsCount || 0),
        activeCustomersCount: Number(keyMetrics.activeCustomersCount || 0)
      },
      sales: salesMetrics || {},
      orders: orderMetrics || {},
      raw: payload
    },
    meta: {
      generatedAt: new Date().toISOString(),
      status: 'ready',
      scope: payload.scope || 'all',
      source: 'billing-engine'
    }
  };
}

function buildCustomerStatementResponse(statement, requestId) {
  return {
    success: Boolean(statement && statement.success),
    data: statement && statement.success ? {
      requestId: requestId || null,
      domain: 'billing',
      resource: 'customer-statement',
      customer: statement.customer || null,
      summary: statement.summary || {},
      bills: statement.bills || [],
      payments: statement.payments || [],
      creditNotes: statement.creditNotes || [],
      aging: statement.aging || {},
      bank: statement.bank || null,
      raw: statement
    } : null,
    error: statement && !statement.success ? {
      code: 'CUSTOMER_STATEMENT_ERROR',
      message: statement.error || 'Customer statement unavailable',
      status: 404
    } : null,
    meta: {
      generatedAt: new Date().toISOString(),
      status: statement && statement.success ? 'ready' : 'error',
      scope: 'customer',
      source: 'billing-engine'
    }
  };
}

module.exports = {
  buildDashboardMetricsResponse,
  buildCustomerStatementResponse
};
