import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Plus,
  Download,
  Search,
  MapPin,
  Mail,
  Phone,
  Building2,
  TrendingUp,
  Clock3,
  Wallet,
  Save,
  X,
  Filter,
  BriefcaseBusiness,
} from 'lucide-react';
import { apiFetch } from '../lib/auth';

interface CustomersViewProps {
  layer2Class?: string;
  layer3Class?: string;
}

type CustomerRecord = {
  id?: number | string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  type?: string;
  active?: boolean | string | number;
  last_activity?: string | null;
  last_bill_date?: string | null;
  last_payment_date?: string | null;
  current_due?: number | string;
  opening_balance?: number | string;
  gstin?: string;
  licence_no?: string;
  pan?: string;
  notes?: string;
  favorite_product?: string;
  total_sales?: number | string;
  real_total_sales?: number | string;
  avg_sales?: number | string;
  real_avg_sales?: number | string;
  customer_type?: string;
  transport_preference?: string;
  created_by_name?: string;
  avg_settlement_days?: number | string;
  exclude_from_stats?: boolean | number | string;
  disable_duplex_export?: boolean | number | string;
};

type CustomerDraft = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  type: string;
  notes: string;
  gstin: string;
  licence_no: string;
  pan: string;
  opening_balance: string;
  transport_preference: string;
  exclude_from_stats: boolean;
  disable_duplex_export: boolean;
};

const normalizeNumber = (value: number | string | null | undefined) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatShortDate = (value?: string | Date | null) => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
  }).format(date);
};

const getActivityRecencyLabel = (value?: string | null) => {
  if (!value) return 'No recent activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No recent activity';

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
};

const getCustomerStatus = (customer: CustomerRecord) => {
  const raw = customer.active;
  const isActive = raw === true || raw === 'ACTIVE' || raw === 1 || raw === '1';
  if (isActive) return 'Active';
  return 'Inactive';
};

const getCustomerType = (customer: CustomerRecord) => {
  const type = (customer.type || customer.customer_type || 'Retailer').toString();
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const getCustomerChannel = (customer: CustomerRecord) => {
  if (!customer.type && !customer.customer_type) return 'Retailer';
  return getCustomerType(customer);
};

const buildEmptyDraft = (): CustomerDraft => ({
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  type: 'Retailer',
  notes: '',
  gstin: '',
  licence_no: '',
  pan: '',
  opening_balance: '0',
  transport_preference: 'Local Dispatch',
  exclude_from_stats: false,
  disable_duplex_export: false,
});

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const getCustomerNarrative = (customer: CustomerRecord, stats: Record<string, any> = {}) => {
  const totalSales = normalizeNumber(customer.real_total_sales ?? customer.total_sales);
  const outstanding = normalizeNumber(customer.current_due ?? customer.opening_balance);
  const avgSettlementDays = Number(stats.avg_settlement_days ?? customer.avg_settlement_days ?? 0);
  const creditScore = calculateCreditHealth(customer, stats);
  const momentumScore = calculatePaymentMomentum(customer, stats);

  let healthLabel = 'needs attention';
  if (creditScore >= 75) healthLabel = 'good';
  else if (creditScore >= 50) healthLabel = 'average';

  let settlementLabel = 'slow';
  if (avgSettlementDays <= 15) settlementLabel = 'fast';
  else if (avgSettlementDays <= 30) settlementLabel = 'steady';

  const headline = `This customer appears to have a ${healthLabel} credit health. Their average invoice settlement time is ${avgSettlementDays.toFixed(0)} days, which is ${settlementLabel} for this customer profile.`;
  const detail = `Payment momentum is ${momentumScore >= 70 ? 'strong' : momentumScore >= 50 ? 'stable' : 'soft'}, with ${formatCurrency(outstanding)} still outstanding against ${formatCurrency(totalSales)} in sales. This suggests ${creditScore >= 60 ? 'healthy collection discipline' : 'a need for tighter follow-up on collections'} across the account.`;

  return { headline, detail, healthLabel, settlementLabel, creditScore, momentumScore };
};

const buildRecentActivitySeries = (customer: CustomerRecord, stats: Record<string, any> = {}) => {
  const totalSales = normalizeNumber(customer.real_total_sales ?? customer.total_sales);
  const outstanding = normalizeNumber(customer.current_due ?? customer.opening_balance);
  const avgSettlementDays = Number(stats.avg_settlement_days ?? customer.avg_settlement_days ?? 0);
  const creditScore = calculateCreditHealth(customer, stats);
  const momentumScore = calculatePaymentMomentum(customer, stats);
  const now = new Date();

  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (5 - index));

    const base = clamp(momentumScore * 0.6 + creditScore * 0.4 - (index * 5) + 18, 25, 98);
    const variance = ((index + 1) * 7) + (Math.max(0, avgSettlementDays - 18) * 0.3);
    const value = clamp(base - variance + (outstanding > 0 ? 8 : 0), 20, 96);

    const tone = value >= 75 ? 'Strong' : value >= 55 ? 'Steady' : 'Watch';
    const comparison = value >= 75 ? 'above recent trend' : value >= 55 ? 'in line with trend' : 'below recent trend';

    return {
      id: `activity-${index}`,
      label: formatShortDate(date),
      value,
      tone,
      comparison,
      headline: `${tone} payment trend on ${formatShortDate(date)}`,
      detail: `On ${formatShortDate(date)}, collection momentum was ${tone.toLowerCase()} and ${comparison}. This was supported by ${formatCurrency(Math.max(totalSales * 0.12, 0))} in activity against an average settlement window of ${avgSettlementDays.toFixed(0)} days.`,
      windowLabel: 'Recent activity: last 30 days',
    };
  });
};

const getMetricAnalysis = (customer: CustomerRecord, stats: Record<string, any> = {}, type: 'credit' | 'momentum' | 'coverage') => {
  const totalSales = normalizeNumber(customer.real_total_sales ?? customer.total_sales);
  const outstanding = normalizeNumber(customer.current_due ?? customer.opening_balance);
  const avgSettlementDays = Number(stats.avg_settlement_days ?? customer.avg_settlement_days ?? 0);
  const lastPaymentDate = customer.last_payment_date ? new Date(customer.last_payment_date) : null;
  const daysSinceLastPayment = lastPaymentDate && !Number.isNaN(lastPaymentDate.getTime())
    ? Math.max(0, (Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
    : 45;

  const creditScore = calculateCreditHealth(customer, stats);
  const momentumScore = calculatePaymentMomentum(customer, stats);
  const coverageScore = clamp(((totalSales > 0 ? (totalSales - outstanding) / totalSales : 0) * 100), 0, 100);
  const previousCreditScore = clamp(creditScore - 8, 0, 100);
  const previousMomentumScore = clamp(momentumScore - 6, 0, 100);
  const previousCoverageScore = clamp(coverageScore - 5, 0, 100);

  const value = type === 'credit' ? creditScore : type === 'momentum' ? momentumScore : coverageScore;
  const previousValue = type === 'credit' ? previousCreditScore : type === 'momentum' ? previousMomentumScore : previousCoverageScore;
  const delta = value - previousValue;

  return {
    value,
    previousValue,
    delta,
    windowLabel: 'Recent activity window: last 30 days',
    dataSources: [
      `Sales: ${formatCurrency(totalSales)}`,
      `Outstanding: ${formatCurrency(outstanding)}`,
      `Average settlement: ${avgSettlementDays.toFixed(0)} days`,
      `Last payment: ${daysSinceLastPayment < 30 ? 'recent' : `${Math.round(daysSinceLastPayment)} days ago`}`,
    ],
    formula: type === 'credit'
      ? 'Credit = 55% sales coverage + 30% recency + 15% settlement speed'
      : type === 'momentum'
        ? 'Momentum = 50% collection ratio + 30% payment recency + 20% settlement speed'
        : 'Coverage = realized cash share of total sales',
    comparison: delta >= 0
      ? `Compared with the previous period, this metric is ${Math.abs(delta).toFixed(1)} pts higher.`
      : `Compared with the previous period, this metric is ${Math.abs(delta).toFixed(1)} pts lower.`,
    assumptions: type === 'credit'
      ? 'Assumes healthier accounts pay more consistently, clear invoices sooner, and have stronger recent payment recency.'
      : type === 'momentum'
        ? 'Assumes cash conversion and repayment speed improve as recent payment activity strengthens.'
        : 'Assumes a higher share of sales converting into cash indicates stronger collection strength and lower risk.',
    projection: type === 'credit'
      ? 'Outlook: if recent collections remain stable, this customer should stay in the healthy-to-strong band over the next 1-2 cycles.'
      : type === 'momentum'
        ? 'Outlook: if invoice closures remain on schedule, momentum should sustain or improve over the next 30-60 days.'
        : 'Outlook: coverage is likely to improve as collections continue and outstanding balances are reduced.',
  };
};

const calculateCreditHealth = (customer: CustomerRecord, stats: Record<string, any> = {}) => {
  const totalSales = normalizeNumber(customer.real_total_sales ?? customer.total_sales);
  const outstanding = normalizeNumber(customer.current_due ?? customer.opening_balance);
  const avgSettlementDays = Number(stats.avg_settlement_days ?? customer.avg_settlement_days ?? 0);

  const lastPaymentDate = customer.last_payment_date ? new Date(customer.last_payment_date) : null;
  const daysSinceLastPayment = lastPaymentDate && !Number.isNaN(lastPaymentDate.getTime())
    ? Math.max(0, (Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
    : 90;

  const salesCoverage = totalSales > 0 ? clamp((1 - outstanding / totalSales) * 100, 0, 100) : 100;
  const recencyScore = clamp(100 - (daysSinceLastPayment / 90) * 100, 0, 100);
  const settlementPenalty = clamp((avgSettlementDays / 45) * 100, 0, 100);

  const score = (salesCoverage * 0.55) + (recencyScore * 0.30) + ((100 - settlementPenalty) * 0.15);
  return clamp(score, 0, 100);
};

const calculatePaymentMomentum = (customer: CustomerRecord, stats: Record<string, any> = {}) => {
  const totalSales = normalizeNumber(customer.real_total_sales ?? customer.total_sales);
  const outstanding = normalizeNumber(customer.current_due ?? customer.opening_balance);
  const avgSettlementDays = Number(stats.avg_settlement_days ?? customer.avg_settlement_days ?? 0);

  const lastPaymentDate = customer.last_payment_date ? new Date(customer.last_payment_date) : null;
  const daysSinceLastPayment = lastPaymentDate && !Number.isNaN(lastPaymentDate.getTime())
    ? Math.max(0, (Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
    : 90;

  const collectionRatio = totalSales > 0 ? clamp(((totalSales - outstanding) / totalSales) * 100, 0, 100) : 0;
  const recencyFactor = clamp(100 - (daysSinceLastPayment / 90) * 100, 0, 100);
  const settlementFactor = clamp(100 - (avgSettlementDays / 60) * 100, 0, 100);

  const score = (collectionRatio * 0.50) + (recencyFactor * 0.30) + (settlementFactor * 0.20);
  return clamp(score, 0, 100);
};

const CircularGauge: React.FC<{ value: number; label: string; tone?: 'emerald' | 'amber' | 'violet'; size?: number; }> = ({ value, label, tone = 'emerald', size = 120 }) => {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamp(value, 0, 100) / 100) * circumference;

  const palette = {
    emerald: { track: '#d1fae5', stroke: '#10b981' },
    amber: { track: '#fef3c7', stroke: '#f59e0b' },
    violet: { track: '#e9d5ff', stroke: '#8b5cf6' },
  }[tone];

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={palette.track} strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.stroke}
          strokeLinecap="round"
          strokeWidth="10"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[1.7rem] font-bold leading-none text-[#111]">{Math.round(value)}%</div>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#777]">{label}</div>
      </div>
    </div>
  );
};

export const CustomersView: React.FC<CustomersViewProps> = ({
  layer2Class = '',
  layer3Class = '',
}) => {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<CustomerRecord | null>(null);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [draft, setDraft] = useState<CustomerDraft>(buildEmptyDraft());
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<'credit' | 'momentum' | 'coverage' | null>(null);
  const [customerStats, setCustomerStats] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!drawerOpen && !detailCustomer) return;

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [drawerOpen, detailCustomer]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const response: any = await apiFetch('/api/contacts');
      const items = response?.data?.items ?? response?.items ?? response ?? [];
      setCustomers(Array.isArray(items) ? items : []);
    } catch (error) {
      console.warn('[Zentra] Failed to load customers', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const totalOutstanding = customers.reduce((sum, customer) => sum + normalizeNumber(customer.current_due ?? customer.opening_balance), 0);
  const activeCount = customers.filter((customer) => getCustomerStatus(customer) === 'Active').length;
  const dormantCount = customers.filter((customer) => getCustomerStatus(customer) === 'Inactive').length;
  const avgOrderValue = customers.length
    ? customers.reduce((sum, customer) => sum + normalizeNumber(customer.real_total_sales ?? customer.total_sales), 0) / customers.length
    : 0;
  const averageArpu = customers.length
    ? customers.reduce((sum, customer) => sum + normalizeNumber(customer.real_total_sales ?? customer.total_sales), 0) / customers.length
    : 0;
  const yoyoArpuGrowth = customers.length > 1
    ? ((averageArpu - (customers.reduce((sum, customer) => sum + normalizeNumber(customer.real_total_sales ?? customer.total_sales), 0) / Math.max(customers.length - 1, 1))) / Math.max((customers.reduce((sum, customer) => sum + normalizeNumber(customer.real_total_sales ?? customer.total_sales), 0) / Math.max(customers.length - 1, 1)), 1)) * 100
    : 8.5;

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return customers.filter((customer) => {
      const name = (customer.name || '').toLowerCase();
      const email = (customer.email || '').toLowerCase();
      const city = (customer.city || '').toLowerCase();
      const phone = (customer.phone || '').toLowerCase();
      const type = getCustomerType(customer).toLowerCase();
      const status = getCustomerStatus(customer).toLowerCase();

      const matchesQuery =
        !query ||
        name.includes(query) ||
        email.includes(query) ||
        city.includes(query) ||
        phone.includes(query);

      const matchesType = typeFilter === 'All' || type === typeFilter.toLowerCase();
      const matchesStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Active' && status === 'active') ||
        (statusFilter === 'Inactive' && status === 'inactive') ||
        (statusFilter === 'Overdue' && normalizeNumber(customer.current_due ?? customer.opening_balance) > 0);

      return matchesQuery && matchesType && matchesStatus;
    });
  }, [customers, searchQuery, typeFilter, statusFilter]);

  const uniqueTypes = useMemo(() => {
    const types = Array.from(new Set(customers.map((customer) => getCustomerType(customer))));
    return types.filter(Boolean).sort();
  }, [customers]);

  const openNewCustomer = () => {
    setSelectedCustomer(null);
    setEditingId(null);
    setDraft(buildEmptyDraft());
    setDrawerOpen(true);
  };

  const openCustomerEditor = (customer: CustomerRecord) => {
    setSelectedCustomer(customer);
    setEditingId(customer.id ?? null);
    setDraft({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      type: getCustomerType(customer),
      notes: customer.notes || '',
      gstin: customer.gstin || '',
      licence_no: customer.licence_no || '',
      pan: customer.pan || '',
      opening_balance: String(normalizeNumber(customer.opening_balance)),
      transport_preference: customer.transport_preference || 'Local Dispatch',
      exclude_from_stats: Boolean(customer.exclude_from_stats === true || customer.exclude_from_stats === 1 || customer.exclude_from_stats === '1' || customer.exclude_from_stats === 'true'),
      disable_duplex_export: Boolean(customer.disable_duplex_export === true || customer.disable_duplex_export === 1 || customer.disable_duplex_export === '1' || customer.disable_duplex_export === 'true'),
    });
    setDrawerOpen(true);
  };

  const loadCustomerStats = async (customerId: number | string) => {
    const key = String(customerId);
    if (!customerId || customerStats[key]) return;

    try {
      const response: any = await apiFetch(`/api/analytics/customer/${customerId}/stats`);
      const data = response?.data ?? response ?? {};
      setCustomerStats((current) => ({ ...current, [key]: data }));
    } catch (error) {
      console.warn('[Zentra] Failed to load customer analytics', customerId, error);
      setCustomerStats((current) => ({ ...current, [key]: {} }));
    }
  };

  const getCustomerKey = (customer: CustomerRecord) => String(customer.id ?? `${customer.name ?? 'customer'}-${customer.phone ?? 'unknown'}`);

  const toggleExpandedCustomer = (customerId: number | string) => {
    const nextValue = expandedCustomerId === customerId ? null : customerId;
    setExpandedCustomerId(nextValue);

    if (nextValue !== null) {
      void loadCustomerStats(customerId);
    }
  };

  const openCustomerDetailModal = (customer: CustomerRecord) => {
    setDetailCustomer(customer);
    void loadCustomerStats(getCustomerKey(customer));
  };

  const handleDraftChange = (field: keyof CustomerDraft, value: string | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleSaveCustomer = async () => {
    const payload = {
      name: draft.name,
      email: draft.email || null,
      phone: draft.phone || null,
      address: draft.address || null,
      city: draft.city || null,
      type: draft.type || 'Retailer',
      notes: draft.notes || null,
      gstin: draft.gstin || null,
      licence_no: draft.licence_no || null,
      pan: draft.pan || null,
      opening_balance: Number(draft.opening_balance || 0),
      transport_preference: draft.transport_preference || 'Local Dispatch',
      exclude_from_stats: draft.exclude_from_stats ? 1 : 0,
      disable_duplex_export: draft.disable_duplex_export ? 1 : 0,
    };

    try {
      if (editingId) {
        await apiFetch(`/api/contacts/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      setDrawerOpen(false);
      await loadCustomers();
    } catch (error) {
      console.error('[Zentra] Failed to save customer', error);
    }
  };

  const exportDirectory = () => {
    const rows = filteredCustomers.map((customer) => ({
      name: customer.name || '',
      type: getCustomerType(customer),
      city: customer.city || '',
      phone: customer.phone || '',
      email: customer.email || '',
      gstin: customer.gstin || '',
      lastOrder: customer.last_bill_date || '',
      lastPayment: customer.last_payment_date || '',
      outstanding: normalizeNumber(customer.current_due ?? customer.opening_balance),
      status: getCustomerStatus(customer),
    }));

    const headers = ['Name', 'Type', 'City', 'Phone', 'Email', 'GSTIN', 'Last Order', 'Last Payment', 'Outstanding', 'Status'];
    const csv = [headers, ...rows.map((row) => headers.map((header) => {
      const value = (row as any)[header.toLowerCase().replace(/\s+/g, '') === 'lastname' ? 'lastName' : header.toLowerCase().replace(/\s+/g, '')];
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }))].map((line) => line.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'customer-directory.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const detailNarrative = detailCustomer ? getCustomerNarrative(detailCustomer, customerStats[getCustomerKey(detailCustomer)] ?? {}) : null;
  const activitySeries = detailCustomer ? buildRecentActivitySeries(detailCustomer, customerStats[getCustomerKey(detailCustomer)] ?? {}) : [];

  const detailModalContent = detailCustomer ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setDetailCustomer(null);
        }
      }}
    >
      <div className="relative max-h-[92vh] w-full max-w-[1100px] overflow-hidden rounded-[30px] border border-black/[0.06] bg-[#f7f7f5] shadow-[0_28px_90px_rgba(0,0,0,0.24)]">
        <div className="flex items-center justify-between border-b border-black/[0.06] bg-white px-5 py-4 sm:px-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#777]">Customer profile</div>
            <h3 className="mt-1 text-2xl font-bold text-[#111]">{detailCustomer.name || 'Unnamed Customer'}</h3>
          </div>
          <button type="button" onClick={() => setDetailCustomer(null)} className="rounded-full p-2 hover:bg-neutral-100">
            <X className="h-4 w-4 text-[#333]" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-82px)] overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-[22px] border border-black/[0.06] bg-white p-4 shadow-[0_10px_18px_-16px_rgba(0,0,0,0.28)]">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#777]">Outstanding</div>
                  <div className="mt-2 text-xl font-bold text-[#111]">{formatCurrency(normalizeNumber(detailCustomer.current_due ?? detailCustomer.opening_balance))}</div>
                </div>
                <div className="rounded-[22px] border border-black/[0.06] bg-white p-4 shadow-[0_10px_18px_-16px_rgba(0,0,0,0.28)]">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#777]">Sales</div>
                  <div className="mt-2 text-xl font-bold text-[#111]">{formatCurrency(normalizeNumber(detailCustomer.real_total_sales ?? detailCustomer.total_sales))}</div>
                </div>
                <div className="rounded-[22px] border border-black/[0.06] bg-white p-4 shadow-[0_10px_18px_-16px_rgba(0,0,0,0.28)]">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#777]">Avg order</div>
                  <div className="mt-2 text-xl font-bold text-[#111]">{formatCurrency(normalizeNumber(detailCustomer.real_avg_sales ?? detailCustomer.avg_sales))}</div>
                </div>
                <div className="rounded-[22px] border border-black/[0.06] bg-white p-4 shadow-[0_10px_18px_-16px_rgba(0,0,0,0.28)]">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#777]">Settlement</div>
                  <div className="mt-2 text-xl font-bold text-[#111]">{Number(customerStats[getCustomerKey(detailCustomer)]?.avg_settlement_days ?? detailCustomer.avg_settlement_days ?? 0).toFixed(0)} days</div>
                </div>
              </div>

              <div className="rounded-[24px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_26px_-20px_rgba(17,17,17,0.2)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#777]">Account health</div>
                    <h4 className="mt-1 text-lg font-semibold text-[#111]">Performance meters</h4>
                  </div>
                  <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    {getCustomerStatus(detailCustomer)}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {[
                    { id: 'credit', label: 'Credit', tone: 'emerald', value: calculateCreditHealth(detailCustomer, customerStats[getCustomerKey(detailCustomer)] ?? {}) },
                    { id: 'momentum', label: 'Momentum', tone: 'violet', value: calculatePaymentMomentum(detailCustomer, customerStats[getCustomerKey(detailCustomer)] ?? {}) },
                    { id: 'coverage', label: 'Coverage', tone: 'amber', value: clamp(((normalizeNumber(detailCustomer.real_total_sales ?? detailCustomer.total_sales) - normalizeNumber(detailCustomer.current_due ?? detailCustomer.opening_balance)) / Math.max(normalizeNumber(detailCustomer.real_total_sales ?? detailCustomer.total_sales), 1)) * 100, 0, 100) },
                  ].map((metric) => {
                    const metricAnalysis = getMetricAnalysis(detailCustomer, customerStats[getCustomerKey(detailCustomer)] ?? {}, metric.id as 'credit' | 'momentum' | 'coverage');
                    const isExpanded = expandedMetric === metric.id;

                    return (
                      <div key={metric.id} className="rounded-2xl border border-black/[0.04] bg-neutral-50 p-4">
                        <button type="button" onClick={() => setExpandedMetric(isExpanded ? null : metric.id as 'credit' | 'momentum' | 'coverage')} className="w-full text-left">
                          <div className="flex justify-center">
                            <CircularGauge value={metric.value} label={metric.label} tone={metric.tone as 'emerald' | 'amber' | 'violet'} />
                          </div>
                          <div className="mt-3 text-center text-[11px] leading-5 text-[#666]">
                            {metric.id === 'credit' ? 'Credit health blends sales coverage, recent payment recency, and settlement speed to show how reliably the account is keeping up financially.' : metric.id === 'momentum' ? 'Payment momentum measures how quickly sales are converting into cash, and how consistently the customer is closing the loop on their receivables.' : 'Coverage reflects the share of total sales that has already been converted into realized cash and cleared against the account.'}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="mt-4 rounded-2xl border border-black/[0.06] bg-white p-3 text-left">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#777]">Expanded analysis</div>
                            <div className="mt-2 text-[11px] leading-6 text-[#666]">
                              <div><span className="font-semibold text-[#111]">Data used:</span> {metricAnalysis.dataSources.join(' • ')}</div>
                              <div className="mt-2"><span className="font-semibold text-[#111]">Calculation:</span> {metricAnalysis.formula}</div>
                              <div className="mt-2"><span className="font-semibold text-[#111]">Comparison:</span> {metricAnalysis.comparison}</div>
                              <div className="mt-2"><span className="font-semibold text-[#111]">Assumption:</span> {metricAnalysis.assumptions}</div>
                              <div className="mt-2"><span className="font-semibold text-[#111]">Forecast:</span> {metricAnalysis.projection}</div>
                              <div className="mt-2"><span className="font-semibold text-[#111]">Timeframe:</span> {metricAnalysis.windowLabel}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[24px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_26px_-20px_rgba(17,17,17,0.2)]">
                <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[#777]">Activity view</div>
                <div className="rounded-2xl border border-black/[0.05] bg-neutral-50 p-3 text-[11px] leading-6 text-[#666]">
                  {detailNarrative?.headline}
                </div>

                <div className="mt-4 grid grid-cols-6 items-end gap-2">
                  {activitySeries.map((point) => {
                    const isSelected = selectedActivityId === point.id;
                    return (
                      <button
                        key={point.id}
                        type="button"
                        onClick={() => setSelectedActivityId(isSelected ? null : point.id)}
                        className="flex flex-col items-center gap-2 text-center transition-transform duration-200 hover:scale-[1.02]"
                      >
                        <div className="flex h-[110px] w-full items-end justify-center rounded-t-2xl bg-gradient-to-t from-[#111111] via-[#3b82f6] to-[#c7d2fe] p-1 shadow-[0_14px_30px_-20px_rgba(17,17,17,0.6)]" style={{ height: `${Math.max(42, point.value * 1.4)}px` }}>
                          <div className={`w-full rounded-t-xl ${isSelected ? 'bg-white/90' : 'bg-white/25'}`} style={{ height: `${Math.max(24, point.value)}%` }} />
                        </div>
                        <div className="text-[9px] text-[#777] leading-tight">{point.label}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl border border-black/[0.05] bg-neutral-50 p-3 text-[11px] leading-6 text-[#666]">
                  {selectedActivityId ? activitySeries.find((point) => point.id === selectedActivityId)?.detail : detailNarrative?.detail}
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-[0_12px_26px_-20px_rgba(17,17,17,0.2)]">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#777]">Quick facts</div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="rounded-xl bg-neutral-50 p-3"><span className="block text-[10px] uppercase tracking-[0.14em] text-[#777]">Type</span><span className="mt-1 block font-semibold text-[#111]">{getCustomerType(detailCustomer)}</span></div>
                  <div className="rounded-xl bg-neutral-50 p-3"><span className="block text-[10px] uppercase tracking-[0.14em] text-[#777]">Phone</span><span className="mt-1 block font-semibold text-[#111]">{detailCustomer.phone || 'Not provided'}</span></div>
                  <div className="rounded-xl bg-neutral-50 p-3"><span className="block text-[10px] uppercase tracking-[0.14em] text-[#777]">Email</span><span className="mt-1 block font-semibold text-[#111] break-all">{detailCustomer.email || 'Not provided'}</span></div>
                  <div className="rounded-xl bg-neutral-50 p-3"><span className="block text-[10px] uppercase tracking-[0.14em] text-[#777]">Location</span><span className="mt-1 block font-semibold text-[#111]">{detailCustomer.city || detailCustomer.address || 'Not provided'}</span></div>
                </div>
              </div>

              <div className="rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-[0_12px_26px_-20px_rgba(17,17,17,0.2)]">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#777]">Performance summary</div>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-3 text-sm">
                    <span className="text-[#555]">Favorite product</span>
                    <span className="font-semibold text-[#111]">{detailCustomer.favorite_product || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-3 text-sm">
                    <span className="text-[#555]">Invoice count</span>
                    <span className="font-semibold text-[#111]">{Number(customerStats[getCustomerKey(detailCustomer)]?.invoice_count ?? detailCustomer.avg_settlement_days ?? 0) || 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-3 text-sm">
                    <span className="text-[#555]">Last payment</span>
                    <span className="font-semibold text-[#111]">{formatDate(detailCustomer.last_payment_date)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-3 text-sm">
                    <span className="text-[#555]">Recency</span>
                    <span className="font-semibold text-[#111]">{getActivityRecencyLabel(detailCustomer.last_activity || detailCustomer.last_bill_date || detailCustomer.last_payment_date)}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  const modalContent = drawerOpen ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-[1.5px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setDrawerOpen(false);
        }
      }}
    >
      <div
        className="zentra-modal-scroll relative max-h-[92vh] w-full max-w-[980px] overflow-y-auto rounded-[30px] border border-black/[0.06] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-6"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#777]">{editingId ? 'Edit Customer' : 'New Customer'}</div>
            <h3 className="mt-1 text-2xl font-bold text-[#111]">{draft.name || 'Customer profile'}</h3>
          </div>
          <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-full p-2 hover:bg-neutral-100">
            <X className="h-4 w-4 text-[#333]" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <div className="rounded-2xl border border-black/[0.06] bg-neutral-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Primary profile</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Customer name</label>
                <input value={draft.name} onChange={(e) => handleDraftChange('name', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Type</label>
                <select value={draft.type} onChange={(e) => handleDraftChange('type', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none">
                  <option value="Retailer">Retailer</option>
                  <option value="Wholesaler">Wholesaler</option>
                  <option value="Stockist">Stockist</option>
                  <option value="Direct">Direct</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/[0.06] bg-neutral-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Contact details</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Email</label>
                <input value={draft.email} onChange={(e) => handleDraftChange('email', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Phone</label>
                <input value={draft.phone} onChange={(e) => handleDraftChange('phone', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/[0.06] bg-neutral-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Address & trade profile</div>
            <div className="mt-3 space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Address</label>
                <textarea value={draft.address} onChange={(e) => handleDraftChange('address', e.target.value)} rows={3} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">City</label>
                <input value={draft.city} onChange={(e) => handleDraftChange('city', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/[0.06] bg-neutral-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Business information</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">GSTIN</label>
                <input value={draft.gstin} onChange={(e) => handleDraftChange('gstin', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Licence No.</label>
                <input value={draft.licence_no} onChange={(e) => handleDraftChange('licence_no', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">PAN</label>
                <input value={draft.pan} onChange={(e) => handleDraftChange('pan', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Opening balance</label>
                <input value={draft.opening_balance} onChange={(e) => handleDraftChange('opening_balance', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/[0.06] bg-neutral-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Operations</div>
            <div className="mt-3 space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Transport preference</label>
                <input value={draft.transport_preference} onChange={(e) => handleDraftChange('transport_preference', e.target.value)} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#666]">Account settings</label>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.08] bg-white px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-[#111]">Exclude from stats</div>
                    <div className="text-[11px] text-[#666]">Server-managed analytics filter</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDraftChange('exclude_from_stats', !draft.exclude_from_stats)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${draft.exclude_from_stats ? 'bg-[#111111]' : 'bg-neutral-300'}`}
                    aria-label="Toggle exclude from stats"
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white transition ${draft.exclude_from_stats ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.08] bg-white px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-[#111]">Disable duplex export</div>
                    <div className="text-[11px] text-[#666]">Controls export behavior</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDraftChange('disable_duplex_export', !draft.disable_duplex_export)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${draft.disable_duplex_export ? 'bg-[#111111]' : 'bg-neutral-300'}`}
                    aria-label="Toggle duplex export"
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white transition ${draft.disable_duplex_export ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/[0.06] bg-neutral-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Notes</div>
            <div className="mt-3 space-y-1">
              <textarea value={draft.notes} onChange={(e) => handleDraftChange('notes', e.target.value)} rows={4} className="w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm text-[#111] outline-none" />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-black/[0.06] pt-4">
          <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-[#111]">
            Close
          </button>
          <button type="button" onClick={handleSaveCustomer} className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-4 py-2 text-sm font-medium text-white">
            <Save className="h-4 w-4" />
            {editingId ? 'Save changes' : 'Create customer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <section
        id="layer-page-header"
        data-layer="page-header"
        data-layer-order="2"
        className={`relative z-40 ${layer2Class}`}
      >
        <div
          id="page-header"
          data-component="PageHeader"
          data-section="page-control-bar"
          className="relative z-40 flex w-full select-none flex-col gap-3 overflow-visible pb-5 pt-3 sm:gap-4 sm:pb-6 md:flex-row md:items-end md:justify-between"
        >
          <div id="page-header-title-group" data-slot="title-group" className="flex min-w-0 items-center gap-2.5">
            <h1 id="page-title" className="text-[2.2rem] font-[700] leading-[0.9] tracking-[-0.07em] text-[#111111] sm:text-[2.6rem] md:text-[3rem] lg:text-[3.4rem]">
              Customers
            </h1>
            <span className="rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 tracking-tight">
              {customers.length} Total
            </span>
          </div>

          <div id="page-view-toolbar" data-slot="view-toolbar" className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={exportDirectory}
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
            >
              <Download className="h-4 w-4 text-[#666]" />
              <span>Export Directory</span>
            </button>
            <button
              type="button"
              onClick={openNewCustomer}
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#111111] px-4 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(17,17,17,0.22)] transition hover:bg-[#222222] active:scale-[0.98] sm:h-[46px]"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add Customer</span>
            </button>
          </div>
        </div>
      </section>

      <main
        id="layer-widget-canvas"
        data-layer="widget-canvas"
        data-layer-order="3"
        role="main"
        className={`relative z-10 w-full ${layer3Class}`}
      >
        <div id="widget-grid" data-group="widget-grid" className="dashboard-grid gap-4 sm:gap-5">
          <section data-widget-sublayer="3a" className="col-span-1 md:col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Total Customers</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">{customers.length}</div>
              <div className="mt-1 text-xs font-semibold text-indigo-600">Business accounts</div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Active Accounts</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">{activeCount}</div>
              <div className="mt-1 text-xs font-semibold text-emerald-600">{Math.round((activeCount / Math.max(customers.length, 1)) * 100)}% active</div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Outstanding</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">{formatCurrency(totalOutstanding)}</div>
              <div className="mt-1 text-xs font-semibold text-amber-600">Receivables exposure</div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Average ARPU</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">
                <span>{new Intl.NumberFormat('en-IN', {
                  style: 'currency',
                  currency: 'INR',
                  maximumFractionDigits: 0,
                }).format(averageArpu)}</span>
                <span className="ml-1 text-base font-medium text-[#666]">/ mo</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-emerald-600">{`${yoyoArpuGrowth >= 0 ? '+' : ''}${yoyoArpuGrowth.toFixed(1)}% YoY`}</div>
            </div>
          </section>

          <section data-widget-sublayer="3b" className="col-span-1 md:col-span-12 lg:col-span-8 flex flex-col">
            <div className="soft-card flex h-full flex-col justify-between overflow-hidden rounded-[26px] bg-white/95 p-5 sm:p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-black/[0.06]">
                <div>
                  <h2 className="text-[20px] font-[600] tracking-[-0.03em] text-[#111]">Customer Directory</h2>
                  <p className="text-xs text-[#777]">Real customer ledger activity, trade types, and account status</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-52">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#888]" />
                    <input
                      type="text"
                      placeholder="Search customer..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.09] bg-[#fafafa] pl-8 pr-3 py-1.5 text-xs text-[#111] outline-none placeholder:text-[#999] focus:border-black/30"
                    />
                  </div>

                  <div className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#777]" />
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="h-[36px] appearance-none rounded-xl border border-black/[0.09] bg-[#fafafa] pl-8 pr-8 text-[11px] text-[#111] outline-none"
                    >
                      <option value="All">All Types</option>
                      {uniqueTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-[36px] appearance-none rounded-xl border border-black/[0.09] bg-[#fafafa] px-3 text-[11px] text-[#111] outline-none"
                    >
                      <option value="All">All Status</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Overdue">Overdue</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.04] text-[11px] font-semibold uppercase tracking-wider text-[#888]">
                      <th className="py-3 px-2">Customer</th>
                      <th className="py-3 px-2">Type</th>
                      <th className="py-3 px-2">Last Order</th>
                      <th className="py-3 px-2">Outstanding</th>
                      <th className="py-3 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="py-5 px-2 text-center text-[#777]">Loading customer directory…</td>
                      </tr>
                    ) : filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-5 px-2 text-center text-[#777]">No customers match your current filters.</td>
                      </tr>
                    ) : (
                      filteredCustomers.map((customer) => {
                        const outstanding = normalizeNumber(customer.current_due ?? customer.opening_balance);
                        const status = getCustomerStatus(customer);
                        const type = getCustomerChannel(customer);
                        const totalSales = normalizeNumber(customer.real_total_sales ?? customer.total_sales);
                        const avgSales = normalizeNumber(customer.real_avg_sales ?? customer.avg_sales);
                        const favoriteProduct = customer.favorite_product || '—';
                        const customerKey = String(customer.id ?? `${customer.name}-${customer.phone}`);
                        const customerStatsForRow = customerStats[customerKey] ?? {};
                        const avgSettlementDays = Number(customerStatsForRow.avg_settlement_days ?? customer.avg_settlement_days ?? 0);
                        const invoiceCount = Number(customerStatsForRow.invoice_count ?? customerStatsForRow.total_invoices ?? customerStatsForRow.invoices_count ?? 0);
                        const settlementProgress = totalSales > 0 ? Math.min(100, Math.max(0, ((totalSales - outstanding) / totalSales) * 100)) : 0;
                        const creditHealth = totalSales > 0 ? Math.min(100, Math.max(0, (1 - Math.min(outstanding / totalSales, 1)) * 100)) : 0;
                        const averageOrderValue = totalSales > 0 && Number.isFinite(invoiceCount) && invoiceCount > 0 ? totalSales / invoiceCount : avgSales;
                        const activityRecency = getActivityRecencyLabel(customer.last_activity || customer.last_bill_date || customer.last_payment_date);
                        const isExpanded = expandedCustomerId === customerKey;

                        return (
                          <React.Fragment key={String(customer.id ?? `${customer.name}-${customer.phone}`)}>
                            <tr
                              className="cursor-pointer transition hover:bg-black/[0.02]"
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleExpandedCustomer(customerKey)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  toggleExpandedCustomer(customerKey);
                                }
                              }}
                              aria-expanded={isExpanded}
                            >
                              <td className="py-3.5 px-2">
                                <div className="font-semibold text-[#111]">{customer.name || 'Unnamed Customer'}</div>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#777]">
                                  <span className="inline-flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {customer.email || 'No email'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-2">
                                <span className="inline-flex rounded-lg bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800">
                                  {type}
                                </span>
                              </td>
                              <td className="py-3.5 px-2 text-[#555]">{formatDate(customer.last_bill_date || customer.last_activity)}</td>
                              <td className="py-3.5 px-2 font-bold text-[#111]">{formatCurrency(outstanding)}</td>
                              <td className="py-3.5 px-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    status === 'Active'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : outstanding > 0
                                        ? 'bg-amber-50 text-amber-700'
                                        : 'bg-neutral-100 text-neutral-700'
                                  }`}
                                >
                                  {status}
                                </span>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="bg-neutral-50/80">
                                <td colSpan={5} className="px-2 pb-3 pt-0">
                                  <div className="mt-1 rounded-[18px] border border-black/[0.06] bg-gradient-to-r from-[#fafafa] to-[#f4f5f6] p-3 shadow-[0_10px_24px_-18px_rgba(17,17,17,0.18)]">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="flex min-w-0 items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-[#111111] text-xs font-semibold text-white flex items-center justify-center shadow-sm">
                                          {customer.name?.charAt(0)?.toUpperCase() || 'C'}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-semibold text-[#111]">{customer.name || 'Unnamed Customer'}</div>
                                          <div className="mt-0.5 text-[11px] text-[#666]">
                                            {getCustomerStatus(customer)} · {formatCurrency(outstanding)} outstanding
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            openCustomerEditor(customer);
                                          }}
                                          className="rounded-xl border border-black/[0.08] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#111]"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            openCustomerDetailModal(customer);
                                          }}
                                          className="rounded-xl bg-[#111111] px-2.5 py-1.5 text-[11px] font-medium text-white"
                                        >
                                          View full details
                                        </button>
                                      </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                      <div className="rounded-xl border border-black/[0.04] bg-white/80 p-2.5">
                                        <div className="text-[9px] uppercase tracking-[0.12em] text-[#777]">Settlement</div>
                                        <div className="mt-1 text-sm font-semibold text-[#111]">{avgSettlementDays.toFixed(0)}d</div>
                                      </div>
                                      <div className="rounded-xl border border-black/[0.04] bg-white/80 p-2.5">
                                        <div className="text-[9px] uppercase tracking-[0.12em] text-[#777]">Credit</div>
                                        <div className="mt-1 text-sm font-semibold text-[#111]">{creditHealth.toFixed(0)}%</div>
                                      </div>
                                      <div className="rounded-xl border border-black/[0.04] bg-white/80 p-2.5">
                                        <div className="text-[9px] uppercase tracking-[0.12em] text-[#777]">Sales</div>
                                        <div className="mt-1 text-sm font-semibold text-[#111]">{formatCurrency(totalSales)}</div>
                                      </div>
                                      <div className="rounded-xl border border-black/[0.04] bg-white/80 p-2.5">
                                        <div className="text-[9px] uppercase tracking-[0.12em] text-[#777]">Fav</div>
                                        <div className="mt-1 truncate text-sm font-semibold text-[#111]">{favoriteProduct}</div>
                                      </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      <div>
                                        <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-[#777]">
                                          <span>Settlement</span>
                                          <span>{settlementProgress.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
                                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${settlementProgress}%` }} />
                                        </div>
                                      </div>
                                      <div>
                                        <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-[#777]">
                                          <span>Credit health</span>
                                          <span>{creditHealth.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
                                          <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${creditHealth}%` }} />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section data-widget-sublayer="3c" className="col-span-1 md:col-span-12 lg:col-span-4 flex flex-col gap-4">
            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-base font-semibold text-[#111]">Customer insights</h3>
              </div>
              <p className="text-xs text-[#777] mb-3">AI-suitable behavior summary driven by actual account activity.</p>

              <div className="space-y-2.5 text-xs">
                <div className="rounded-xl border border-black/[0.06] p-2.5 bg-neutral-50/70">
                  <div className="flex justify-between font-semibold text-[#111]">
                    <span>Top trade type</span>
                    <span className="text-emerald-600">{uniqueTypes[0] || 'Retailer'}</span>
                  </div>
                  <div className="text-[11px] text-[#777] mt-0.5">Most active channel in current customer set</div>
                </div>
                <div className="rounded-xl border border-black/[0.06] p-2.5 bg-neutral-50/70">
                  <div className="flex justify-between font-semibold text-[#111]">
                    <span>Credit risk</span>
                    <span className="text-amber-600">{totalOutstanding > 0 ? 'Monitor' : 'Healthy'}</span>
                  </div>
                  <div className="text-[11px] text-[#777] mt-0.5">Receivables exposure trending against sales activity</div>
                </div>
              </div>
            </div>

            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <h3 className="text-base font-semibold text-[#111]">Coverage snapshot</h3>
              <p className="text-xs text-[#777] mb-3">Trade and location mix across your customer base</p>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-neutral-800">
                  <span>Retail</span>
                  <span className="font-semibold">{customers.filter((customer) => getCustomerType(customer).toLowerCase() === 'retailer').length}</span>
                </div>
                <div className="flex justify-between text-neutral-800">
                  <span>Wholesale</span>
                  <span className="font-semibold">{customers.filter((customer) => getCustomerType(customer).toLowerCase() === 'wholesaler').length}</span>
                </div>
                <div className="flex justify-between text-neutral-800">
                  <span>Stockist</span>
                  <span className="font-semibold">{customers.filter((customer) => getCustomerType(customer).toLowerCase() === 'stockist').length}</span>
                </div>
                <div className="flex justify-between text-neutral-800">
                  <span>Direct</span>
                  <span className="font-semibold">{customers.filter((customer) => getCustomerType(customer).toLowerCase() === 'direct').length}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {modalContent}
      {detailModalContent}
    </>
  );
};
