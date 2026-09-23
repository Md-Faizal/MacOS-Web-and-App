import React, { useState } from 'react';
import { Users, Plus, Download, Mail, ArrowUpRight, ShieldCheck, Sparkles, Search } from 'lucide-react';

interface CustomersViewProps {
  layer2Class?: string;
  layer3Class?: string;
}

const CUSTOMERS = [
  { id: 'cus_101', name: 'Starlight Media Corp', contact: 'alex@starlight.io', plan: 'Enterprise Suite', ltv: '$48,200', mrr: '$4,200', status: 'Active', health: 'Excellent' },
  { id: 'cus_102', name: 'Vanguard Dynamics', contact: 'sarah@vanguard.com', plan: 'Scale Tier', ltv: '$28,400', mrr: '$2,400', status: 'Active', health: 'Healthy' },
  { id: 'cus_103', name: 'Hyperion Robotics', contact: 'dev@hyperion.ai', plan: 'Enterprise Suite', ltv: '$64,100', mrr: '$5,900', status: 'Active', health: 'Excellent' },
  { id: 'cus_104', name: 'Solaris Cloud Ops', contact: 'admin@solaris.co', plan: 'Growth Plan', ltv: '$12,400', mrr: '$990', status: 'Trialing', health: 'Review' },
  { id: 'cus_105', name: 'Quantum Leap Labs', contact: 'research@quantum.io', plan: 'Growth Plan', ltv: '$9,800', mrr: '$890', status: 'Active', health: 'Healthy' },
  { id: 'cus_106', name: 'Apex Design Systems', contact: 'billing@apexdesign.ch', plan: 'Scale Tier', ltv: '$31,500', mrr: '$2,800', status: 'Active', health: 'Excellent' },
];

export const CustomersView: React.FC<CustomersViewProps> = ({
  layer2Class = '',
  layer3Class = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = CUSTOMERS.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.contact.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              Customers
            </h1>
            <span className="rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 tracking-tight">
              12,840 Total
            </span>
          </div>

          <div id="page-view-toolbar" data-slot="view-toolbar" className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
            >
              <Download className="h-4 w-4 text-[#666]" />
              <span>Export Directory</span>
            </button>
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#111111] px-4 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(17,17,17,0.22)] transition hover:bg-[#222222] active:scale-[0.98] sm:h-[46px]"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add Customer</span>
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
          
          {/* Top Metrics Row */}
          <section className="col-span-1 md:col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Active Subscribers</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">12,840</div>
              <div className="mt-1 text-xs font-semibold text-emerald-600">+142 this week</div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Net Retention (NRR)</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">118.4%</div>
              <div className="mt-1 text-xs font-semibold text-emerald-600">Top decile SaaS</div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Average ARPU</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">$124 / mo</div>
              <div className="mt-1 text-xs font-semibold text-neutral-500">+8.5% YoY</div>
            </div>

            <div className="soft-card rounded-[22px] p-4 bg-white/95">
              <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">Active Free Trials</span>
              <div className="mt-2 text-2xl font-bold tracking-tight text-[#111]">412</div>
              <div className="mt-1 text-xs font-semibold text-blue-600">64% conversion target</div>
            </div>
          </section>

          {/* Customer Directory Table (8 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-8 flex flex-col">
            <div className="soft-card flex h-full flex-col justify-between overflow-hidden rounded-[26px] bg-white/95 p-5 sm:p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-black/[0.06]">
                <div>
                  <h2 className="text-[20px] font-[600] tracking-[-0.03em] text-[#111]">Customer Directory</h2>
                  <p className="text-xs text-[#777]">Unified profile and subscription lifecycle tracking</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#888]" />
                  <input 
                    type="text"
                    placeholder="Search accounts or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.09] bg-[#fafafa] pl-8 pr-3 py-1.5 text-xs text-[#111] outline-none placeholder:text-[#999] focus:border-black/30"
                  />
                </div>
              </div>

              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.04] text-[11px] font-semibold uppercase tracking-wider text-[#888]">
                      <th className="py-3 px-2">Organization</th>
                      <th className="py-3 px-2">Subscribed Plan</th>
                      <th className="py-3 px-2">Monthly MRR</th>
                      <th className="py-3 px-2">Account Health</th>
                      <th className="py-3 px-2 text-right">Lifetime Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {filtered.map((c) => (
                      <tr key={c.id} className="hover:bg-black/[0.02] transition">
                        <td className="py-3.5 px-2">
                          <div className="font-semibold text-[#111]">{c.name}</div>
                          <div className="text-[11px] text-[#777]">{c.contact}</div>
                        </td>
                        <td className="py-3.5 px-2">
                          <span className="inline-flex rounded-lg bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800">
                            {c.plan}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 font-bold text-[#111]">{c.mrr}</td>
                        <td className="py-3.5 px-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            c.health === 'Excellent' ? 'bg-emerald-50 text-emerald-700' :
                            c.health === 'Healthy' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {c.health}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-right font-semibold text-[#111]">{c.ltv}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Cohort Insights & Churn Radar (4 cols LG) */}
          <section className="col-span-1 md:col-span-12 lg:col-span-4 flex flex-col gap-4">
            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="text-base font-semibold text-[#111]">Expansion Opportunities</h3>
              </div>
              <p className="text-xs text-[#777] mb-3">Accounts exceeding 85% API quota limits</p>
              
              <div className="space-y-2.5 text-xs">
                <div className="rounded-xl border border-black/[0.06] p-2.5 bg-neutral-50/70">
                  <div className="flex justify-between font-semibold text-[#111]">
                    <span>Starlight Media</span>
                    <span className="text-emerald-600">+$1,800/mo</span>
                  </div>
                  <div className="text-[11px] text-[#777] mt-0.5">Ready for Enterprise Volume Tier upgrade</div>
                </div>
                <div className="rounded-xl border border-black/[0.06] p-2.5 bg-neutral-50/70">
                  <div className="flex justify-between font-semibold text-[#111]">
                    <span>Hyperion Robotics</span>
                    <span className="text-emerald-600">+$2,400/mo</span>
                  </div>
                  <div className="text-[11px] text-[#777] mt-0.5">Dedicated SLA add-on recommended</div>
                </div>
              </div>
            </div>

            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <h3 className="text-base font-semibold text-[#111]">Geographic Distribution</h3>
              <p className="text-xs text-[#777] mb-3">Customer locations by operating hub</p>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-neutral-800">
                  <span>North America (US / CA)</span>
                  <span className="font-semibold">58%</span>
                </div>
                <div className="flex justify-between text-neutral-800">
                  <span>European Union & UK</span>
                  <span className="font-semibold">28%</span>
                </div>
                <div className="flex justify-between text-neutral-800">
                  <span>Asia-Pacific (APAC)</span>
                  <span className="font-semibold">14%</span>
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>
    </>
  );
};
