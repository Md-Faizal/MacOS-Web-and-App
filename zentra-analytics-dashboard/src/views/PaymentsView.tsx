import React, { useState } from 'react';
import { 
  ArrowUpRight, Download, Plus, Filter, CheckCircle2, Clock, 
  AlertCircle, CreditCard, Smartphone, Building2, ChevronDown 
} from 'lucide-react';

interface PaymentsViewProps {
  layer2Class?: string;
  layer3Class?: string;
}

const TRANSACTIONS = [
  { id: 'pi_3Nx9aK2eZvKYlo', customer: 'Acme Global Corp', email: 'billing@acme.com', method: 'Visa •••• 4242', type: 'card', amount: '$4,250.00', status: 'succeeded', date: 'Just now' },
  { id: 'pi_3Nx8bL2eZvKYlp', customer: 'Sarah Jenkins', email: 'sarah.j@gmail.com', method: 'Apple Pay', type: 'wallet', amount: '$189.50', status: 'succeeded', date: '4 mins ago' },
  { id: 'pi_3Nx7cM2eZvKYlq', customer: 'Nordic Peak Labs', email: 'finance@nordicpeak.io', method: 'SEPA Direct Debit', type: 'bank', amount: '$12,400.00', status: 'processing', date: '18 mins ago' },
  { id: 'pi_3Nx6dN2eZvKYlr', customer: 'David Kim', email: 'dkim@apexmedia.co', method: 'Mastercard •••• 8821', type: 'card', amount: '$749.00', status: 'succeeded', date: '34 mins ago' },
  { id: 'pi_3Nx5eO2eZvKYls', customer: 'CloudScale Inc', email: 'ops@cloudscale.net', method: 'Amex •••• 1004', type: 'card', amount: '$8,190.00', status: 'refunded', date: '1 hour ago' },
  { id: 'pi_3Nx4fP2eZvKYlt', customer: 'Elena Rostova', email: 'elena@berlintech.de', method: 'Klarna', type: 'paylater', amount: '$320.00', status: 'succeeded', date: '2 hours ago' },
];

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  layer2Class = '',
  layer3Class = '',
}) => {
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchFilter, setSearchFilter] = useState('');

  const filteredTransactions = TRANSACTIONS.filter((tx) => {
    const matchStatus = filterStatus === 'All' || tx.status.toLowerCase() === filterStatus.toLowerCase();
    const matchSearch = tx.customer.toLowerCase().includes(searchFilter.toLowerCase()) || 
                        tx.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
                        tx.id.toLowerCase().includes(searchFilter.toLowerCase());
    return matchStatus && matchSearch;
  });

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
          {/* Title Group */}
          <div id="page-header-title-group" data-slot="title-group" className="flex min-w-0 items-center gap-2.5">
            <h1 id="page-title" className="text-[2.2rem] font-[700] leading-[0.9] tracking-[-0.07em] text-[#111111] sm:text-[2.6rem] md:text-[3rem] lg:text-[3.4rem]">
              Payments
            </h1>
            <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 tracking-tight">
              Live Gateway
            </span>
          </div>

          {/* View Toolbar */}
          <div id="page-view-toolbar" data-slot="view-toolbar" className="flex w-full max-w-full items-center gap-2 sm:gap-2.5 flex-wrap overflow-visible md:w-auto md:flex-nowrap md:justify-end">
            <div id="toolbar-controls-cluster" data-group="filter-controls" className="relative z-50 flex flex-wrap md:flex-nowrap items-center gap-2 sm:gap-2.5 text-[12px] md:text-[13px] overflow-visible">
              
              {/* Status Filter */}
              <div className="relative">
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="flex h-[42px] cursor-pointer items-center appearance-none rounded-[14px] border border-black/[0.09] bg-white px-3.5 pr-8 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
                >
                  <option value="All">All Transactions</option>
                  <option value="succeeded">Succeeded Only</option>
                  <option value="processing">Processing</option>
                  <option value="refunded">Refunded</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#777]" />
              </div>

              {/* Export Button */}
              <button
                type="button"
                className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
              >
                <Download className="h-4 w-4 text-[#666]" />
                <span>Export CSV</span>
              </button>

              {/* Primary Action Button */}
              <button
                type="button"
                className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#111111] px-4 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(17,17,17,0.22)] transition hover:bg-[#222222] active:scale-[0.98] sm:h-[46px]"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                <span>Create Payment</span>
              </button>
            </div>
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
          
          {/* Top KPI Cards (12 Cols) */}
          <section className="col-span-1 md:col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-[12px] font-semibold text-[#666] uppercase tracking-wider">Gross Volume</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">$148,920.00</div>
              <div className="mt-1 flex items-center text-xs font-semibold text-emerald-600">
                <span>+12.4% vs last period</span>
              </div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-[12px] font-semibold text-[#666] uppercase tracking-wider">Auth Success Rate</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">98.7%</div>
              <div className="mt-1 flex items-center text-xs font-semibold text-emerald-600">
                <span>+0.8% auto-recovered</span>
              </div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-[12px] font-semibold text-[#666] uppercase tracking-wider">Refund Rate</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">0.41%</div>
              <div className="mt-1 flex items-center text-xs font-semibold text-neutral-500">
                <span>Well below 1.0% threshold</span>
              </div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-[12px] font-semibold text-[#666] uppercase tracking-wider">Dispute Count</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">0 Active</div>
              <div className="mt-1 flex items-center text-xs font-semibold text-emerald-600">
                <span>100% dispute protection</span>
              </div>
            </div>
          </section>

          {/* Main Transactions Feed Table (8 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-8 flex flex-col">
            <div className="soft-card flex h-full flex-col justify-between overflow-hidden rounded-[26px] bg-white/95 p-5 sm:p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-black/[0.06]">
                <div>
                  <h2 className="text-[20px] font-[600] tracking-[-0.03em] text-[#111]">Recent Activity</h2>
                  <p className="text-xs text-[#777]">Real-time ledger of inbound payments</p>
                </div>
                <input 
                  type="text"
                  placeholder="Search customer, ID, or email..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="rounded-xl border border-black/[0.09] bg-[#fafafa] px-3 py-1.5 text-xs text-[#111] outline-none placeholder:text-[#999] focus:border-black/30 w-full sm:w-60"
                />
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.04] text-[11px] font-semibold uppercase tracking-wider text-[#888]">
                      <th className="py-3 px-2">Customer</th>
                      <th className="py-3 px-2">Method</th>
                      <th className="py-3 px-2">Amount</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-black/[0.02] transition-colors">
                        <td className="py-3.5 px-2">
                          <div className="font-semibold text-[#111]">{tx.customer}</div>
                          <div className="text-[11px] text-[#777]">{tx.email}</div>
                        </td>
                        <td className="py-3.5 px-2">
                          <div className="inline-flex items-center gap-1.5 text-[#333]">
                            {tx.type === 'wallet' ? <Smartphone className="h-3.5 w-3.5 text-neutral-500" /> :
                             tx.type === 'bank' ? <Building2 className="h-3.5 w-3.5 text-neutral-500" /> :
                             <CreditCard className="h-3.5 w-3.5 text-neutral-500" />}
                            <span>{tx.method}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-2 font-bold text-[#111]">{tx.amount}</td>
                        <td className="py-3.5 px-2">
                          {tx.status === 'succeeded' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Succeeded
                            </span>
                          )}
                          {tx.status === 'processing' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                              <Clock className="h-3 w-3 text-blue-600" /> Processing
                            </span>
                          )}
                          {tx.status === 'refunded' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              <AlertCircle className="h-3 w-3 text-amber-600" /> Refunded
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-2 text-right text-[#777]">{tx.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Payment Methods & Rails (4 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-4 flex flex-col gap-4">
            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <h3 className="text-base font-semibold text-[#111]">Payment Method Split</h3>
              <p className="text-xs text-[#777] mb-4">Volume breakdown across payment networks</p>
              
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between mb-1 font-medium text-[#222]">
                    <span>Credit & Debit Cards</span>
                    <span className="font-semibold">$98,420 (66%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: '66%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1 font-medium text-[#222]">
                    <span>Digital Wallets (Apple Pay, Google Pay)</span>
                    <span className="font-semibold">$35,740 (24%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: '24%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1 font-medium text-[#222]">
                    <span>Bank Transfers & SEPA</span>
                    <span className="font-semibold">$14,760 (10%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '10%' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="soft-card rounded-[26px] bg-[linear-gradient(135deg,#111111,#222222)] p-5 text-white shadow-[0_20px_42px_-26px_rgba(17,17,17,0.28)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Settlement Routing</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-xl font-bold tracking-tight">T+1 Fast Settlement</div>
              <p className="mt-1 text-xs text-neutral-300 leading-relaxed">
                Funds collected today are bundled and scheduled for automatic ACH deposit tomorrow morning at 09:00 EST.
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                <span className="text-neutral-400">Next Payout Batch:</span>
                <span className="font-semibold text-white">$42,850.00</span>
              </div>
            </div>
          </section>

        </div>
      </main>
    </>
  );
};
