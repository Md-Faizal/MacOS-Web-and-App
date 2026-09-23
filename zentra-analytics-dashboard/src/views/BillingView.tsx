import React from 'react';
import { Receipt, Plus, Download, AlertTriangle, CheckCircle, RefreshCcw, FileText } from 'lucide-react';

interface BillingViewProps {
  layer2Class?: string;
  layer3Class?: string;
}

const INVOICES = [
  { id: 'INV-2026-0891', customer: 'Acme Global Corp', date: 'Due Oct 05, 2026', amount: '$4,999.00', status: 'Paid', method: 'Auto-charged' },
  { id: 'INV-2026-0890', customer: 'Vanguard Dynamics', date: 'Due Oct 02, 2026', amount: '$2,400.00', status: 'Open', method: 'ACH Transfer' },
  { id: 'INV-2026-0889', customer: 'Hyperion Robotics', date: 'Due Sep 28, 2026', amount: '$5,900.00', status: 'Paid', method: 'Auto-charged' },
  { id: 'INV-2026-0888', customer: 'Solaris Cloud Ops', date: 'Due Sep 20, 2026', amount: '$990.00', status: 'Overdue', method: 'Retry in 24h' },
  { id: 'INV-2026-0887', customer: 'Apex Design Systems', date: 'Due Sep 18, 2026', amount: '$2,800.00', status: 'Paid', method: 'Auto-charged' },
];

export const BillingView: React.FC<BillingViewProps> = ({
  layer2Class = '',
  layer3Class = '',
}) => {
  return (
    <>
      {/* ═════════════════════════════════════════════════════════════════════════
          LAYER 2: PAGE HEADER & VIEW TOOLBAR (Contextual Controls)
         ═════════════════════════════════════════════════════════════════════════ */}
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
              Billing
            </h1>
            <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 tracking-tight">
              Invoices & Recurring
            </span>
          </div>

          <div id="page-view-toolbar" data-slot="view-toolbar" className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
            >
              <RefreshCcw className="h-4 w-4 text-[#666]" />
              <span>Retry Queue</span>
            </button>
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#111111] px-4 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(17,17,17,0.22)] transition hover:bg-[#222222] active:scale-[0.98] sm:h-[46px]"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Create Invoice</span>
            </button>
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════════════════
          LAYER 3: WIDGET CANVAS & METRICS GRID (Analytical Content Area)
         ═════════════════════════════════════════════════════════════════════════ */}
      <main 
        id="layer-widget-canvas"
        data-layer="widget-canvas"
        data-layer-order="3"
        role="main"
        className={`relative z-10 w-full ${layer3Class}`}
      >
        <div id="widget-grid" data-group="widget-grid" className="dashboard-grid gap-4 sm:gap-5">
          
          {/* Top Invoicing Summary */}
          <section className="col-span-1 md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="soft-card rounded-[22px] p-5 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Collected this Month</span>
              <div className="mt-2 text-3xl font-bold tracking-tight text-[#111]">$89,450.00</div>
              <div className="mt-1 text-xs font-semibold text-emerald-600">97.8% collection rate</div>
            </div>

            <div className="soft-card rounded-[22px] p-5 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Outstanding (Open)</span>
              <div className="mt-2 text-3xl font-bold tracking-tight text-[#111]">$14,200.00</div>
              <div className="mt-1 text-xs text-neutral-500">Net 30 terms, awaiting settlement</div>
            </div>

            <div className="soft-card rounded-[22px] p-5 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Overdue & Retrying</span>
              <div className="mt-2 text-3xl font-bold tracking-tight text-amber-600">$990.00</div>
              <div className="mt-1 text-xs font-semibold text-amber-700">1 account in automated dunning</div>
            </div>
          </section>

          {/* Invoices Ledger Table (8 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-8 flex flex-col">
            <div className="soft-card flex h-full flex-col justify-between overflow-hidden rounded-[26px] bg-white/95 p-5 sm:p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
                <div>
                  <h3 className="text-lg font-semibold text-[#111]">Invoice History</h3>
                  <p className="text-xs text-[#777]">Automated billing receipts and recurring invoices</p>
                </div>
                <button type="button" className="text-xs font-medium text-blue-600 hover:underline">
                  Download All PDF
                </button>
              </div>

              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.04] text-[11px] font-semibold uppercase tracking-wider text-[#888]">
                      <th className="py-3 px-2">Invoice #</th>
                      <th className="py-3 px-2">Customer</th>
                      <th className="py-3 px-2">Due Date</th>
                      <th className="py-3 px-2">Amount</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {INVOICES.map((inv) => (
                      <tr key={inv.id} className="hover:bg-black/[0.02] transition">
                        <td className="py-3.5 px-2 font-mono text-neutral-600">{inv.id}</td>
                        <td className="py-3.5 px-2 font-semibold text-[#111]">{inv.customer}</td>
                        <td className="py-3.5 px-2 text-neutral-600">{inv.date}</td>
                        <td className="py-3.5 px-2 font-bold text-[#111]">{inv.amount}</td>
                        <td className="py-3.5 px-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' :
                            inv.status === 'Open' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <button type="button" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                            <FileText className="h-3.5 w-3.5" /> PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Dunning & Recovery Sidecard (4 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-4 flex flex-col gap-4">
            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-[#111]">Smart Dunning Recovery</h3>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">91% Saved</span>
              </div>
              <p className="text-xs text-[#777] mb-3">
                Machine-learning retries schedule optimal card charge attempts based on issuing bank patterns.
              </p>
              <div className="rounded-xl bg-neutral-50 p-3 text-xs space-y-1.5 border border-black/[0.05]">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Recovered Revenue:</span>
                  <span className="font-semibold text-emerald-600">+$12,450 / mo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Involuntary Churn:</span>
                  <span className="font-semibold text-neutral-800">Reduced by 4.2%</span>
                </div>
              </div>
            </div>

            <div className="soft-card rounded-[26px] bg-[linear-gradient(135deg,#111111,#222222)] p-5 text-white shadow-[0_20px_42px_-26px_rgba(17,17,17,0.28)]">
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Next Auto-Billing Cycle</span>
              <div className="mt-2 text-2xl font-bold tracking-tight">October 1, 2026</div>
              <p className="mt-1 text-xs text-neutral-300">
                1,816 recurring subscription renewals will be dispatched concurrently.
              </p>
            </div>
          </section>

        </div>
      </main>
    </>
  );
};
