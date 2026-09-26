import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { apiFetch } from '../lib/auth';

type SectionTab = 'workers' | 'requests' | 'board' | 'audit';
type WorkerFilter = 'all' | 'active' | 'pending_deletion' | 'deleted';

type WorkerUser = {
  id: string | number;
  username?: string;
  full_name?: string;
  email?: string;
  google_email?: string;
  google_picture?: string;
  role?: string;
  status?: string;
  invite_code?: string;
  created_at?: string;
  approved_at?: string;
  deletion_requested_at?: string;
  deletion_reason?: string;
  deleted_at?: string;
  last_client_type?: string;
  last_device_type?: string;
  last_platform?: string;
  google_id?: string | null;
  google_name?: string | null;
};

type PermissionRow = {
  module: string;
  can_view?: number | boolean;
  can_create?: number | boolean;
  can_edit?: number | boolean;
  can_delete?: number | boolean;
};

type AuditLog = {
  id?: string | number;
  user_id?: string | number;
  platform?: string;
  module?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string | number;
  resource_name?: string;
  metadata?: Record<string, any> | null;
  created_at?: string;
  display_name?: string;
  username?: string;
  email?: string;
  full_name?: string;
};

const MODULE_OPTIONS = [
  'billing',
  'products',
  'contacts',
  'analytics',
  'notes',
  'calendar',
  'cloud',
  'calculator',
  'ai-vision',
  'settings',
] as const;

const DEFAULT_ALLOWED_APPS = ['billing', 'products', 'contacts', 'analytics'];

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char as keyof typeof char] || char));

const getUserDisplayName = (user: Partial<WorkerUser>) => {
  return user.full_name || user.google_name || user.email || user.google_email || user.username || 'Worker';
};

const getUserEmail = (user: Partial<WorkerUser>) => {
  return user.google_email || user.email || user.username || 'No email';
};

const normalizePermissionMap = (permissionRows: PermissionRow[] | undefined, allowedModules: string[] = []) => {
  const map: Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }> = {};

  for (const moduleName of MODULE_OPTIONS) {
    const row = permissionRows?.find((entry) => String(entry.module) === moduleName);
    const allowed = allowedModules.includes(moduleName);
    map[moduleName] = {
      can_view: Boolean(row ? Number(row.can_view ?? 0) : allowed ? 1 : 0),
      can_create: Boolean(row ? Number(row.can_create ?? 0) : allowed ? 1 : 0),
      can_edit: Boolean(row ? Number(row.can_edit ?? 0) : allowed ? 1 : 0),
      can_delete: Boolean(row ? Number(row.can_delete ?? 0) : allowed ? 0 : 0),
    };
  }

  return map;
};

export const WorkerAccessView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SectionTab>('workers');
  const [workerFilter, setWorkerFilter] = useState<WorkerFilter>('all');
  const [workers, setWorkers] = useState<WorkerUser[]>([]);
  const [graphData, setGraphData] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewUser, setReviewUser] = useState<WorkerUser | null>(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [allowedModules, setAllowedModules] = useState<string[]>([]);
  const [permissionMap, setPermissionMap] = useState<Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>>({});
  const [contactIds, setContactIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [auditPlatform, setAuditPlatform] = useState<'all' | 'pwa' | 'android' | 'web'>('all');

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const [workersPayload, graphPayload, auditPayload] = await Promise.all([
        apiFetch<{ users?: WorkerUser[] }>('/api/admin/users'),
        apiFetch<any>('/api/admin/accounts-graph'),
        apiFetch<{ logs?: AuditLog[] }>('/api/admin/audit'),
      ]);

      setWorkers(Array.isArray(workersPayload?.users) ? workersPayload.users : []);
      setGraphData(graphPayload || null);
      setAuditLogs(Array.isArray(auditPayload?.logs) ? auditPayload.logs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load worker access data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const pendingRequests = useMemo(() => workers.filter((user) => user.status === 'pending'), [workers]);

  const filteredWorkers = useMemo(() => {
    const base = workers.filter((user) => user.status !== 'pending');
    if (workerFilter === 'active') return base.filter((user) => user.status === 'active' || user.status === 'suspended');
    if (workerFilter === 'pending_deletion') return base.filter((user) => user.status === 'pending_deletion');
    if (workerFilter === 'deleted') return base.filter((user) => user.status === 'deleted');
    return base;
  }, [workerFilter, workers]);

  const filteredAuditLogs = useMemo(() => {
    if (auditPlatform === 'all') return auditLogs;
    return auditLogs.filter((log) => (log.platform || 'web').toLowerCase() === auditPlatform);
  }, [auditLogs, auditPlatform]);

  const openReviewModal = async (user: WorkerUser, isPending = false) => {
    setReviewUser(user);
    setReviewPending(isPending);

    try {
      const payload = await apiFetch<{ allowedApps?: string[]; permissions?: PermissionRow[]; contactIds?: Array<string | number> }>(`/api/admin/users/${encodeURIComponent(String(user.id))}/permissions`);
      const nextAllowedModules = Array.isArray(payload.allowedApps) && payload.allowedApps.length > 0 ? payload.allowedApps : DEFAULT_ALLOWED_APPS;
      const nextPermissions = normalizePermissionMap(payload.permissions, nextAllowedModules);
      setAllowedModules(nextAllowedModules);
      setPermissionMap(nextPermissions);
      setContactIds(Array.isArray(payload.contactIds) ? payload.contactIds.map((id) => Number(id)) : []);
    } catch {
      setAllowedModules(DEFAULT_ALLOWED_APPS);
      setPermissionMap(normalizePermissionMap([], DEFAULT_ALLOWED_APPS));
      setContactIds([]);
    }
  };

  const savePermissions = async () => {
    if (!reviewUser) return;
    setSaving(true);

    try {
      const endpoint = reviewPending
        ? `/api/admin/users/${encodeURIComponent(String(reviewUser.id))}/approve`
        : `/api/admin/users/${encodeURIComponent(String(reviewUser.id))}/permissions`;
      const method = reviewPending ? 'POST' : 'PUT';

      await apiFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowedApps: allowedModules,
          permissions: permissionMap,
          contactIds,
        }),
      });

      setReviewUser(null);
      setReviewPending(false);
      await refresh();
    } catch (error) {
      console.error('Failed to save worker permissions', error);
      setError('Unable to save the worker permissions.');
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (moduleName: string) => {
    setAllowedModules((current) => {
      if (current.includes(moduleName)) {
        return current.filter((entry) => entry !== moduleName);
      }
      return [...current, moduleName];
    });
  };

  const updatePermission = (moduleName: string, action: keyof typeof permissionMap[string]) => {
    setPermissionMap((current) => ({
      ...current,
      [moduleName]: {
        ...(current[moduleName] || { can_view: false, can_create: false, can_edit: false, can_delete: false }),
        [action]: !((current[moduleName]?.[action]) ?? false),
      },
    }));
  };

  const handleRejectDeletion = async (userId: string | number) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(String(userId))}/reject-deletion`, {
        method: 'POST',
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject deletion');
    }
  };

  const handleApproveDeletion = async (userId: string | number) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(String(userId))}/approve-deletion`, {
        method: 'POST',
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve deletion');
    }
  };

  const handleDenyRequest = async (userId: string | number) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(String(userId))}`, {
        method: 'DELETE',
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to deny request');
    }
  };

  return (
    <section className="w-full">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7A7A7A]">Access</p>
          <h1 className="mt-1 text-[2.1rem] font-bold leading-[0.9] tracking-[-0.08em] text-[#111111] sm:text-[2.8rem]">Workers access</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/90 p-1 shadow-[0_6px_18px_rgba(17,17,17,0.08)]">
          {(['workers', 'requests', 'board', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveSection(tab)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeSection === tab ? 'bg-[#111111] text-white' : 'text-[#555555] hover:bg-black/[0.03]'
              }`}
            >
              {tab === 'workers' ? 'Workers' : tab === 'requests' ? 'Requests' : tab === 'board' ? 'Board' : 'Audit'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-8 text-center text-sm text-[#666666] shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)]">
          Loading workers access…
        </div>
      ) : error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-[0_16px_38px_-18px_rgba(239,68,68,0.18)]">
          {error}
        </div>
      ) : (
        <main className="space-y-5">
          {activeSection === 'workers' && (
            <>
              <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Worker access</p>
                    <h2 className="mt-1 text-xl font-semibold text-[#111111]">Staff and delegated accounts</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(['all', 'active', 'pending_deletion', 'deleted'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setWorkerFilter(filter)}
                        className={`rounded-full border px-2.5 py-1.5 text-[11px] font-medium ${
                          workerFilter === filter
                            ? 'border-[#111111] bg-[#111111] text-white'
                            : 'border-black/[0.07] bg-[#F7F7F7] text-[#111111]'
                        }`}
                      >
                        {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : filter === 'pending_deletion' ? 'Pending deletion' : 'Deleted'}
                        <span className="ml-1 opacity-80">
                          {filter === 'all' ? workers.filter((user) => user.status !== 'pending').length :
                            filter === 'active' ? workers.filter((user) => user.status === 'active' || user.status === 'suspended').length :
                            filter === 'pending_deletion' ? workers.filter((user) => user.status === 'pending_deletion').length :
                            workers.filter((user) => user.status === 'deleted').length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {filteredWorkers.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-black/[0.12] bg-white/90 p-8 text-center text-sm text-[#666666] shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] xl:col-span-2">
                    No workers match the selected filter.
                  </div>
                ) : (
                  filteredWorkers.map((user) => {
                    const status = String(user.status || 'active').toLowerCase();
                    const image = user.google_picture || '/assets/Images/DefaultUser.png';
                    const provider = user.google_email || user.google_id ? 'Google' : 'Local';

                    return (
                      <button
                        key={String(user.id)}
                        type="button"
                        onClick={() => void openReviewModal(user, false)}
                        className="group rounded-[24px] border border-black/[0.08] bg-white/90 p-4 text-left shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] transition hover:-translate-y-0.5 hover:border-black/[0.12]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <img src={image} alt={getUserDisplayName(user)} className="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow-[0_10px_24px_rgba(17,17,17,0.12)]" referrerPolicy="no-referrer" onError={(event) => { (event.currentTarget as HTMLImageElement).src = '/assets/Images/DefaultUser.png'; }} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="truncate text-lg font-semibold text-[#111111]">{getUserDisplayName(user)}</h3>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${provider === 'Google' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#F3F3F3] text-[#555555]'}`}>
                                  {provider}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-sm text-[#666666]">{getUserEmail(user)}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#7A7A7A]">
                                <span className={`rounded-full px-2 py-1 ${status === 'active' ? 'bg-emerald-100 text-emerald-700' : status === 'deleted' ? 'bg-red-100 text-red-700' : status === 'pending_deletion' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                                  {status}
                                </span>
                                <span>{user.role || 'worker'}</span>
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="mt-1 h-4 w-4 text-[#888888] transition group-hover:text-[#111111]" />
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3">
                            <div className="text-[10px] uppercase tracking-[0.12em] text-[#7A7A7A]">Access code</div>
                            <div className="mt-1 text-sm font-medium text-[#111111]">{user.invite_code || '—'}</div>
                          </div>
                          <div className="rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3">
                            <div className="text-[10px] uppercase tracking-[0.12em] text-[#7A7A7A]">Joined</div>
                            <div className="mt-1 text-sm font-medium text-[#111111]">{formatDate(user.created_at)}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          {activeSection === 'requests' && (
            <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
              {pendingRequests.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#666666]">No pending worker requests right now.</div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((user) => (
                    <div key={String(user.id)} className="flex flex-col gap-3 rounded-[20px] border border-black/[0.07] bg-[#F8F8F8] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <img src={user.google_picture || '/assets/Images/DefaultUser.png'} alt={getUserDisplayName(user)} className="h-11 w-11 rounded-full object-cover" referrerPolicy="no-referrer" onError={(event) => { (event.currentTarget as HTMLImageElement).src = '/assets/Images/DefaultUser.png'; }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-[#111111]">{getUserDisplayName(user)}</h3>
                            <span className="rounded-full bg-[#EAF2FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2563EB]">{user.invite_code || 'Code'}</span>
                          </div>
                          <p className="text-sm text-[#666666]">{getUserEmail(user)}</p>
                          <p className="text-[11px] text-[#7A7A7A]">Requested {formatDate(user.created_at)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => void handleDenyRequest(user.id)} className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Deny</button>
                        <button type="button" onClick={() => void openReviewModal(user, true)} className="rounded-full bg-[#111111] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1b1b1b]">Review & approve</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'board' && (
            <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[#666666]">
                <span className="rounded-full bg-[#F7F7F7] px-2.5 py-1.5 font-medium text-[#111111]">Accounts {graphData?.users?.length ?? 0}</span>
                <span className="rounded-full bg-[#F7F7F7] px-2.5 py-1.5 font-medium text-[#111111]">Google {graphData?.users?.filter((user: any) => user.google_id || user.google_email).length ?? 0}</span>
                <span className="rounded-full bg-[#F7F7F7] px-2.5 py-1.5 font-medium text-[#111111]">Local {graphData?.users?.filter((user: any) => !user.google_id && !user.google_email).length ?? 0}</span>
                <span className="rounded-full bg-[#F7F7F7] px-2.5 py-1.5 font-medium text-[#111111]">Active {graphData?.users?.filter((user: any) => user.status === 'active').length ?? 0}</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(graphData?.users || []).slice(0, 12).map((user: any) => (
                  <div key={String(user.id)} className="rounded-[20px] border border-black/[0.07] bg-[#F8F8F8] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <img src={user.google_picture || '/assets/Images/DefaultUser.png'} alt={user.full_name || user.username || 'Account'} className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" onError={(event) => { (event.currentTarget as HTMLImageElement).src = '/assets/Images/DefaultUser.png'; }} />
                        <div>
                          <div className="text-sm font-semibold text-[#111111]">{user.full_name || user.google_name || user.username || 'Workspace user'}</div>
                          <div className="text-[11px] text-[#666666]">{user.role || 'worker'}</div>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#EFEFEF] text-[#555555]'}`}>{user.status || 'active'}</span>
                    </div>

                    <div className="mt-3 space-y-2 text-xs text-[#666666]">
                      <div className="flex items-center justify-between"><span>Provider</span><span className="font-medium text-[#111111]">{user.google_email ? 'Google' : 'Local'}</span></div>
                      <div className="flex items-center justify-between"><span>Modules</span><span className="font-medium text-[#111111]">{graphData?.modules?.filter((module: string) => (user.role === 'owner' || module !== 'settings')).length || 0}</span></div>
                      <div className="flex items-center justify-between"><span>Scope</span><span className="font-medium text-[#111111]">{user.role === 'owner' ? 'Full owner' : 'Worker scoped'}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'audit' && (
            <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {(['all', 'pwa', 'android', 'web'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setAuditPlatform(filter)}
                    className={`rounded-full border px-2.5 py-1.5 text-[11px] font-medium ${auditPlatform === filter ? 'border-[#111111] bg-[#111111] text-white' : 'border-black/[0.07] bg-[#F7F7F7] text-[#111111]'}`}
                  >
                    {filter === 'all' ? 'All platforms' : filter === 'pwa' ? 'PWA' : filter === 'android' ? 'Android' : 'Web'}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-[20px] border border-black/[0.07]">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F7F7F7] text-[#666666]">
                      <tr>
                        <th className="px-3 py-3 font-medium">Time</th>
                        <th className="px-3 py-3 font-medium">User</th>
                        <th className="px-3 py-3 font-medium">Platform</th>
                        <th className="px-3 py-3 font-medium">Action</th>
                        <th className="px-3 py-3 font-medium">Module</th>
                        <th className="px-3 py-3 font-medium">Resource</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-[#666666]">No audit events recorded for this filter.</td>
                        </tr>
                      ) : (
                        filteredAuditLogs.slice(0, 50).map((log) => (
                          <tr key={String(log.id || `${log.user_id}-${log.created_at}`)} className="border-t border-black/[0.06] bg-white">
                            <td className="px-3 py-3 text-[#666666]">{formatDate(log.created_at)}</td>
                            <td className="px-3 py-3 font-medium text-[#111111]">{log.display_name || log.full_name || log.username || log.email || 'System'}</td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${ (log.platform || '').toLowerCase() === 'android' ? 'bg-[#EAF2FF] text-[#2563EB]' : (log.platform || '').toLowerCase() === 'pwa' ? 'bg-[#ECFDF5] text-[#16A34A]' : 'bg-[#F3F3F3] text-[#555555]'}`}>
                                {(log.platform || 'web').toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-[#111111]">{log.action || 'activity'}</td>
                            <td className="px-3 py-3 capitalize text-[#555555]">{log.module || 'system'}</td>
                            <td className="px-3 py-3 text-[#666666]">{log.resource_name || log.resource_id || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {reviewUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-3xl rounded-[28px] border border-black/[0.08] bg-white p-4 shadow-[0_30px_80px_-20px_rgba(17,17,17,0.3)] sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src={reviewUser.google_picture || '/assets/Images/DefaultUser.png'} alt={getUserDisplayName(reviewUser)} className="h-12 w-12 rounded-full object-cover" referrerPolicy="no-referrer" onError={(event) => { (event.currentTarget as HTMLImageElement).src = '/assets/Images/DefaultUser.png'; }} />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Worker</div>
                  <h2 className="text-xl font-semibold text-[#111111]">{getUserDisplayName(reviewUser)}</h2>
                </div>
              </div>
              <button type="button" onClick={() => setReviewUser(null)} className="rounded-full border border-black/[0.08] bg-[#F7F7F7] p-2 text-[#444444] hover:bg-[#EFEFEF]">
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="rounded-[20px] border border-black/[0.08] bg-[#F8F8F8] p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A7A7A]">Access overview</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-black/[0.06] bg-white p-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#7A7A7A]">Email</div>
                      <div className="mt-1 text-sm font-medium text-[#111111]">{getUserEmail(reviewUser)}</div>
                    </div>
                    <div className="rounded-2xl border border-black/[0.06] bg-white p-3">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#7A7A7A]">Status</div>
                      <div className="mt-1 text-sm font-medium text-[#111111]">{reviewUser.status || 'active'}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[20px] border border-black/[0.08] bg-[#F8F8F8] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A7A7A]">Modules</div>
                    <div className="text-[10px] text-[#666666]">{allowedModules.length} enabled</div>
                  </div>
                  <div className="space-y-2">
                    {MODULE_OPTIONS.map((moduleName) => (
                      <div key={moduleName} className="rounded-2xl border border-black/[0.06] bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <button type="button" onClick={() => toggleModule(moduleName)} className="flex items-center gap-3 text-left">
                            <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${allowedModules.includes(moduleName) ? 'border-[#111111] bg-[#111111] text-white' : 'border-black/[0.18] text-[#666666]'}`}>
                              {allowedModules.includes(moduleName) ? <Check size={12} /> : null}
                            </span>
                            <span className="text-sm font-medium capitalize text-[#111111]">{moduleName.replace('-', ' ')}</span>
                          </button>
                          <span className="text-[10px] uppercase tracking-[0.12em] text-[#7A7A7A]">{allowedModules.includes(moduleName) ? 'Allowed' : 'Off'}</span>
                        </div>

                        {allowedModules.includes(moduleName) && (
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map((action) => (
                              <label key={action} className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/[0.07] bg-[#F7F7F7] px-2 py-1.5 text-[11px] font-medium text-[#444444]">
                                <input type="checkbox" checked={Boolean(permissionMap[moduleName]?.[action])} onChange={() => updatePermission(moduleName, action)} className="h-3.5 w-3.5 accent-[#111111]" />
                                {action.replace('can_', '')}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[20px] border border-black/[0.08] bg-[#F8F8F8] p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A7A7A]">Contact access</div>
                  <div className="space-y-2 text-sm text-[#111111]">
                    {contactIds.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-black/[0.12] bg-white p-3 text-[#666666]">No contact access is assigned yet.</div>
                    ) : (
                      contactIds.map((contactId) => (
                        <div key={contactId} className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white p-3">
                          <span>Contact #{contactId}</span>
                          <button type="button" onClick={() => setContactIds((current) => current.filter((id) => id !== contactId))} className="text-[#666666]"><X size={14} /></button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[20px] border border-black/[0.08] bg-[#F8F8F8] p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A7A7A]">Quick actions</div>
                  <div className="space-y-2">
                    <button type="button" onClick={() => void savePermissions()} disabled={saving} className="w-full rounded-full bg-[#111111] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1b1b1b] disabled:opacity-60">
                      {saving ? 'Saving…' : reviewPending ? 'Approve worker access' : 'Save permissions'}
                    </button>
                    <button type="button" onClick={() => void handleApproveDeletion(reviewUser.id)} className="w-full rounded-full border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">Delete worker</button>
                    <button type="button" onClick={() => void handleRejectDeletion(reviewUser.id)} className="w-full rounded-full border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-medium text-[#111827] hover:bg-[#F7F7F7]">Reject deletion</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default WorkerAccessView;
