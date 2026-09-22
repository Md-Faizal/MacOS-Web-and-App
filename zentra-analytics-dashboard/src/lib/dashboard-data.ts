import { apiFetch } from './auth';

export type DashboardMetricsResponse = {
  success?: boolean;
  data?: {
    summary?: {
      totalBilled?: number;
      totalCollected?: number;
      amountDue?: number;
      collectionRatePercent?: number;
      billCount?: number;
      activeCustomersCount?: number;
    };
    sales?: any;
    orders?: any;
    raw?: any;
  };
  meta?: any;
};

export async function loadDashboardOverview() {
  const [billingResponse, analyticsResponse] = await Promise.all([
    apiFetch<DashboardMetricsResponse>('/api/billing/dashboard-metrics').catch(() => null),
    apiFetch<any>('/api/analytics/summary/dashboard').catch(() => null),
  ]);

  const billing = billingResponse?.data?.summary || {};
  const analytics = analyticsResponse?.data || {};

  const netRevenue = Number(billing.totalBilled ?? analytics.totalRevenue ?? 0);
  const collected = Number(billing.totalCollected ?? 0);
  const due = Number(billing.amountDue ?? analytics.receivables ?? 0);
  const collectionRate = Number(billing.collectionRatePercent ?? analytics.growthRate ?? 0);
  const customers = Number(billing.activeCustomersCount ?? analytics.totalCustomers ?? 0);

  return {
    totalRevenue: netRevenue,
    totalCollected: collected,
    amountDue: due,
    collectionRate,
    activeCustomers: customers,
    billing,
    analytics,
  };
}

export async function loadExecutiveKpi() {
  const response = await apiFetch<any>('/api/analytics/executive-kpi');
  return response?.data?.summary || response?.data?.metrics || response?.data || {};
}

export async function loadBillingSummary() {
  const response = await apiFetch<any>('/api/billing/summary');
  return response?.data || response || {};
}
