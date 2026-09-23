import React from 'react';
import { Landmark, ArrowUpRight, ArrowDownLeft, Clock, ShieldCheck, DollarSign, Wallet } from 'lucide-react';

interface BalancesViewProps {
  layer2Class?: string;
  layer3Class?: string;
}

const PAYOUT_HISTORY = [
  { id: 'po_1Nk8482eZvKYl', destination: 'Chase Business Checking •••• 4891', amount: '$38,290.00', status: 'Deposited', date: 'Yesterday, 09:15 AM' },
  { id: 'po_1Nk7372eZvKYm', destination: 'Chase Business Checking •••• 4891', amount: '$41,500.50', status: 'Deposited', date: 'Sep 21, 2026' },
  { id: 'po_1Nk6262eZvKYn', destination: 'Silicon Valley Bank (SVB) •••• 9012', amount: '$15,000.00', status: 'Deposited', date: 'Sep 20, 2026' },
  { id: 'po_1Nk5152eZvKYo', destination: 'Chase Business Checking •••• 4891', amount: '$29,480.00', status: 'Deposited', date: 'Sep 19, 2026' },
];

export const BalancesView: React.FC<BalancesViewProps> = ({
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
              Balances
            </h1>
            <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 text-xs font-semibold text-blue-700 tracking-tight">
              Auto-Payout Daily
            </span>
          </div>

          <div id="page-view-toolbar" data-slot="view-toolbar" className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
            >
              <Landmark className="h-4 w-4 text-[#666]" />
              <span>Linked Accounts</span>
            </button>
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#111111] px-4 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(17,17,17,0.22)] transition hover:bg-[#222222] active:scale-[0.98] sm:h-[46px]"
            >
              <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
              <span>Payout to Bank</span>
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
          
          {/* Slot 1: Available Balance Hero (7 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-7 flex flex-col">
            <div className="soft-card flex h-full flex-col justify-between rounded-[28px] bg-white/95 p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#666]">Available for payout</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> FDIC Insured
                  </span>
                </div>
                <div className="mt-3 text-4xl sm:text-5xl font-[750] tracking-[-0.05em] text-[#111]">
                  $42,850.00
                </div>
                <p className="mt-1 text-xs text-[#777]">Next scheduled payout arrives tomorrow at 09:00 AM EST</p>
              </div>

              <div className="mt-6 rounded-2xl bg-neutral-50 border border-black/[0.05] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-black/[0.08] shadow-sm">
                    <Landmark className="h-5 w-5 text-[#222]" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#111]">Chase Business Checking (••• 4891)</div>
                    <div className="text-[11px] text-[#777]">Routing: 021000021 • Primary Deposit Account</div>
                  </div>
                </div>
                <span className="text-xs font-medium text-blue-600 cursor-pointer hover:underline">Manage Settings</span>
              </div>
            </div>
          </section>

          {/* Slot 2: Pending & Reserves (5 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-5 flex flex-col gap-4">
            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#666]">Pending Settlements</span>
              <div className="mt-2 text-3xl font-bold tracking-tight text-[#111]">$8,920.40</div>
              <p className="mt-1 text-xs text-[#777]">Processing from card payments (clears in 24h)</p>
            </div>

            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#666]">Multi-Currency Treasury</span>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-black/[0.04]">
                  <span className="font-medium text-[#222]">Euro (EUR €)</span>
                  <span className="font-semibold text-[#111]">€34,200.00</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-black/[0.04]">
                  <span className="font-medium text-[#222]">British Pound (GBP £)</span>
                  <span className="font-semibold text-[#111]">£18,500.00</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-[#222]">Japanese Yen (JPY ¥)</span>
                  <span className="font-semibold text-[#111]">¥2,400,000</span>
                </div>
              </div>
            </div>
          </section>

          {/* Slot 3: Payout History (12 cols) */}
          <section className="col-span-1 md:col-span-12 flex flex-col">
            <div className="soft-card rounded-[28px] bg-white/95 p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
                <h3 className="text-lg font-semibold text-[#111]">Recent Payout Transfers</h3>
                <span className="text-xs text-[#777]">All transfers completed without exceptions</span>
              </div>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.04] text-[11px] font-semibold uppercase tracking-wider text-[#888]">
                      <th className="py-3 px-2">Payout ID</th>
                      <th className="py-3 px-2">Destination Account</th>
                      <th className="py-3 px-2">Amount</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Transfer Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {PAYOUT_HISTORY.map((payout) => (
                      <tr key={payout.id} className="hover:bg-black/[0.02] transition">
                        <td className="py-3.5 px-2 font-mono text-neutral-600">{payout.id}</td>
                        <td className="py-3.5 px-2 font-medium text-[#111]">{payout.destination}</td>
                        <td className="py-3.5 px-2 font-bold text-[#111]">{payout.amount}</td>
                        <td className="py-3.5 px-2">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            {payout.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-right text-[#777]">{payout.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

        </div>
      </main>
    </>
  );
};
