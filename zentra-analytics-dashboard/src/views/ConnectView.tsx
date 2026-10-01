import React from 'react';
import { Cable, Key, Plus, ExternalLink, CheckCircle2, ShieldCheck, Activity, Terminal } from 'lucide-react';

interface ConnectViewProps {
  layer2Class?: string;
  layer3Class?: string;
}

const INTEGRATIONS = [
  { name: 'QuickBooks Online', category: 'Accounting', status: 'Connected', desc: 'Automatic two-way sync for sales receipts and invoice reconciliation.' },
  { name: 'Slack Notifications', category: 'Alerts', status: 'Connected', desc: 'Post instant notifications for high-value payments ($1k+) and dispute alerts.' },
  { name: 'Salesforce CRM', category: 'Sales & CRM', status: 'Connected', desc: 'Sync customer lifetime spend and contract tiers directly to account executives.' },
  { name: 'Zapier Automation', category: 'Workflow', status: 'Available', desc: 'Connect Zentra events to 5,000+ business productivity tools without code.' },
  { name: 'HubSpot Marketing', category: 'Marketing', status: 'Available', desc: 'Trigger automated onboarding workflows when users start active trials.' },
  { name: 'AWS EventBridge', category: 'Infrastructure', status: 'Connected', desc: 'Stream real-time serverless webhook events into your cloud pipeline.' },
];

const RECENT_WEBHOOKS = [
  { event: 'payment_intent.succeeded', code: 200, time: '3s ago', id: 'evt_1092a' },
  { event: 'charge.captured', code: 200, time: '14s ago', id: 'evt_1092b' },
  { event: 'customer.subscription.created', code: 200, time: '2m ago', id: 'evt_1092c' },
  { event: 'invoice.paid', code: 200, time: '5m ago', id: 'evt_1092d' },
];

export const ConnectView: React.FC<ConnectViewProps> = ({
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
              Connect
            </h1>
            <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 tracking-tight">
              API & Webhooks
            </span>
          </div>

          <div id="page-view-toolbar" data-slot="view-toolbar" className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] border border-black/[0.09] bg-white px-3.5 text-[13px] font-medium text-[#111111] shadow-[0_2px_8px_-2px_rgba(17,17,17,0.08)] transition hover:bg-[#fafafa] sm:h-[46px]"
            >
              <Key className="h-4 w-4 text-[#666]" />
              <span>API Keys</span>
            </button>
            <button
              type="button"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#111111] px-4 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(17,17,17,0.22)] transition hover:bg-[#222222] active:scale-[0.98] sm:h-[46px]"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>New Webhook Endpoint</span>
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
          
          {/* Active Integrations Grid (8 cols LG) — Sublayer 3a */}
          <section data-widget-sublayer="3a" className="col-span-1 md:col-span-12 lg:col-span-8 flex flex-col">
            <div className="soft-card flex h-full flex-col justify-between rounded-[28px] bg-white/95 p-6 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
                  <div>
                    <h2 className="text-xl font-bold text-[#111]">Platform Integrations</h2>
                    <p className="text-xs text-[#777]">Synchronize transactions, customer billing, and webhooks</p>
                  </div>
                  <span className="text-xs font-semibold text-[#111]">4 Active / 2 Available</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
                  {INTEGRATIONS.map((item, idx) => (
                    <div key={idx} className="rounded-2xl border border-black/[0.07] bg-[#fafafa] p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">{item.category}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.status === 'Connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-200/80 text-neutral-700'
                          }`}>
                            {item.status === 'Connected' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                            {item.status}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[#111]">{item.name}</h4>
                        <p className="text-xs text-[#666] mt-1 leading-relaxed">{item.desc}</p>
                      </div>

                      <div className="mt-4 pt-2.5 border-t border-black/[0.05] flex items-center justify-between text-xs">
                        <span className="font-medium text-blue-600 cursor-pointer hover:underline">
                          {item.status === 'Connected' ? 'Manage' : 'Connect Now'}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Webhook Activity Stream (4 cols LG) */}
          <section data-widget-sublayer="3b" className="col-span-1 md:col-span-12 lg:col-span-4 flex flex-col gap-4">
            <div className="soft-card rounded-[26px] bg-white/95 p-5 shadow-[0_20px_42px_-26px_rgba(17,17,17,0.18)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-base font-semibold text-[#111]">Webhook Live Stream</h3>
                </div>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <p className="text-xs text-[#777] mb-3">Recent event delivery logs across active endpoints</p>

              <div className="space-y-2 text-xs">
                {RECENT_WEBHOOKS.map((wh, idx) => (
                  <div key={idx} className="rounded-xl border border-black/[0.05] p-2.5 bg-neutral-50 font-mono text-[11.5px] flex items-center justify-between">
                    <div>
                      <div className="text-neutral-900 font-semibold">{wh.event}</div>
                      <div className="text-[10px] text-neutral-500">{wh.id} • {wh.time}</div>
                    </div>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      {wh.code}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="soft-card rounded-[26px] bg-[linear-gradient(135deg,#111111,#222222)] p-5 text-white shadow-[0_20px_42px_-26px_rgba(17,17,17,0.28)]">
              <div className="flex items-center gap-2 mb-1">
                <Terminal className="h-4 w-4 text-neutral-300" />
                <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Secret Key Active</span>
              </div>
              <div className="mt-2 font-mono text-xs bg-black/40 rounded-xl p-2.5 text-neutral-300 border border-white/10 select-all">
                sk_live_94kL...m39Q
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Created 14 days ago • Never share this secret key in client-side code.
              </p>
            </div>
          </section>

        </div>
      </main>
    </>
  );
};
