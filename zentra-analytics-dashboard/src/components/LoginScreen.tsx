import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  MonitorSmartphone,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  Loader2,
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
  justLoggedOut?: boolean;
}

interface AccountCard {
  id: string;
  identifier: string;
  displayName: string;
  displayPicture: string | null;
  role: string;
  lastActive: number;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated, justLoggedOut = false }) => {
  const [accounts, setAccounts] = useState<AccountCard[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('faizal');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [animPhase, setAnimPhase] = useState<'idle' | 'unlocking' | 'fading-out' | 'expanding' | 'locking'>(
    justLoggedOut ? 'locking' : 'idle'
  );

  const [mousePos, setMousePos] = useState({ x: 0, y: 0, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      opacity: 1,
    });
  };

  const handleMouseLeave = () => {
    setMousePos((prev) => ({ ...prev, opacity: 0 }));
  };

  const title = useMemo(() => 'Zentra', []);

  useEffect(() => {
    if (justLoggedOut) {
      // Hold in unlocked open state as login elements cascade in, then snap lock shut!
      const timer = setTimeout(() => {
        setAnimPhase('idle');
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [justLoggedOut]);

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
      
      // Step 1: Animate lock into unlocked state with emerald glow & spring bounce (350ms)
      setAnimPhase('unlocking');
      
      // Step 2: 3-section bottom-to-top disappear (delays: 0ms, 100ms, 200ms over 450ms animation)
      setTimeout(() => {
        setAnimPhase('fading-out');
        
        // Step 3: Container expands smoothly and background crossfades (750ms)
        setTimeout(() => {
          setAnimPhase('expanding');
          
          // Step 4: Handover to dashboard at peak expansion
          setTimeout(() => {
            onAuthenticated(user);
          }, 750);
        }, 550);
      }, 350);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
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

  const isUnlocked = animPhase === 'unlocking' || animPhase === 'fading-out' || animPhase === 'expanding' || animPhase === 'locking';
  const isFading = animPhase === 'fading-out' || animPhase === 'expanding';
  const isExpanding = animPhase === 'expanding';

  return (
    <div 
      className={`min-h-[100dvh] w-full flex items-center justify-center transition-all duration-[750ms] ease-[cubic-bezier(0.16,1,0.3,1)] bg-transparent ${
        isExpanding ? 'p-2 sm:p-3 lg:p-4' : 'px-4 py-8'
      }`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div 
        className={`w-full transition-all duration-[750ms] ease-[cubic-bezier(0.16,1,0.3,1)] relative rounded-[32px] overflow-hidden backdrop-blur-[24px] sm:backdrop-blur-[28px] backdrop-saturate-[180%] border border-white/80 ${
          isExpanding 
            ? 'max-w-[1760px] min-h-[calc(100dvh-16px)] sm:min-h-[calc(100dvh-24px)] lg:min-h-[calc(100dvh-32px)] shadow-[0_28px_80px_-20px_rgba(17,17,17,0.16),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_2px_4px_rgba(0,0,0,0.02)]' 
            : 'max-w-[1280px] min-h-[600px] shadow-[0_28px_80px_-20px_rgba(17,17,17,0.16),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_2px_4px_rgba(0,0,0,0.02)]'
        }`}
      >
        {/* Background Layers with Smooth Crossfade */}
        <div 
          className={`absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(255,146,63,0.08),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.32)_0%,rgba(244,242,238,0.18)_50%,rgba(255,255,255,0.36)_100%)] transition-opacity duration-[750ms] ease-out ${
            isExpanding ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div 
          className={`absolute inset-0 z-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.38)_0%,rgba(244,242,238,0.22)_50%,rgba(255,255,255,0.42)_100%)] transition-opacity duration-[750ms] ease-out ${
            isExpanding ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* ─── INTERACTIVE ANGULAR GLASS REFLECTION BORDER (STRICTLY TO THE EDGE) ─── */}
        <div 
          className="pointer-events-none absolute -inset-[1px] rounded-[33px] z-30 overflow-hidden" 
          aria-hidden="true"
        >
          {/* Base Chiseled Angular Glass Edge */}
          <div 
            className="absolute inset-0 rounded-[33px]" 
            style={{
              padding: '1.4px',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 25%, rgba(17,17,17,0.06) 50%, rgba(255,255,255,0.3) 75%, rgba(255,255,255,0.85) 100%)',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
        </div>

        {/* Inner Content Grid */}
        <div className={`relative z-10 grid h-full lg:grid-cols-[1.18fr_0.82fr] transition-opacity duration-300 ${
          isExpanding ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          {/* Left Hero Section */}
          <div className="relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between border-r border-black/10 bg-[radial-gradient(circle_at_top_left,_rgba(255,128,0,0.12),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(32,97,255,0.12),_transparent_28%),linear-gradient(135deg,#f3f3f0_0%,#e7efe9_40%,#edf1f4_100%)]">
            <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.28), rgba(255,255,255,0.02))' }} />
            
            <div className="relative z-10">
              {/* Left Section 3 (Top): Logo & Title */}
              <div 
                className={`mb-8 flex items-center gap-3 ${
                  isFading 
                    ? 'animate-login-exit pointer-events-none' 
                    : (justLoggedOut && animPhase === 'locking' ? 'animate-login-enter' : '')
                }`}
                style={{ animationDelay: isFading ? '200ms' : '0ms' }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-black/10 bg-white shadow-[0_10px_22px_rgba(17,17,17,0.08)]">
                  <Sparkles className="h-5 w-5 text-[#ff8000]" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#686868]">Zentra Platform</div>
                  <div className="text-2xl font-semibold tracking-[-0.06em]">{title}</div>
                </div>
              </div>

              {/* Left Section 2 (Middle): Hero Content */}
              <div 
                className={`space-y-5 pt-8 ${
                  isFading 
                    ? 'animate-login-exit pointer-events-none' 
                    : (justLoggedOut && animPhase === 'locking' ? 'animate-login-enter' : '')
                }`}
                style={{ animationDelay: '100ms' }}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d9e4dd] bg-white/80 px-3 py-1.5 text-[11px] font-medium text-[#4d4d4d] shadow-[0_8px_18px_rgba(0,0,0,0.04)] cursor-default">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Enterprise Grade
                </div>

                <h1 className="max-w-xl text-5xl leading-[1] tracking-[-0.04em] font-[550] text-[#111111]">
                  Manage your entire business in one place.
                </h1>

                <p className="max-w-lg text-base leading-7 text-[#4b4b4b]">
                  Finance, product, analytics, and intelligence unified securely.
                </p>
              </div>
            </div>

            {/* Left Section 2 (Middle): Feature Cards */}
            <div 
              className={`relative z-10 grid gap-3 lg:grid-cols-3 ${
                isFading 
                  ? 'animate-login-exit pointer-events-none' 
                  : (justLoggedOut && animPhase === 'locking' ? 'animate-login-enter' : '')
              }`}
              style={{ animationDelay: '100ms' }}
            >
              {[
                ['Billing', 'Live invoices & cashflow'],
                ['Products', 'Inventory & variants'],
                ['Analytics', 'KPI tracking'],
              ].map(([heading, caption]) => (
                <div key={heading} className="rounded-2xl border border-black/10 bg-white/85 p-3 shadow-[0_14px_28px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-transform hover:-translate-y-1 hover:shadow-lg cursor-default">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[#6a6a6a]">{heading}</div>
                  <div className="text-sm font-medium text-[#3c3c3c]">{caption}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Form Section */}
          <div className="flex items-center justify-center p-6 sm:p-8 lg:p-9 relative z-10">
            <div className="w-full max-w-[460px]">
              {/* Right Section 3 (Top): Header & Lock Icon */}
              <div 
                className={`mb-5 flex items-center justify-between ${
                  isFading 
                    ? 'animate-login-exit pointer-events-none' 
                    : (justLoggedOut && animPhase === 'locking' ? 'animate-login-enter' : '')
                }`}
                style={{ animationDelay: isFading ? '200ms' : '0ms' }}
              >
                <div>
                  <div className={`text-[11px] uppercase tracking-[0.18em] transition-colors duration-500 ${isUnlocked ? 'text-emerald-600 font-semibold' : 'text-[#6b6b6b]'}`}>
                    {isUnlocked ? 'Access Granted' : 'Authentication'}
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] transition-colors duration-500">
                    {isUnlocked ? 'Welcome' : 'Welcome back'}
                  </h2>
                </div>

                {/* Animated Lock Badge: Springs into unlocked state with emerald glow */}
                <div 
                  className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    isUnlocked
                      ? 'bg-[#111111] text-emerald-400 ring-2 ring-emerald-500/40 shadow-[0_0_32px_rgba(16,185,129,0.35)] scale-110'
                      : 'bg-[#111111] text-white shadow-[0_12px_24px_rgba(17,17,17,0.18)]'
                  }`}
                  aria-label={isUnlocked ? 'Unlocked' : 'Locked'}
                >
                  {/* Closed Lock Keyhole */}
                  <div 
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-400 ease-in-out ${
                      isUnlocked 
                        ? 'opacity-0 scale-75 -rotate-12 pointer-events-none' 
                        : 'opacity-100 scale-100 rotate-0'
                    }`}
                  >
                    <LockKeyhole className="h-5 w-5" />
                  </div>

                  {/* Open Unlock Keyhole */}
                  <div 
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                      isUnlocked 
                        ? 'opacity-100 scale-105 rotate-0 text-emerald-400' 
                        : 'opacity-0 scale-50 rotate-12 pointer-events-none'
                    }`}
                  >
                    <UnlockKeyhole className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Right Section 2 (Middle): Accounts Picker */}
              {accounts.length > 0 && (
                <div 
                  className={`mb-5 rounded-[24px] border border-black/10 bg-white/80 p-3 shadow-[0_12px_24px_rgba(0,0,0,0.05)] ${
                    isFading 
                      ? 'animate-login-exit pointer-events-none' 
                      : (justLoggedOut && animPhase === 'locking' ? 'animate-login-enter' : '')
                  }`}
                  style={{ animationDelay: '100ms' }}
                >
                  <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[#6b6b6b]">
                    <span>Accounts</span>
                    <button type="button" onClick={addNewUser} className="inline-flex items-center gap-1 font-medium text-[#1d5cff] transition hover:text-[#0f46c5] active:scale-95">
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
                          className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition-all active:scale-[0.98] ${
                            active
                              ? 'border-[#1d5cff] bg-[#eef4ff] shadow-[0_10px_20px_rgba(29,92,255,0.12)] ring-2 ring-[#1d5cff]/20 ring-offset-1'
                              : 'border-black/10 bg-[#f8f8f7] hover:bg-[#f2f4f4] hover:shadow-sm'
                          }`}
                        >
                          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#dfeaf9] to-[#bed0ff] text-[11px] font-semibold text-[#203261]">
                            {account.displayPicture ? (
                              <img src={account.displayPicture} alt={account.displayName} className="h-full w-full object-cover" />
                            ) : (
                              <UserRound className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 pr-1">
                            <div className="truncate text-xs font-medium text-[#111111]">{account.displayName}</div>
                            <div className="truncate text-[10px] text-[#6a6a6a]">{account.role}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Right Section 2 (Middle): Form Container */}
              <form 
                onSubmit={handleSubmit} 
                className={`rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_18px_40px_rgba(0,0,0,0.05)] sm:p-7 ${
                  isFading 
                    ? 'animate-login-exit pointer-events-none' 
                    : (justLoggedOut && animPhase === 'locking' ? 'animate-login-enter' : '')
                }`}
                style={{ animationDelay: '100ms' }}
              >
                <div className="space-y-4">
                  <div className="relative group">
                    <label htmlFor="login-identifier" className="mb-2 block text-sm font-medium text-[#2f2f2f] transition-colors group-focus-within:text-[#1d5cff]">Username or email</label>
                    <input
                      id="login-identifier"
                      name="identifier"
                      value={selectedAccountId ? activeAccount?.identifier || identifier : identifier}
                      onChange={(event) => {
                        setSelectedAccountId(null);
                        setIdentifier(event.target.value);
                      }}
                      placeholder="faizal or you@company.com"
                      className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 text-[15px] outline-none transition-all duration-200 focus:border-[#1d5cff] focus:bg-white focus:ring-4 focus:ring-[#1d5cff]/10 hover:border-black/20"
                    />
                  </div>

                  <div className="relative group">
                    <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[#2f2f2f] transition-colors group-focus-within:text-[#1d5cff]">Password</label>
                    <div className="relative">
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 pr-12 text-[15px] outline-none transition-all duration-200 focus:border-[#1d5cff] focus:bg-white focus:ring-4 focus:ring-[#1d5cff]/10 hover:border-black/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-3 flex items-center text-[#666666] hover:text-[#111111] transition-transform active:scale-90"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-1 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between gap-3 text-sm text-[#5f5f5f]">
                  <label htmlFor="remember-device" className="inline-flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        id="remember-device"
                        name="rememberDevice"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                        className="peer h-4 w-4 appearance-none rounded border border-black/20 bg-[#f8f8f7] checked:border-[#1d5cff] checked:bg-[#1d5cff] transition-all"
                      />
                      <svg className="absolute left-0 top-0 h-4 w-4 pointer-events-none opacity-0 peer-checked:opacity-100 text-white transition-opacity stroke-white stroke-[3] fill-none p-0.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span className="transition-colors group-hover:text-[#111] group-active:text-[#111]">Remember this device</span>
                  </label>
                  <button type="button" className="font-medium text-[#1d5cff] hover:text-[#0f46c5] transition-colors active:scale-95">
                    Need help?
                  </button>
                </div>
              </form>
              
              {/* Right Section 1 (Bottom): Action Button & Footer */}
              <div 
                className={`${
                  isFading 
                    ? 'animate-login-exit pointer-events-none' 
                    : (justLoggedOut && animPhase === 'locking' ? 'animate-login-enter' : '')
                }`}
                style={{ animationDelay: isFading ? '0ms' : '200ms' }}
              >
                <button
                  type="submit"
                  onClick={handleSubmit}
                  disabled={loading || animPhase !== 'idle'}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[15px] font-medium text-white transition-all active:scale-[0.98] hover:bg-[#1a1a1a] hover:shadow-[0_8px_16px_rgba(17,17,17,0.2)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 disabled:hover:shadow-none"
                >
                  {loading || animPhase !== 'idle' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <div className="mt-5 flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[#666666]">
                  <MonitorSmartphone className="h-3.5 w-3.5" />
                  Secure access
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

