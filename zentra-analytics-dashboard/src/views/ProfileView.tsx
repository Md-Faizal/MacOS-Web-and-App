import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, Check, ChevronRight, KeyRound, ShieldCheck, Smartphone, UserRound, Lock, LogOut, Globe2, BadgeCheck, Mail, UserCircle2 } from 'lucide-react';
import { readStoredSession } from '../lib/auth';
import { WorkerAccessView } from './WorkerAccessView';

interface ProfileViewProps {
  layer2Class?: string;
  layer3Class?: string;
  onSignOut?: () => void;
  onBackHome?: () => void;
}

type ProfileState = {
  id?: number;
  username?: string;
  full_name?: string;
  email?: string;
  email_id?: string;
  display_name?: string;
  display_email?: string;
  google_email?: string;
  google_name?: string;
  google_picture?: string;
  profile_picture?: string;
  display_picture?: string;
  picture_source?: string;
  name_source?: string;
  is_google_linked?: boolean;
  has_password?: boolean;
  role?: string;
  status?: string;
  devices?: Array<{ id?: string; device_name?: string; device_type?: string; client_type?: string; app_name?: string; isCurrent?: boolean; last_seen?: string; active_session_count?: number; }>;
};

const defaultAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';

function formatDisplayName(name?: string, fallback = 'Workspace Owner') {
  return name && String(name).trim() ? String(name).trim() : fallback;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ layer2Class = '', layer3Class = '', onSignOut, onBackHome }) => {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'workers'>('overview');

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      try {
        setLoading(true);
        const session = readStoredSession();
        const response = await fetch('/api/profile', {
          headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('Unable to load profile');
        }
        const payload = await response.json();
        if (!mounted) return;
        if (payload?.success && payload.profile) {
          setProfile(payload.profile);
        } else {
          setError('Profile data is unavailable');
        }
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Unable to load profile');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadProfile();
    return () => { mounted = false; };
  }, []);

  const displayPicture = useMemo(() => {
    if (!profile) return defaultAvatar;
    const source = profile.display_picture || profile.google_picture || profile.profile_picture || defaultAvatar;
    return source || defaultAvatar;
  }, [profile]);

  const displayName = useMemo(() => {
    if (!profile) return 'Workspace Owner';
    return formatDisplayName(profile.display_name || profile.full_name || profile.google_name || profile.username, 'Workspace Owner');
  }, [profile]);

  const displayEmail = useMemo(() => {
    if (!profile) return 'owner@zentra.io';
    return profile.display_email || profile.email_id || profile.email || profile.google_email || 'owner@zentra.io';
  }, [profile]);

  const securityStatus = useMemo(() => {
    if (!profile) return 'Protected';
    return profile.has_password !== false ? 'Protected' : 'Off';
  }, [profile]);

  const deviceList = profile?.devices || [];

  const renderOverview = () => (
    <div className="space-y-5">
      <div className="rounded-[26px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-[0_10px_24px_rgba(17,17,17,0.12)] sm:h-24 sm:w-24">
            <img src={displayPicture} alt={displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#111111] text-white shadow-lg">
              <Camera size={14} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3B82F6]">
              <BadgeCheck size={12} />
              <span>Zentra Account</span>
            </div>
            <h2 className="truncate text-2xl font-bold tracking-[-0.05em] text-[#111111] sm:text-[2rem]">{displayName}</h2>
            <p className="mt-1 truncate text-sm text-[#666666]">{displayEmail}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Account</p>
              <h3 className="mt-1 text-lg font-semibold text-[#111111]">Profile overview</h3>
            </div>
            <button type="button" className="rounded-full border border-black/[0.08] bg-[#F7F7F7] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#EFEFEF]">
              Edit profile
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#2563EB]">
                  <UserRound size={18} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">Name</div>
                  <div className="text-sm font-medium text-[#111111]">{displayName}</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#8A8A8A]" />
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF6EE] text-[#16A34A]">
                  <Mail size={18} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">Email</div>
                  <div className="text-sm font-medium text-[#111111]">{displayEmail}</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#8A8A8A]" />
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F6F3FF] text-[#7C3AED]">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">Google</div>
                  <div className="text-sm font-medium text-[#111111]">{profile?.google_email ? profile.google_email : 'Not linked'}</div>
                </div>
              </div>
              <div className={`rounded-full px-2 py-1 text-[10px] font-semibold ${profile?.google_email ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                {profile?.google_email ? 'Linked' : 'Off'}
              </div>
            </div>
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
            <div className="rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#16A34A]">
                    <Lock size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">Password</div>
                    <div className="text-sm font-medium text-[#111111]">{securityStatus}</div>
                  </div>
                </div>
                <Check size={16} className="text-emerald-600" />
              </div>
            </div>

            <div className="rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#2563EB]">
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">Passkey</div>
                    <div className="text-sm font-medium text-[#111111]">Available on this browser</div>
                  </div>
                </div>
                <Check size={16} className="text-emerald-600" />
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Devices</p>
            <h3 className="mt-1 text-lg font-semibold text-[#111111]">Signed-in devices</h3>
          </div>
          <span className="text-sm text-[#666666]">{deviceList.length} active</span>
        </div>

        <div className="space-y-2.5">
          {deviceList.length > 0 ? deviceList.map((device) => (
            <div key={device.id || device.device_name} className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#111111]">
                  {device.app_name === 'android' || device.device_type?.toLowerCase().includes('android') ? <Smartphone size={18} /> : <Globe2 size={18} />}
                </div>
                <div>
                  <div className="text-sm font-medium text-[#111111]">{device.device_name || 'Current browser'}</div>
                  <div className="text-xs text-[#666666]">{device.client_type || device.app_name || 'web'} · {device.isCurrent ? 'This device' : 'Signed in'}</div>
                </div>
              </div>
              <button type="button" className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#111111]">Manage</button>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-black/[0.12] bg-[#F8F8F8] p-5 text-sm text-[#666666]">
              No other active sessions were found.
            </div>
          )}
        </div>
      </section>
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-4 shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Protected</p>
            <h3 className="mt-1 text-lg font-semibold text-[#111111]">Sign-in & security</h3>
          </div>
          <button type="button" onClick={() => setActiveTab('overview')} className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-[#F7F7F7] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#EFEFEF]">
            <ArrowLeft size={14} />
            Back
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#2563EB]">
                <KeyRound size={18} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">Password</div>
                <div className="text-sm font-medium text-[#111111]">{profile?.has_password !== false ? 'Set and active' : 'Not set'}</div>
              </div>
            </div>
            <button type="button" className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[11px] font-medium text-[#111111]">Change</button>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#16A34A]">
                <ShieldCheck size={18} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">Google account</div>
                <div className="text-sm font-medium text-[#111111]">{profile?.google_email ? profile.google_email : 'Not connected'}</div>
              </div>
            </div>
            <button type="button" className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[11px] font-medium text-[#111111]">
              {profile?.google_email ? 'Manage' : 'Connect'}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8F8F8] p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F6F3FF] text-[#7C3AED]">
                <UserCircle2 size={18} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A7A7A]">Session security</div>
                <div className="text-sm font-medium text-[#111111]">Browser-based session protection active</div>
              </div>
            </div>
            <Check size={16} className="text-emerald-600" />
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 shadow-[0_16px_38px_-18px_rgba(239,68,68,0.18)] sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#111111]">Danger zone</h3>
          <LogOut className="text-red-600" size={18} />
        </div>
        <p className="text-sm text-[#5F5F5F]">Sign out of the current session or revoke all other active logins from this account.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onSignOut} className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500">
            Sign out
          </button>
          <button type="button" className="inline-flex items-center justify-center rounded-full border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100">
            Sign out of all devices
          </button>
        </div>
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
          <h1 className="mt-1 text-[2.2rem] font-bold leading-[0.9] tracking-[-0.08em] text-[#111111] sm:text-[2.8rem]">Profile</h1>
        </div>
        <div className="flex items-center gap-2">
          {onBackHome && (
            <button type="button" onClick={onBackHome} className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/90 px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#F5F5F5]">
              Home
            </button>
          )}
          <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/85 p-1 shadow-[0_6px_18px_rgba(17,17,17,0.08)]">
            <button type="button" onClick={() => setActiveTab('overview')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeTab === 'overview' ? 'bg-[#111111] text-white' : 'text-[#555555] hover:bg-black/[0.03]'}`}>
              Overview
            </button>
            <button type="button" onClick={() => setActiveTab('security')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeTab === 'security' ? 'bg-[#111111] text-white' : 'text-[#555555] hover:bg-black/[0.03]'}`}>
              Security
            </button>
            <button type="button" onClick={() => setActiveTab('workers')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeTab === 'workers' ? 'bg-[#111111] text-white' : 'text-[#555555] hover:bg-black/[0.03]'}`}>
              Workers access
            </button>
          </div>
        </div>
      </div>

      <main id="layer-widget-canvas" data-layer="widget-canvas" data-layer-order="3" className={`relative z-10 w-full ${layer3Class}`}>
        {loading ? (
          <div className="rounded-[24px] border border-black/[0.08] bg-white/90 p-8 text-center text-sm text-[#666666] shadow-[0_16px_38px_-18px_rgba(17,17,17,0.18)]">
            Loading profile…
          </div>
        ) : error ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-[0_16px_38px_-18px_rgba(239,68,68,0.18)]">
            {error}
          </div>
        ) : (
          <div>
            {activeTab === 'security' ? renderSecurity() : activeTab === 'workers' ? <WorkerAccessView /> : renderOverview()}
          </div>
        )}
      </main>
    </section>
  );
};
