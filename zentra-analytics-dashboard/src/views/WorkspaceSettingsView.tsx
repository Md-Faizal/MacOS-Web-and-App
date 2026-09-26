import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CreditCard,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { WorkerAccessView } from './WorkerAccessView';

interface WorkspaceSettingsViewProps {
  layer2Class?: string;
  layer3Class?: string;
  initialSection?: 'general' | 'profile' | 'security' | 'workers' | 'integrations';
  onBackHome?: () => void;
}

type WorkspaceSection = 'general' | 'profile' | 'security' | 'workers' | 'integrations';

const SECTION_TABS: Array<{ value: WorkspaceSection; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'profile', label: 'Profile' },
  { value: 'security', label: 'Security' },
  { value: 'workers', label: 'Workers access' },
  { value: 'integrations', label: 'Integrations' },
];

export const WorkspaceSettingsView: React.FC<WorkspaceSettingsViewProps> = ({
  layer2Class = '',
  layer3Class = '',
  initialSection = 'general',
  onBackHome,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceSection>(initialSection);

  React.useEffect(() => {
    setActiveTab(initialSection);
  }, [initialSection]);

  const workspaceMeta = useMemo(
    () => [
      { label: 'Workspace', value: 'Zentra Operations', icon: Building2, tone: 'bg-[#EAF2FF] text-[#2563EB]' },
      { label: 'Plan', value: 'Business Pro', icon: CreditCard, tone: 'bg-[#ECFDF5] text-[#16A34A]' },
      { label: 'Members', value: '18 active users', icon: Users, tone: 'bg-[#F6F3FF] text-[#7C3AED]' },
      { label: 'Security', value: 'Protected', icon: ShieldCheck, tone: 'bg-[#FFF7ED] text-[#EA580C]' },
    ],
    [],
  );

  const renderProfile = () => (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-[0_10px_24px_rgba(17,17,17,0.12)] sm:h-24 sm:w-24">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80"
              alt="Workspace owner"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#111111] text-white shadow-lg">
              <Building2 size={14} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3B82F6]">
              <BriefcaseBusiness size={12} />
              <span>Workspace Owner</span>
            </div>
            <h2 className="truncate text-2xl font-bold tracking-[-0.05em] text-[#111111] sm:text-[2rem]">Aroha Chan</h2>
            <p className="mt-1 truncate text-sm text-[#666666]">aroha@zentra.io</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Account</p>
              <h3 className="mt-1 text-lg font-semibold text-[#111111]">Profile details</h3>
            </div>
            <button type="button" className="rounded-full border border-black/[0.08] bg-[#F7F7F7] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#EFEFEF]">
              Edit profile
            </button>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Name', value: 'Aroha Chan', icon: Building2 },
              { label: 'Email', value: 'aroha@zentra.io', icon: Bell },
              { label: 'Role', value: 'Workspace owner', icon: BriefcaseBusiness },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#2563EB]">
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">{label}</div>
                    <div className="text-sm font-medium text-[#111111]">{value}</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#8A8A8A]" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Security</p>
              <h3 className="mt-1 text-lg font-semibold text-[#111111]">Protection</h3>
            </div>
            <button type="button" onClick={() => setActiveTab('security')} className="rounded-full border border-black/[0.08] bg-[#F7F7F7] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#EFEFEF]">
              Manage
            </button>
          </div>

          <div className="space-y-3">
            {[
              { title: 'Password', value: 'Set and active', tone: 'bg-[#ECFDF5] text-[#16A34A]' },
              { title: 'Google account', value: 'Connected', tone: 'bg-[#EAF2FF] text-[#2563EB]' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}>
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">{item.title}</div>
                      <div className="text-sm font-medium text-[#111111]">{item.value}</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">On</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderGeneral = () => (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Workspace</p>
              <h3 className="mt-1 text-lg font-semibold text-[#111111]">Overview</h3>
            </div>
            <button type="button" className="rounded-full border border-black/[0.08] bg-[#F7F7F7] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#EFEFEF]">
              Edit settings
            </button>
          </div>

          <div className="space-y-3">
            {workspaceMeta.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">{label}</div>
                    <div className="text-sm font-medium text-[#111111]">{value}</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#8A8A8A]" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Team</p>
              <h3 className="mt-1 text-lg font-semibold text-[#111111]">Roles</h3>
            </div>
            <button type="button" className="rounded-full border border-black/[0.08] bg-[#F7F7F7] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#EFEFEF]">
              Manage
            </button>
          </div>

          <div className="space-y-3">
            {[
              { name: 'Aroha Chan', role: 'Owner', status: 'Primary admin' },
              { name: 'Maya Scott', role: 'Manager', status: 'Operations' },
              { name: 'Theo Nguyen', role: 'Worker', status: 'Billing support' },
            ].map((person) => (
              <div key={person.name} className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-xs font-semibold text-white">
                    {person.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[#111111]">{person.name}</div>
                    <div className="text-xs text-[#666666]">{person.status}</div>
                  </div>
                </div>
                <span className="rounded-full border border-black/[0.08] bg-white px-2 py-1 text-[10px] font-medium text-[#111111]">
                  {person.role}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Protected</p>
            <h3 className="mt-1 text-lg font-semibold text-[#111111]">Security controls</h3>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-[#F7F7F7] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#EFEFEF]">
            <ShieldCheck size={14} />
            Harden
          </button>
        </div>

        <div className="space-y-3">
          {[
            { title: 'Multi-factor authentication', meta: 'Required for workspace admins', tone: 'bg-[#EAF2FF] text-[#2563EB]' },
            { title: 'Session monitoring', meta: 'Alerts on untrusted login attempts', tone: 'bg-[#ECFDF5] text-[#16A34A]' },
            { title: 'Worker approvals', meta: 'New access requests must be reviewed', tone: 'bg-[#F6F3FF] text-[#7C3AED]' },
          ].map((item) => (
            <div key={item.title} className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}>
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="text-sm font-medium text-[#111111]">{item.title}</div>
                  <div className="text-xs text-[#666666]">{item.meta}</div>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">On</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderIntegrations = () => (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[
          { name: 'Billing gateway', status: 'Connected', detail: 'Stripe / Recurly' },
          { name: 'Communication', status: 'Ready', detail: 'Email + SMS' },
          { name: 'Storage', status: 'Synced', detail: 'Cloud + backups' },
        ].map((item) => (
          <div key={item.name} className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#111111]">
                <Wrench size={18} />
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">{item.status}</span>
            </div>
            <div className="text-base font-semibold text-[#111111]">{item.name}</div>
            <div className="mt-1 text-sm text-[#666666]">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <section
      id="layer-page-header"
      data-layer="page-header"
      data-layer-order="2"
      className={`relative z-40 ${layer2Class}`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7A7A7A]">Workspace</p>
          <h1 className="mt-1 text-[2.2rem] font-bold leading-[0.9] tracking-[-0.08em] text-[#111111] sm:text-[2.8rem]">Workspace settings</h1>
        </div>
        <div className="flex items-center gap-2">
          {onBackHome && (
            <button type="button" onClick={onBackHome} className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/90 px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#F5F5F5]">
              <ArrowLeft size={14} />
              Home
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 inline-flex w-full flex-wrap items-center gap-2 rounded-full border border-black/[0.08] bg-white/85 p-1 shadow-[0_6px_18px_rgba(17,17,17,0.08)]">
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeTab === tab.value ? 'bg-[#111111] text-white' : 'text-[#555555] hover:bg-black/[0.03]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main id="layer-widget-canvas" data-layer="widget-canvas" data-layer-order="3" className={`relative z-10 w-full ${layer3Class}`}>
        {activeTab === 'profile' && renderProfile()}
        {activeTab === 'general' && renderGeneral()}
        {activeTab === 'security' && renderSecurity()}
        {activeTab === 'workers' && <WorkerAccessView />}
        {activeTab === 'integrations' && renderIntegrations()}
      </main>
    </section>
  );
};
