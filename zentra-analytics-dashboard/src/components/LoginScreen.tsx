import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  MonitorSmartphone,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import {
  getRememberedAccounts,
  loginWithPassword,
  saveRememberedAccount,
  saveSession,
  setActiveRememberedAccount,
} from '../lib/auth';

interface LoginScreenProps {
  onAuthenticated: (user: any) => void;
}

interface AccountCard {
  id: string;
  identifier: string;
  displayName: string;
  displayPicture: string | null;
  role: string;
  lastActive: number;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [accounts, setAccounts] = useState<AccountCard[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('owner');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const title = useMemo(() => 'Zentra', []);

  useEffect(() => {
    const storedAccounts = getRememberedAccounts();
    setAccounts(storedAccounts);

    const activeUserId = localStorage.getItem('macos_active_user_id');
    if (storedAccounts.length > 0) {
      const preferred = storedAccounts.find((account) => account.id === activeUserId) || storedAccounts[0];
      setSelectedAccountId(preferred.id);
      setIdentifier(preferred.identifier);
    }
  }, []);

  const activeAccount = accounts.find((account) => account.id === selectedAccountId) || null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const loginIdentifier = activeAccount ? activeAccount.identifier : identifier.trim();
    if (!loginIdentifier || !password.trim()) {
      setError('Enter your username or email and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await loginWithPassword(loginIdentifier, password);
      const user = data.user || {
        username: loginIdentifier,
        role: 'owner',
        full_name: activeAccount?.displayName || loginIdentifier,
      };

      if (rememberMe) {
        saveRememberedAccount(user, loginIdentifier);
      }

      setActiveRememberedAccount(activeAccount?.id || `${Date.now()}`);
      saveSession({ ...data, user });
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  function chooseAccount(account: AccountCard) {
    setSelectedAccountId(account.id);
    setIdentifier(account.identifier);
    setShowAccountPicker(false);
    setError('');
  }

  function addNewUser() {
    setSelectedAccountId(null);
    setIdentifier('');
    setPassword('');
    setShowAccountPicker(false);
  }

  return (
    <div className="min-h-screen w-full bg-[#ecece9] text-[#111111] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[1280px] grid overflow-hidden rounded-[32px] border border-black/10 bg-[#f5f4f1] shadow-[0_28px_80px_rgba(17,17,17,0.12)] lg:grid-cols-[1.2fr_0.8fr]">
        <div className="relative hidden overflow-hidden border-r border-black/10 bg-[radial-gradient(circle_at_top_left,_rgba(82,121,255,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(17,17,17,0.08),_transparent_30%),linear-gradient(135deg,#f3f4f1_0%,#e7ebea_100%)] p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.02))' }} />
          <div className="relative z-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-black/10 bg-white shadow-[0_10px_22px_rgba(17,17,17,0.08)]">
                <Sparkles className="h-5 w-5 text-[#1d5cff]" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#686868]">Industrial platform</div>
                <div className="text-2xl font-semibold tracking-[-0.06em]">{title}</div>
              </div>
            </div>

            <div className="space-y-5 pt-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-[#4d4d4d] shadow-[0_8px_18px_rgba(0,0,0,0.04)]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Secure business operations
              </div>

              <h1 className="max-w-xl text-5xl leading-[0.9] tracking-[-0.06em] font-[550] text-[#111111]">
                Operate the entire business from one extraordinary dashboard.
              </h1>

              <p className="max-w-lg text-base leading-7 text-[#4b4b4b]">
                Unified finance, product, customer, analytics, AI intelligence, notes, and reminders inside one hardened workspace.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid gap-3 lg:grid-cols-3">
            {[
              ['Billing', 'Live invoices & cashflow'],
              ['Products', 'Inventory & variants'],
              ['Analytics', 'KPI intelligence'],
            ].map(([heading, caption]) => (
              <div key={heading} className="rounded-2xl border border-black/10 bg-white/85 p-3 shadow-[0_14px_28px_rgba(0,0,0,0.04)] backdrop-blur-sm">
                <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[#6a6a6a]">{heading}</div>
                <div className="text-sm text-[#3c3c3c]">{caption}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-[460px]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#6b6b6b]">Account access</div>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Welcome back</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#111111] text-white shadow-[0_12px_24px_rgba(17,17,17,0.18)]">
                <LockKeyhole className="h-5 w-5" />
              </div>
            </div>

            {accounts.length > 0 && (
              <div className="mb-5 rounded-[24px] border border-black/10 bg-white/80 p-3 shadow-[0_12px_24px_rgba(0,0,0,0.05)]">
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[#6b6b6b]">
                  <span>Accounts</span>
                  <button type="button" onClick={addNewUser} className="inline-flex items-center gap-1 font-medium text-[#1d5cff]">
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {accounts.map((account) => {
                    const active = account.id === selectedAccountId;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => chooseAccount(account)}
                        className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition ${
                          active
                            ? 'border-[#1d5cff] bg-[#eef4ff] shadow-[0_10px_20px_rgba(29,92,255,0.12)]'
                            : 'border-black/10 bg-[#f8f8f7] hover:bg-[#f2f4f4]'
                        }`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#dfeaf9] to-[#bed0ff] text-[11px] font-semibold text-[#203261]">
                          {account.displayPicture ? (
                            <img src={account.displayPicture} alt={account.displayName} className="h-full w-full object-cover" />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-[#111111]">{account.displayName}</div>
                          <div className="truncate text-[10px] text-[#6a6a6a]">{account.role}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_18px_40px_rgba(0,0,0,0.05)] sm:p-7">
              <div className="space-y-4">
                <div className="relative">
                  <label htmlFor="login-identifier" className="mb-2 block text-sm text-[#2f2f2f]">Username or email</label>
                  <input
                    id="login-identifier"
                    name="identifier"
                    value={selectedAccountId ? activeAccount?.identifier || identifier : identifier}
                    onChange={(event) => {
                      setSelectedAccountId(null);
                      setIdentifier(event.target.value);
                    }}
                    placeholder="owner or you@company.com"
                    className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 text-[15px] outline-none transition focus:border-[#1d5cff] focus:bg-white"
                  />
                </div>

                <div className="relative">
                  <label htmlFor="login-password" className="mb-2 block text-sm text-[#2f2f2f]">Password</label>
                  <div className="relative">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 pr-12 text-[15px] outline-none transition focus:border-[#1d5cff] focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute inset-y-0 right-3 flex items-center text-[#666666] hover:text-[#111111]"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3 text-sm text-[#5f5f5f]">
                <label htmlFor="remember-device" className="inline-flex items-center gap-2">
                  <input
                    id="remember-device"
                    name="rememberDevice"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 accent-[#1d5cff]"
                  />
                  Remember this device
                </label>
                <button type="button" className="font-medium text-[#1d5cff] hover:text-[#0f46c5]">
                  Need help?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[15px] font-medium text-white transition hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>

              <div className="mt-5 flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[#666666]">
                <MonitorSmartphone className="h-3.5 w-3.5" />
                Secure access to the Zentra operations suite
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
