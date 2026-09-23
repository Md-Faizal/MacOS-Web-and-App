import React from 'react';
import { Package, Plus, Tag, Check, ArrowUpRight, Zap, Layers, BarChart3 } from 'lucide-react';

interface ProductsViewProps {
  layer2Class?: string;
  layer3Class?: string;
}

const PRODUCTS = [
  {
    name: 'Enterprise Suite',
    price: '$4,999',
    cadence: '/ month',
    subscribers: '84 active contracts',
    mrr: '$419,916 MRR',
    features: ['Dedicated infrastructure', 'Custom SLA (99.99%)', '24/7 dedicated account manager', 'Unlimited API throughput'],
    badge: 'Flagship Tier',
    highlight: true,
  },
  {
    name: 'Scale Growth',
    price: '$999',
    cadence: '/ month',
    subscribers: '312 active teams',
    mrr: '$311,688 MRR',
    features: ['Up to 50 team seats', 'Priority email & chat support', 'Advanced automated dunning', 'Multi-currency settlement'],
    badge: 'Popular',
    highlight: false,
  },
  {
    name: 'Pro Startup',
    price: '$299',
    cadence: '/ month',
    subscribers: '1,420 active teams',
    mrr: '$424,580 MRR',
    features: ['Up to 10 team seats', 'Standard fraud protection', 'Unified webhook relays', 'Exportable accounting sync'],
    badge: 'Self-Serve',
    highlight: false,
  },
  {
    name: 'API Token Overages',
    price: '$0.002',
    cadence: '/ 1k calls',
    subscribers: 'Metered usage',
    mrr: '$18,400 MRR',
    features: ['Dynamic per-request metering', 'Automated bill-at-threshold', 'Real-time billing webhooks', 'Zero cold-start fee'],
    badge: 'Metered',
    highlight: false,
  },
];

export const ProductsView: React.FC<ProductsViewProps> = ({
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
              Products
            </h1>
            <span className="rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-xs font-semibold text-amber-700 tracking-tight">
              4 Active Tiers
            </span>
          </div>

          <div id="page-view-toolbar" data-slot="view-toolbar" className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
            >
              <Tag className="h-4 w-4 text-[#666]" />
              <span>Coupon Codes</span>
            </button>
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#111111] px-4 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(17,17,17,0.22)] transition hover:bg-[#222222] active:scale-[0.98] sm:h-[46px]"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add Product</span>
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
          
          {/* Product Cards Grid (12 cols) */}
          <section className="col-span-1 md:col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {PRODUCTS.map((prod, idx) => (
              <div 
                key={idx}
                className={`soft-card flex flex-col justify-between rounded-[26px] p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)] ${
                  prod.highlight ? 'bg-[linear-gradient(135deg,#ffffff,#f7f9ff)] border-blue-200' : 'bg-white/95'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-800">
                      {prod.badge}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600">{prod.mrr}</span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-[#111]">{prod.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-[750] text-[#111] tracking-tight">{prod.price}</span>
                    <span className="text-xs text-[#777]">{prod.cadence}</span>
                  </div>
                  <div className="text-[11.5px] font-medium text-neutral-600 mt-1">{prod.subscribers}</div>

                  <ul className="mt-5 space-y-2 text-xs border-t border-black/[0.06] pt-4">
                    {prod.features.map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-center gap-2 text-neutral-700">
                        <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-3 border-t border-black/[0.05] flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-600 cursor-pointer hover:underline">Edit Pricing</span>
                  <span className="text-xs text-neutral-400">ID: prd_{idx + 1}04</span>
                </div>
              </div>
            ))}
          </section>

          {/* Promotion / Pricing Strategy Summary (12 cols) */}
          <section className="col-span-1 md:col-span-12">
            <div className="soft-card rounded-[26px] bg-white/95 p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Zap className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-[#111]">Smart Pricing Experiment Active</h4>
                  <p className="text-xs text-[#777]">Annual upfront discount (20% off) increased cash collection velocity by +22% this quarter.</p>
                </div>
              </div>
              <button 
                type="button" 
                className="whitespace-nowrap rounded-xl bg-neutral-100 hover:bg-neutral-200/80 px-4 py-2 text-xs font-semibold text-neutral-900 transition"
              >
                View Experiment Data
              </button>
            </div>
          </section>

        </div>
      </main>
    </>
  );
};
