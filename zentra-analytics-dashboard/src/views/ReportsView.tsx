import React, { useState } from 'react';
import { FileBarChart2, Download, Calendar, ArrowUpRight, TrendingUp, CheckCircle2 } from 'lucide-react';

interface ReportsViewProps {
  layer2Class?: string;
  layer3Class?: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  layer2Class = '',
  layer3Class = '',
}) => {
  const [period, setPeriod] = useState('Full Year 2026 (YTD)');

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
              Reports
            </h1>
            <span className="rounded-full bg-neutral-100 border border-neutral-300 px-2.5 py-0.5 text-xs font-semibold text-neutral-800 tracking-tight">
              GAAP & Tax Ready
            </span>
          </div>

          <div id="page-view-toolbar" data-slot="view-toolbar" className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
            >
              <Calendar className="h-4 w-4 text-[#666]" />
              <span>{period}</span>
            </button>
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#111111] px-4 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(17,17,17,0.22)] transition hover:bg-[#222222] active:scale-[0.98] sm:h-[46px]"
            >
              <Download className="h-4 w-4 stroke-[2.5]" />
              <span>Export Statements</span>
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
          
          {/* Executive P&L Financial Summary (8 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-8 flex flex-col">
            <div className="soft-card flex h-full flex-col justify-between rounded-[28px] bg-white/95 p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
                  <div>
                    <h2 className="text-xl font-bold text-[#111]">Income & Profit Statement</h2>
                    <p className="text-xs text-[#777]">Accrual-based revenue recognition (ASC 606 compliant)</p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                    Verified Reconciliation
                  </span>
                </div>

                <div className="mt-5 space-y-3.5 text-xs">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#555] font-medium">Gross Processed Volume</span>
                    <span className="text-base font-bold text-[#111]">$1,248,590.00</span>
                  </div>
                  <div className="flex justify-between items-center py-1 text-red-600">
                    <span className="font-medium">Refunds & Reversals</span>
                    <span className="font-semibold">-$5,120.00</span>
                  </div>
                  <div className="flex justify-between items-center py-1 text-neutral-600">
                    <span className="font-medium">Network & Gateway Processing Fees (2.1%)</span>
                    <span className="font-semibold">-$26,220.00</span>
                  </div>
                  <div className="flex justify-between items-center py-1 text-neutral-600">
                    <span className="font-medium">Sales Tax & VAT Remittances</span>
                    <span className="font-semibold">-$64,800.00</span>
                  </div>
                  <div className="pt-3 border-t border-black/[0.08] flex justify-between items-center">
                    <span className="text-sm font-bold text-[#111]">Net Recognized Operating Profit</span>
                    <span className="text-2xl font-[800] text-emerald-600">$1,152,450.00</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-neutral-50 p-4 border border-black/[0.04] flex items-center justify-between text-xs">
                <span className="text-[#666]">Automated daily ledger sync with QuickBooks & Xero active</span>
                <span className="text-blue-600 font-medium cursor-pointer hover:underline">Configure Accounting Mappings</span>
              </div>
            </div>
          </section>

          {/* Quick Reports & Exports (4 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-4 flex flex-col gap-4">
            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <h3 className="text-base font-semibold text-[#111] mb-1">Standard Report Downloads</h3>
              <p className="text-xs text-[#777] mb-3">Pre-compiled tax and regulatory audit packages</p>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-black/[0.05] hover:bg-neutral-50 cursor-pointer transition">
                  <div>
                    <div className="font-semibold text-[#111]">1099-K Tax Compliance</div>
                    <div className="text-[11px] text-[#777]">US IRS Merchant Reporting</div>
                  </div>
                  <Download className="h-4 w-4 text-neutral-500" />
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl border border-black/[0.05] hover:bg-neutral-50 cursor-pointer transition">
                  <div>
                    <div className="font-semibold text-[#111]">Monthly Balance Reconciliation</div>
                    <div className="text-[11px] text-[#777]">Detailed settlement breakdown</div>
                  </div>
                  <Download className="h-4 w-4 text-neutral-500" />
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl border border-black/[0.05] hover:bg-neutral-50 cursor-pointer transition">
                  <div>
                    <div className="font-semibold text-[#111]">Dispute & Fraud Report</div>
                    <div className="text-[11px] text-[#777]">Chargeback monitor ratios</div>
                  </div>
                  <Download className="h-4 w-4 text-neutral-500" />
                </div>
              </div>
            </div>

            <div className="soft-card rounded-[26px] bg-[linear-gradient(135deg,#111111,#222222)] p-5 text-white shadow-[0_20px_42px_-26px_rgba(17,17,17,0.28)]">
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Audit Security</span>
              <div className="mt-2 text-xl font-bold tracking-tight">SOC 2 Type II Certified</div>
              <p className="mt-1 text-xs text-neutral-300">
                All ledger records and cryptographic signatures are immutably archived with 7-year retention compliance.
              </p>
            </div>
          </section>

        </div>
      </main>
    </>
  );
};
