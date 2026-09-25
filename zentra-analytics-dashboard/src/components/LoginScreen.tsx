import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  MonitorSmartphone,
  Plus,
  ShieldCheck,
  UserRound,
  Loader2,
  Fingerprint,
} from 'lucide-react';
import {
  getRememberedAccounts,
  loginWithPassword,
  saveRememberedAccount,
  removeRememberedAccount,
  saveSession,
  setActiveRememberedAccount,
  fetchSecurityChallenge,
  verifySecurityAnswer,
  updatePasswordAfterRecovery,
  fetchGoogleConfig,
  loginWithGoogle,
  isPasskeySupported,
  authenticateWithPasskey,
  registerPasskey,
  checkAccountHasPasskey,
  RememberedAccount,
} from '../lib/auth';
import { BrandLogo } from './common/BrandLogo';
import { RollingCounter } from './RollingCounter';

interface LoginScreenProps {
  onAuthenticated: (user: any) => void;
  justLoggedOut?: boolean;
  onStartMatrixDraw?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ 
  onAuthenticated, 
  justLoggedOut = false,
  onStartMatrixDraw,
}) => {
  // Inherit progress from static inline preloader if present
  const initialProgress = typeof window !== 'undefined' && (window as any).__ZENTRA_LOADER__
    ? (window as any).__ZENTRA_LOADER__.getProgress()
    : 0;

  const [loadingProgress, setLoadingProgress] = useState(initialProgress);
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('faizal');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── INLINE PANEL MODES (Zero Modals! Native In-Card Transitions) ───
  const [panelMode, setPanelMode] = useState<
    'login' | 'forgot-password' | 'google-link' | 'worker-pending' | 'passkey-setup'
  >('login');

  // Input refs for mouseless focus advancement
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Right-click account deletion confirmation (inline bubble keyed by account key)
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  // Forgot password multi-step state
  const [recoveryStep, setRecoveryStep] = useState<1 | 2 | 3>(1);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState<string | null>(null);
  const [hasSecurityQuestion, setHasSecurityQuestion] = useState(true);
  const [isRecoveryKey, setIsRecoveryKey] = useState(false);
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  // Passkey availability & inline post-auth setup
  const passkeyHardwareSupported = useMemo(() => isPasskeySupported(), []);
  const [hasPasskeyConfigured, setHasPasskeyConfigured] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [pendingAuthSession, setPendingAuthSession] = useState<{
    user: any;
    session: any;
    identifier: string;
  } | null>(null);
  const [setupPasskeyLoading, setSetupPasskeyLoading] = useState(false);
  const [setupPasskeyError, setSetupPasskeyError] = useState('');

  // Google OAuth linking / pending state
  const [googleLinkingEmail, setGoogleLinkingEmail] = useState('');
  const [googleLinkPassword, setGoogleLinkPassword] = useState('');
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<string | null>(null);
  const [workerInviteCode, setWorkerInviteCode] = useState('');

  // Website initial load starts in 'website-loading'
  const [animPhase, setAnimPhase] = useState<
    'website-loading' | 'counter-exit' | 'expanding-to-login' | 'idle' | 'unlocking' | 'fading-out' | 'expanding' | 'locking'
  >(justLoggedOut ? 'locking' : 'website-loading');

  const [mousePos, setMousePos] = useState({ x: 0, y: 0, opacity: 0 });

  // ─── INSTANT HANDOVER: REMOVE STATIC HTML PRELOADER ON REACT MOUNT ───
  useEffect(() => {
    const loader = (window as any).__ZENTRA_LOADER__;
    if (loader) {
      if (typeof loader.stop === 'function') loader.stop();
      delete (window as any).__ZENTRA_LOADER__;
      const el = document.getElementById('zentra-preloader');
      if (el) el.remove();
    }
  }, []);

  // ─── 3-DIGIT ROLLING COUNTER PROGRESSION ───
  useEffect(() => {
    if (animPhase !== 'website-loading') return;

    let current = loadingProgress;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      current += 1;
      setLoadingProgress(current);

      if (current < 100) {
        let delay = 24;
        if (current > 96) delay = 140;
        else if (current > 90) delay = 85;
        else if (current > 78) delay = 48;
        else if (current > 55) delay = 32;

        timer = setTimeout(tick, delay);
      } else {
        timer = setTimeout(() => {
          setAnimPhase('counter-exit');
        }, 420);
      }
    };

    timer = setTimeout(tick, current === 0 ? 80 : 20);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [animPhase]);

  // ─── POST-LOADER TRANSITION: EXIT COUNTER -> EXPAND CARD & DRAW MATRIX -> IDLE ───
  useEffect(() => {
    if (animPhase === 'counter-exit') {
      const timer = setTimeout(() => {
        setAnimPhase('expanding-to-login');
        onStartMatrixDraw?.();
      }, 300);
      return () => clearTimeout(timer);
    }

    if (animPhase === 'expanding-to-login') {
      const timer = setTimeout(() => {
        setAnimPhase('idle');
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [animPhase, onStartMatrixDraw]);

  // ─── INITIALIZE NATIVE GOOGLE SIGN-IN BUTTON ───
  useEffect(() => {
    if (panelMode !== 'login') return;
    let isMounted = true;

    async function initGoogle() {
      if (typeof window === 'undefined' || !(window as any).google?.accounts?.id) return;
      try {
        const config = await fetchGoogleConfig();
        if (!config?.clientId || !isMounted) return;

        (window as any).google.accounts.id.initialize({
          client_id: config.clientId,
          callback: async (res: any) => {
            if (!res?.credential) return;
            setLoading(true);
            setError('');
            try {
              const result = await loginWithGoogle(res.credential);
              if (result.status === 409 && result.requiresLinking) {
                setPendingGoogleCredential(res.credential);
                setGoogleLinkingEmail(result.email || '');
                setPanelMode('google-link');
              } else if (result.status === 'pending') {
                setWorkerInviteCode(result.inviteCode || '');
                setPanelMode('worker-pending');
              } else if (result.user) {
                handlePostAuthCheck(result.user, result, result.user.email || result.user.username);
              }
            } catch (err: any) {
              setError(err.message || 'Google sign-in failed');
            } finally {
              setLoading(false);
            }
          },
          auto_select: false,
          use_fedcm_for_prompt: false,
        });

        if (googleBtnContainerRef.current) {
          googleBtnContainerRef.current.innerHTML = '';
          const container = googleBtnContainerRef.current;
          const buttonWidth = Math.floor(container.getBoundingClientRect().width || 380);
          (window as any).google.accounts.id.renderButton(container, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            width: buttonWidth > 0 ? buttonWidth : 380,
          });
        }
      } catch (e) {
        console.warn('Google init failed:', e);
      }
    }

    const timer = setTimeout(initGoogle, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [panelMode, hasPasskeyConfigured]);

  // ─── REUSE MACOS QR CODE GENERATOR FOR WORKER PENDING ───
  useEffect(() => {
    if (panelMode === 'worker-pending' && workerInviteCode) {
      if ((window as any).QRCode && qrCanvasRef.current) {
        try {
          (window as any).QRCode.toCanvas(qrCanvasRef.current, workerInviteCode, {
            width: 160,
            margin: 1,
            color: { dark: '#111111', light: '#ffffff' },
            errorCorrectionLevel: 'H'
          });
        } catch (err) {
          console.warn('QRCode toCanvas error:', err);
        }
      }
    }
  }, [panelMode, workerInviteCode]);

  // ─── POLL WORKER APPROVAL STATUS ───
  useEffect(() => {
    if (panelMode !== 'worker-pending') return;
    let timer: NodeJS.Timeout | null = null;
    let cancelled = false;

    async function checkStatus() {
      try {
        const res = await fetch('/api/auth/worker/status');
        if (res.ok) {
          const data = await res.json();
          if (data.approved && !cancelled) {
            if (pendingGoogleCredential) {
              const loginResult = await loginWithGoogle(pendingGoogleCredential);
              if (loginResult.user) {
                handlePostAuthCheck(loginResult.user, loginResult, loginResult.user.email || loginResult.user.username);
                return;
              }
            }
          }
        }
      } catch (e) {}
      if (!cancelled) {
        timer = setTimeout(checkStatus, 4000);
      }
    }

    timer = setTimeout(checkStatus, 4000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [panelMode, pendingGoogleCredential]);

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

  useEffect(() => {
    if (justLoggedOut) {
      setAnimPhase('locking');
      // Show locking animation for 1.9s (allowing entrance blur to complete and leaving the red lock & signed out message clearly visible for ~1.4s), then settle to idle
      const timer = setTimeout(() => {
        setAnimPhase('idle');
      }, 1900);
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

  // ─── CHECK IF CURRENT ACCOUNT HAS PASSKEY CONFIGURED ───
  useEffect(() => {
    if (!passkeyHardwareSupported) {
      setHasPasskeyConfigured(false);
      return;
    }

    if (activeAccount?.isTouchIdEnabled) {
      setHasPasskeyConfigured(true);
      return;
    }

    if (localStorage.getItem('touchIdEnabled') === 'true') {
      setHasPasskeyConfigured(true);
      return;
    }

    const idToCheck = activeAccount ? activeAccount.identifier : identifier.trim();
    if (!idToCheck) {
      setHasPasskeyConfigured(false);
      return;
    }

    let isMounted = true;
    checkAccountHasPasskey(idToCheck).then((available) => {
      if (isMounted) setHasPasskeyConfigured(available);
    });

    return () => {
      isMounted = false;
    };
  }, [selectedAccountId, identifier, activeAccount, passkeyHardwareSupported]);

  // Lock body scroll while lock screen is active — the card is
  // fully contained in h-[100dvh] so there is nothing to scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Also hide the webkit scrollbar just in case
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'zentra-lock-no-scrollbar';
    style.textContent = 'body::-webkit-scrollbar{display:none!important}';
    document.head.appendChild(style);
    return () => { document.getElementById('zentra-lock-no-scrollbar')?.remove(); };
  }, []);

  // ─── UNIFIED SUCCESSFUL LOGIN TRANSITION ───
  function animateAndAuthenticate(user: any) {
    setAnimPhase('unlocking');
    setTimeout(() => {
      setAnimPhase('fading-out');
      setTimeout(() => {
        setAnimPhase('expanding');
        setTimeout(() => {
          onAuthenticated(user);
        }, 750);
      }, 550);
    }, 350);
  }

  // ─── FINALIZE AUTHENTICATION & SAVE STATE ───
  function finalizeAuth(user: any, session: any, id: string, touchId = false) {
    if (rememberMe) {
      saveRememberedAccount(user, id, touchId);
    }
    setActiveRememberedAccount(activeAccount?.id || `${Date.now()}`);
    saveSession(session);
    animateAndAuthenticate(user);
  }

  // ─── POST-AUTH PASSKEY CHECK: PROMPT IF NOT YET CONFIGURED ───
  function handlePostAuthCheck(user: any, session: any, id: string) {
    const userAlreadyHasPasskey = hasPasskeyConfigured || localStorage.getItem('touchIdEnabled') === 'true';
    if (!userAlreadyHasPasskey && passkeyHardwareSupported) {
      setPendingAuthSession({ user, session, identifier: id });
      setPanelMode('passkey-setup');
      setLoading(false);
    } else {
      finalizeAuth(user, session, id, userAlreadyHasPasskey);
    }
  }

  // ─── PASSWORD LOGIN SUBMIT ───
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

      handlePostAuthCheck(user, { ...data, user }, loginIdentifier);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
      setLoading(false);
    }
  }

  // ─── PASSKEY LOGIN ───
  async function handlePasskeySignIn() {
    setError('');
    setPasskeyLoading(true);
    const loginIdentifier = activeAccount ? activeAccount.identifier : identifier.trim();

    try {
      const data = await authenticateWithPasskey(loginIdentifier);
      if (data.user) {
        finalizeAuth(data.user, data, loginIdentifier, true);
      }
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        setError(err.message || 'Passkey authentication failed');
      }
    } finally {
      setPasskeyLoading(false);
    }
  }

  // ─── PASSKEY INLINE SETUP SUBMISSION ───
  async function handleCreatePasskeyFromSetup() {
    if (!pendingAuthSession) return;
    setSetupPasskeyLoading(true);
    setSetupPasskeyError('');
    try {
      await registerPasskey(pendingAuthSession.session?.token);
      localStorage.setItem('touchIdEnabled', 'true');
      finalizeAuth(pendingAuthSession.user, pendingAuthSession.session, pendingAuthSession.identifier, true);
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        setSetupPasskeyError(err.message || 'Passkey setup could not be completed.');
      }
      setSetupPasskeyLoading(false);
    }
  }

  function handleSkipPasskeySetup() {
    if (!pendingAuthSession) return;
    finalizeAuth(pendingAuthSession.user, pendingAuthSession.session, pendingAuthSession.identifier, false);
  }

  // ─── RIGHT-CLICK ACCOUNT REMOVAL (Zero Modals!) ───
  function handleRemoveAccount(accountId: string) {
    const nextAccounts = removeRememberedAccount(accountId);
    setAccounts(nextAccounts);
    if (selectedAccountId === accountId) {
      if (nextAccounts.length > 0) {
        setSelectedAccountId(nextAccounts[0].id);
        setIdentifier(nextAccounts[0].identifier);
      } else {
        setSelectedAccountId(null);
        setIdentifier('');
      }
    }
    setAccountToDelete(null);
  }

  function chooseAccount(account: RememberedAccount) {
    setSelectedAccountId(account.id);
    setIdentifier(account.identifier);
    setError('');
  }

  function addNewUser() {
    setSelectedAccountId(null);
    setIdentifier('');
    setPassword('');
    setError('');
    identifierRef.current?.focus();
  }

  // ─── FORGOT PASSWORD HANDLERS ───
  async function handleRecoveryIdentifierSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recoveryIdentifier.trim()) {
      setRecoveryError('Please enter your username or email');
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      const challenge = await fetchSecurityChallenge(recoveryIdentifier);
      const questionExists = Boolean(challenge.question && !challenge.isRecoveryKey);
      setHasSecurityQuestion(questionExists);
      setRecoveryQuestion(challenge.question || null);
      setIsRecoveryKey(!questionExists);
      setRecoveryStep(2);
    } catch (err: any) {
      setRecoveryError(err.message || 'Account not found with this username or email');
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleRecoveryAnswerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recoveryAnswer.trim()) {
      setRecoveryError(isRecoveryKey ? 'Please enter your recovery key' : 'Please enter your secret answer');
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      await verifySecurityAnswer(recoveryIdentifier, recoveryAnswer, isRecoveryKey);
      setRecoveryStep(3);
    } catch (err: any) {
      setRecoveryError(err.message || 'Incorrect credentials. Please try again.');
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handlePasswordResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) {
      setRecoveryError('Please enter a new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setRecoveryError('Passwords do not match');
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      await updatePasswordAfterRecovery(newPassword, recoveryIdentifier);
      // Auto-login with new password
      const data = await loginWithPassword(recoveryIdentifier, newPassword);
      if (data.user) {
        finalizeAuth(data.user, data, recoveryIdentifier);
      }
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to update password');
      setRecoveryLoading(false);
    }
  }

  // ─── GOOGLE LINK ACCOUNT SUBMIT ───
  async function handleGoogleLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!googleLinkPassword.trim() || !pendingGoogleCredential) {
      setError('Please enter your account password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await loginWithGoogle(pendingGoogleCredential, googleLinkPassword);
      if (result.user) {
        handlePostAuthCheck(result.user, result, googleLinkingEmail);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to link account');
    } finally {
      setLoading(false);
    }
  }

  const isWebsiteLoading = animPhase === 'website-loading' || animPhase === 'counter-exit';
  const isExpandingToLogin = animPhase === 'expanding-to-login';
  const isLocking = animPhase === 'locking';
  const isUnlocked = animPhase === 'unlocking' || animPhase === 'fading-out' || animPhase === 'expanding';
  const isFading = animPhase === 'fading-out' || animPhase === 'expanding';
  const isExpanding = animPhase === 'expanding';

  const getDropClass = (tier: 1 | 2 | 3 | 4 | 5) => {
    if (isFading) return 'animate-login-exit pointer-events-none';
    if (isExpandingToLogin || (justLoggedOut && animPhase === 'locking')) {
      return `animate-login-drop-${tier}`;
    }
    return '';
  };

  return (
    <div 
      className={`min-h-[100dvh] w-full flex items-center justify-center transition-all duration-[750ms] ease-[cubic-bezier(0.16,1,0.3,1)] bg-transparent ${
        isExpanding ? 'p-2 sm:p-3 lg:p-4' : 'p-4 sm:p-5 lg:p-6'
      }`}
      style={{ height: '100dvh', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div 
        className={`w-full transition-all duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] relative rounded-[32px] sm:rounded-[36px] overflow-hidden backdrop-blur-[24px] sm:backdrop-blur-[28px] backdrop-saturate-[180%] border border-white/80 ${
          isWebsiteLoading
            ? 'max-w-[560px] sm:max-w-[620px] min-h-[260px] sm:min-h-[300px] shadow-[0_24px_64px_-16px_rgba(17,17,17,0.18),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_2px_4px_rgba(0,0,0,0.02)]'
            : isExpanding 
              ? 'max-w-[1760px] min-h-[calc(100dvh-16px)] sm:min-h-[calc(100dvh-24px)] lg:min-h-[calc(100dvh-32px)] shadow-[0_28px_80px_-20px_rgba(17,17,17,0.16),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_2px_4px_rgba(0,0,0,0.02)]' 
              : 'max-w-[1280px] flex flex-col shadow-[0_28px_80px_-20px_rgba(17,17,17,0.16),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_2px_4px_rgba(0,0,0,0.02)]'
        }`}
        style={
          isWebsiteLoading
            ? undefined
            : isExpanding
              ? { height: 'calc(100dvh - 32px)', maxHeight: 'calc(100dvh - 32px)' }
              : { height: 'min(720px, calc(100dvh - 32px))', maxHeight: 'min(720px, calc(100dvh - 32px))' }
        }
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

        {/* ─── INTERACTIVE ANGULAR GLASS REFLECTION BORDER ─── */}
        <div 
          className="pointer-events-none absolute -inset-[1px] rounded-[33px] sm:rounded-[37px] z-30 overflow-hidden" 
          aria-hidden="true"
        >
          <div 
            className="absolute inset-0 rounded-[33px] sm:rounded-[37px]" 
            style={{
              padding: '1.4px',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 25%, rgba(17,17,17,0.06) 50%, rgba(255,255,255,0.3) 75%, rgba(255,255,255,0.85) 100%)',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
        </div>

        {/* ─── PURE MINIMALIST RECTANGLE LOADING BOX ─── */}
        {isWebsiteLoading && (
          <div className={`relative z-20 flex items-center justify-center min-h-[260px] sm:min-h-[300px] transition-all duration-300 ease-out ${
            animPhase === 'counter-exit' ? 'opacity-0 -translate-y-4 scale-95 pointer-events-none' : 'opacity-100 translate-y-0 scale-100'
          }`}>
            <RollingCounter value={loadingProgress} />
          </div>
        )}

        {/* Inner Content Grid */}
        <div className={`relative z-10 grid flex-1 min-h-0 lg:grid-cols-[1.18fr_0.82fr] transition-opacity duration-300 ${
          isExpanding || isWebsiteLoading ? 'opacity-0 pointer-events-none hidden' : 'opacity-100'
        }`}>
          {/* Left Hero Section: Official Dashboard Brand & Business Summary */}
          <div className="relative hidden overflow-hidden p-8 lg:p-12 lg:flex lg:flex-col lg:justify-between border-r border-black/10 bg-[radial-gradient(circle_at_top_left,_rgba(255,128,0,0.12),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(32,97,255,0.12),_transparent_28%),linear-gradient(135deg,#f3f3f0_0%,#e7efe9_40%,#edf1f4_100%)]">
            <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.28), rgba(255,255,255,0.02))' }} />
            
            <div className="relative z-10">
              {/* Exact Dashboard Pill Shell */}
              <div 
                className={`mb-6 flex items-center gap-2.5 rounded-[16px] border border-black/[0.08] bg-white/85 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_2px_8px_rgba(0,0,0,0.04)] w-fit backdrop-blur-md ${getDropClass(1)}`}
                style={{ animationDelay: isFading ? '200ms' : undefined }}
              >
                <BrandLogo size={28} />
              </div>

              <div 
                className={`max-w-md ${getDropClass(2)}`}
                style={{ animationDelay: isFading ? '100ms' : undefined }}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-medium text-[#2d2d2d] backdrop-blur-md mb-4">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#ff8000]" />
                  Enterprise Grade
                </div>
                <h1 className="text-3xl font-semibold tracking-[-0.05em] text-[#111111] sm:text-4xl lg:text-5xl">
                  Operate the entire business from one extraordinary dashboard.
                </h1>
                <p className="mt-4 max-w-lg text-base leading-7 text-[#4b4b4b]">
                  Unified finance, product, customer, analytics, AI intelligence, notes, and reminders inside one hardened workspace.
                </p>
              </div>
            </div>

            {/* Bottom 3 Cards Matching Original Git Version with Hover Movement */}
            <div 
              className={`relative z-10 grid gap-3 lg:grid-cols-3 pt-6 lg:pt-8 ${getDropClass(3)}`}
              style={{ animationDelay: isFading ? '0ms' : undefined }}
            >
              {[
                ['Billing', 'Live invoices & cashflow'],
                ['Products', 'Inventory & variants'],
                ['Analytics', 'KPI intelligence'],
              ].map(([heading, caption]) => (
                <div 
                  key={heading} 
                  className="rounded-2xl border border-black/10 bg-white/85 p-3 shadow-[0_14px_28px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_18px_36px_rgba(0,0,0,0.08)] hover:bg-white cursor-pointer select-none"
                >
                  <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[#6a6a6a] font-medium">{heading}</div>
                  <div className="text-sm text-[#3c3c3c]">{caption}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Interactive Form Section */}
          <div
            className="relative z-10 flex-1 min-h-0 overflow-y-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            <style>{`.zentra-form-panel::-webkit-scrollbar{display:none}`}</style>
            <div className="zentra-form-panel flex min-h-full items-center justify-center p-6 sm:p-8 lg:p-9">
            <div className="w-full max-w-[460px]">
              
              {/* Header & Animated Lock Keyhole (Exact Git Dimensions) */}
              <div 
                className={`mb-5 flex items-center justify-between ${getDropClass(1)}`}
                style={{ animationDelay: isFading ? '200ms' : undefined }}
              >
                <div>
                  <div className={`text-[11px] uppercase tracking-[0.18em] transition-colors duration-500 ${
                    isLocking ? 'text-red-500 font-semibold' : isUnlocked ? 'text-emerald-600 font-semibold' : 'text-[#6b6b6b]'
                  }`}>
                    {isLocking ? 'Session Secured' : isUnlocked ? 'Access Granted' : 'Authentication'}
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] transition-colors duration-500 text-[#111111]">
                    {isLocking ? 'Signed Out' : isUnlocked ? 'Welcome' : panelMode === 'login' ? 'Welcome back' : panelMode === 'forgot-password' ? 'Password Recovery' : panelMode === 'google-link' ? 'Link Google Account' : panelMode === 'worker-pending' ? 'Approval Required' : 'Fast Biometric Access'}
                  </h2>
                </div>

                {/* Animated Lock Badge: Red locking on logout, springs to emerald on login */}
                <div 
                  className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    isLocking
                      ? 'bg-red-600 text-white ring-2 ring-red-500/60 shadow-[0_0_28px_rgba(220,38,38,0.6)] scale-110 zentra-lock-badge-pulse'
                      : isUnlocked
                        ? 'bg-[#111111] text-emerald-400 ring-2 ring-emerald-500/40 shadow-[0_0_32px_rgba(16,185,129,0.35)] scale-110'
                        : 'bg-[#111111] text-white shadow-[0_12px_24px_rgba(17,17,17,0.18)]'
                  }`}
                  aria-label={isLocking ? 'Session Locked' : isUnlocked ? 'Unlocked' : 'Locked'}
                >
                  {/* Locking state: red pulsing lock that snaps shut */}
                  <div 
                    className={`absolute inset-0 flex items-center justify-center ${
                      isLocking ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    <LockKeyhole className="h-5 w-5 text-white zentra-locking-snap" />
                  </div>

                  {/* Idle / normal locked state */}
                  <div 
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-400 ease-in-out ${
                      isUnlocked || isLocking ? 'opacity-0 scale-75 -rotate-12 pointer-events-none' : 'opacity-100 scale-100 rotate-0'
                    }`}
                  >
                    <LockKeyhole className="h-5 w-5" />
                  </div>

                  {/* Unlocked (login success) state */}
                  <div 
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                      isUnlocked && !isLocking ? 'opacity-100 scale-105 rotate-0 text-emerald-400' : 'opacity-0 scale-50 rotate-12 pointer-events-none'
                    }`}
                  >
                    <UnlockKeyhole className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* ═════════════════════════════════════════════════════════════
                  MODE 1: MAIN LOGIN FORM
                 ═════════════════════════════════════════════════════════════ */}
              {panelMode === 'login' && (
                <>
                  {/* Backdrop for click-outside dismissal on right-click bubble */}
                  {accountToDelete && (
                    <div 
                      className="fixed inset-0 z-30 cursor-default" 
                      onClick={() => setAccountToDelete(null)}
                    />
                  )}

                  {/* Accounts Picker with Right-Click Context Deletion (Exact Git Dimensions) */}
                  {accounts.length > 0 && (
                    <div 
                      className={`mb-5 rounded-[24px] border border-black/10 bg-white/80 p-3 shadow-[0_12px_24px_rgba(0,0,0,0.05)] backdrop-blur-md ${getDropClass(2)}`}
                      style={{ animationDelay: isFading ? '100ms' : undefined }}
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
                          const accountKey = account.id || account.identifier;
                          return (
                            <div key={accountKey} className="relative z-30">
                              <button
                                type="button"
                                onClick={() => chooseAccount(account)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setAccountToDelete(accountKey === accountToDelete ? null : accountKey);
                                }}
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

                              {/* Inline Right-Click Deletion Confirmation Bubble */}
                              {accountToDelete === accountKey && (
                                <div className="absolute left-0 -top-11 z-40 flex items-center gap-2 rounded-xl border border-red-200 bg-white/95 px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-md animate-in fade-in zoom-in-95">
                                  <span className="text-xs font-medium text-neutral-700 whitespace-nowrap">Remove?</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveAccount(account.id);
                                    }}
                                    className="rounded-lg bg-red-600 px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-red-700 active:scale-95"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAccountToDelete(null);
                                    }}
                                    className="rounded-lg bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-200 active:scale-95"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ─── THE ENCLOSED INPUT FIELDS BOX (Exact Git Dimensions & Screenshot Layout) ─── */}
                  <form 
                    onSubmit={handleSubmit}
                    className={`rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_18px_40px_rgba(0,0,0,0.05)] sm:p-7 backdrop-blur-md ${getDropClass(3)}`}
                    style={{ animationDelay: isFading ? '100ms' : undefined }}
                  >
                    <div className="space-y-4">
                      <div className="relative group">
                        <label htmlFor="login-identifier" className="mb-2 block text-sm font-medium text-[#2f2f2f] transition-colors group-focus-within:text-[#1d5cff]">
                          Username or email
                        </label>
                        <input
                          ref={identifierRef}
                          id="login-identifier"
                          name="identifier"
                          type="text"
                          value={selectedAccountId ? activeAccount?.identifier || identifier : identifier}
                          onChange={(event) => {
                            setSelectedAccountId(null);
                            setIdentifier(event.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              passwordRef.current?.focus();
                            }
                          }}
                          placeholder="faizal"
                          className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 text-[15px] outline-none transition-all duration-200 focus:border-[#1d5cff] focus:bg-white focus:ring-4 focus:ring-[#1d5cff]/10 hover:border-black/20"
                        />
                      </div>

                      <div className="relative group">
                        <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[#2f2f2f] transition-colors group-focus-within:text-[#1d5cff]">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            ref={passwordRef}
                            id="login-password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSubmit(e);
                              }
                            }}
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
                        <input
                          id="remember-device"
                          name="rememberDevice"
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(event) => setRememberMe(event.target.checked)}
                          className="h-4 w-4 accent-[#1d5cff] rounded"
                        />
                        <span className="transition-colors group-hover:text-[#111] group-active:text-[#111]">Remember this device</span>
                      </label>
                      <button 
                        type="button" 
                        onClick={() => {
                          setRecoveryIdentifier(selectedAccountId ? activeAccount?.identifier || identifier : identifier);
                          setPanelMode('forgot-password');
                          setRecoveryStep(1);
                          setRecoveryError('');
                        }}
                        className="font-medium text-[#1d5cff] hover:text-[#0f46c5] transition-colors active:scale-95"
                      >
                        Need help?
                      </button>
                    </div>
                  </form>

                  {/* ─── ACTION BUTTONS (Sign in + Google/Passkey + Footer outside form box) ─── */}
                  <div 
                    className="mt-5 space-y-3"
                    style={{ animationDelay: isFading ? '0ms' : undefined }}
                  >
                    {/* Primary Sign In Button (Exact Git Size) — Tier 4 */}
                    <div className={getDropClass(4)}>
                      <button
                        type="submit"
                        onClick={handleSubmit}
                        disabled={loading || animPhase !== 'idle'}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[15px] font-medium text-white transition-all active:scale-[0.98] hover:bg-[#1a1a1a] hover:shadow-[0_8px_16px_rgba(17,17,17,0.2)] disabled:cursor-not-allowed disabled:opacity-70 shadow-sm"
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
                    </div>

                    {/* Secondary Auth Methods Row: Google & Passkey — Tier 5 */}
                    <div className={getDropClass(5)}>

                    {/* Secondary Auth Methods Row: Google & Passkey */}
                    {passkeyHardwareSupported && hasPasskeyConfigured ? (
                      <div className="grid grid-cols-2 gap-3 items-center">
                        <div 
                          onClick={() => {
                            if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
                              (window as any).google.accounts.id.prompt();
                            }
                          }}
                          className="relative flex h-[46px] w-full items-center justify-center rounded-2xl border border-black/10 bg-white hover:bg-neutral-50 px-3 text-[14px] font-medium text-[#111111] transition-all shadow-sm active:scale-[0.98] cursor-pointer overflow-hidden"
                        >
                          <div className="pointer-events-none flex items-center justify-center gap-2">
                            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            <span className="truncate">Sign in with Google</span>
                          </div>
                          <div 
                            ref={googleBtnContainerRef} 
                            id="googleSignInButton" 
                            className="absolute inset-0 z-10 opacity-[0.001] cursor-pointer overflow-hidden flex items-center justify-center [&>div]:!w-full [&>div]:!h-full [&_iframe]:!w-full [&_iframe]:!h-full [&_iframe]:!scale-[1.8] [&_iframe]:!cursor-pointer"
                            title="Sign in with Google"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handlePasskeySignIn}
                          disabled={loading || passkeyLoading || animPhase !== 'idle'}
                          className="flex h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white hover:bg-neutral-50 px-3 text-[14px] font-medium text-[#111111] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                        >
                          {passkeyLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#1d5cff]" />
                          ) : (
                            <Fingerprint className="h-4 w-4 text-[#1d5cff] shrink-0" />
                          )}
                          <span className="truncate">Sign in with Passkey</span>
                        </button>
                      </div>
                    ) : (
                      <div 
                        onClick={() => {
                          if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
                            (window as any).google.accounts.id.prompt();
                          }
                        }}
                        className="relative flex h-[46px] w-full items-center justify-center rounded-2xl border border-black/10 bg-white hover:bg-neutral-50 px-3 text-[14px] font-medium text-[#111111] transition-all shadow-sm active:scale-[0.98] cursor-pointer overflow-hidden"
                      >
                        <div className="pointer-events-none flex items-center justify-center gap-2.5">
                          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                          <span>Sign in with Google</span>
                        </div>
                        <div 
                          ref={googleBtnContainerRef} 
                          id="googleSignInButton" 
                          className="absolute inset-0 z-10 opacity-[0.001] cursor-pointer overflow-hidden flex items-center justify-center [&>div]:!w-full [&>div]:!h-full [&_iframe]:!w-full [&_iframe]:!h-full [&_iframe]:!scale-[1.8] [&_iframe]:!cursor-pointer"
                          title="Sign in with Google"
                        />
                      </div>
                    )}

                    {/* Secure access outside at the bottom (Exact Git Size) */}
                    <div className="mt-4 flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[#666666]">
                      <MonitorSmartphone className="h-3.5 w-3.5" />
                      Secure access
                    </div>
                    </div>
                  </div>
                </>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  MODE 2: INLINE FORGOT PASSWORD RECOVERY (3 Steps In-Card)
                 ═════════════════════════════════════════════════════════════ */}
              {panelMode === 'forgot-password' && (
                <div className="rounded-[28px] border border-black/10 bg-white/85 p-6 sm:p-7 shadow-[0_12px_24px_rgba(0,0,0,0.04)] backdrop-blur-md min-h-[360px] flex flex-col justify-between animate-in fade-in">
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setPanelMode('login');
                          setRecoveryStep(1);
                          setRecoveryError('');
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] hover:text-[#111111] transition-colors"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to sign in
                      </button>
                      <span className="text-xs font-semibold text-[#1d5cff]">Step {recoveryStep} of 3</span>
                    </div>

                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-[#111111]">Account Recovery</h3>
                      <p className="text-xs text-[#666666] mt-0.5">
                        {recoveryStep === 1 && 'Enter your username or email to verify your identity'}
                        {recoveryStep === 2 && (isRecoveryKey ? 'Enter your emergency recovery key' : 'Answer your security question')}
                        {recoveryStep === 3 && 'Choose a new password for your account'}
                      </p>
                    </div>

                    {recoveryStep === 1 && (
                      <form onSubmit={handleRecoveryIdentifierSubmit} className="space-y-4">
                        <div>
                          <label className="mb-2 block text-sm text-[#2f2f2f]">Username or email</label>
                          <input
                            type="text"
                            value={recoveryIdentifier}
                            onChange={(e) => setRecoveryIdentifier(e.target.value)}
                            placeholder="faizal or you@company.com"
                            autoFocus
                            className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 text-[15px] outline-none transition-all duration-200 focus:border-[#1d5cff] focus:bg-white focus:ring-4 focus:ring-[#1d5cff]/10 hover:border-black/20"
                          />
                        </div>

                        {recoveryError && (
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {recoveryError}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={recoveryLoading}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[15px] font-medium text-white transition-all active:scale-[0.98] hover:bg-[#1a1a1a] shadow-sm disabled:opacity-50"
                        >
                          {recoveryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
                        </button>
                      </form>
                    )}

                    {recoveryStep === 2 && (
                      <form onSubmit={handleRecoveryAnswerSubmit} className="space-y-4">
                        <div className="rounded-2xl border border-blue-100 bg-[#f0f5ff] p-3 text-sm text-[#1e40af] font-medium">
                          {isRecoveryKey ? 'Account requires emergency recovery key' : recoveryQuestion}
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-[#2f2f2f]">
                            {isRecoveryKey ? 'Recovery key' : 'Your secret answer'}
                          </label>
                          <input
                            type="text"
                            value={recoveryAnswer}
                            onChange={(e) => setRecoveryAnswer(e.target.value)}
                            placeholder={isRecoveryKey ? 'Paste emergency recovery key' : 'Your answer'}
                            autoFocus
                            className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 text-[15px] outline-none transition-all duration-200 focus:border-[#1d5cff] focus:bg-white focus:ring-4 focus:ring-[#1d5cff]/10 hover:border-black/20"
                          />
                        </div>

                        {/* Toggle option only if security question exists on the account */}
                        {hasSecurityQuestion && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setIsRecoveryKey(!isRecoveryKey);
                                setRecoveryAnswer('');
                                setRecoveryError('');
                              }}
                              className="text-xs text-[#1d5cff] hover:text-[#0f46c5] transition-colors"
                            >
                              {isRecoveryKey ? 'Use security question instead' : "Can't answer? Use emergency recovery key"}
                            </button>
                          </div>
                        )}

                        {recoveryError && (
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {recoveryError}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={recoveryLoading}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[15px] font-medium text-white transition-all active:scale-[0.98] hover:bg-[#1a1a1a] shadow-sm disabled:opacity-50"
                        >
                          {recoveryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRecoveryKey ? 'Verify Recovery Key' : 'Verify Answer')}
                        </button>
                      </form>
                    )}

                    {recoveryStep === 3 && (
                      <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
                        <div>
                          <label className="mb-2 block text-sm text-[#2f2f2f]">New Password</label>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password"
                            autoFocus
                            className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 text-[15px] outline-none transition-all duration-200 focus:border-[#1d5cff] focus:bg-white focus:ring-4 focus:ring-[#1d5cff]/10 hover:border-black/20"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-[#2f2f2f]">Confirm Password</label>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 text-[15px] outline-none transition-all duration-200 focus:border-[#1d5cff] focus:bg-white focus:ring-4 focus:ring-[#1d5cff]/10 hover:border-black/20"
                          />
                        </div>

                        {recoveryError && (
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {recoveryError}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={recoveryLoading}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[15px] font-medium text-white transition-all active:scale-[0.98] hover:bg-[#1a1a1a] shadow-sm disabled:opacity-50"
                        >
                          {recoveryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set Password & Sign In'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  MODE 3: INLINE POST-AUTH PASSKEY SETUP
                 ═════════════════════════════════════════════════════════════ */}
              {panelMode === 'passkey-setup' && (
                <div className="rounded-[28px] border border-black/10 bg-white/85 p-6 sm:p-7 shadow-[0_12px_24px_rgba(0,0,0,0.04)] backdrop-blur-md min-h-[360px] flex flex-col justify-between animate-in fade-in">
                  <div className="text-center pt-2">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff8000]/10 text-[#ff8000] shadow-[0_8px_20px_rgba(255,128,0,0.18)]">
                      <Fingerprint className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-[#111111]">Enable Passkey Access</h3>
                    <p className="mt-2 text-sm text-[#666666] leading-relaxed max-w-[340px] mx-auto">
                      Authenticate instantly on this device using Touch ID, Windows Hello, or device biometrics. No passwords required.
                    </p>

                    {setupPasskeyError && (
                      <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {setupPasskeyError}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCreatePasskeyFromSetup}
                      disabled={setupPasskeyLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[15px] font-medium text-white transition-all active:scale-[0.98] hover:bg-[#1a1a1a] shadow-sm disabled:opacity-50"
                    >
                      {setupPasskeyLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Fingerprint className="h-4 w-4 text-[#ff8000]" />
                          Set Up Passkey
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSkipPasskeySetup}
                      disabled={setupPasskeyLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-[14px] font-medium text-[#666666] transition-all hover:bg-neutral-50 hover:text-[#111111] active:scale-[0.98]"
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  MODE 4: INLINE GOOGLE ACCOUNT LINKING
                 ═════════════════════════════════════════════════════════════ */}
              {panelMode === 'google-link' && (
                <div className="rounded-[28px] border border-black/10 bg-white/85 p-6 sm:p-7 shadow-[0_12px_24px_rgba(0,0,0,0.04)] backdrop-blur-md min-h-[360px] flex flex-col justify-between animate-in fade-in">
                  <div>
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => setPanelMode('login')}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] hover:text-[#111111] transition-colors"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to sign in
                      </button>
                    </div>
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-[#111111]">Link Google to Account</h3>
                      <p className="text-sm text-[#666666] mt-0.5">
                        Confirm password for <strong className="text-neutral-900">{googleLinkingEmail}</strong> to connect Google.
                      </p>
                    </div>
                    <form onSubmit={handleGoogleLinkSubmit} className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm text-[#2f2f2f]">Account Password</label>
                        <input
                          type="password"
                          value={googleLinkPassword}
                          onChange={(e) => setGoogleLinkPassword(e.target.value)}
                          placeholder="Enter your existing password"
                          autoFocus
                          className="w-full rounded-2xl border border-black/10 bg-[#f8f8f7] px-3.5 py-3 text-[15px] outline-none transition-all duration-200 focus:border-[#1d5cff] focus:bg-white focus:ring-4 focus:ring-[#1d5cff]/10 hover:border-black/20"
                        />
                      </div>
                      {error && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {error}
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-[15px] font-medium text-white transition-all active:scale-[0.98] hover:bg-[#1a1a1a] shadow-sm disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Link & Continue'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* ═════════════════════════════════════════════════════════════
                  MODE 5: INLINE WORKER PENDING APPROVAL QR VIEW
                 ═════════════════════════════════════════════════════════════ */}
              {panelMode === 'worker-pending' && (
                <div className="rounded-[28px] border border-black/10 bg-white/85 p-6 sm:p-7 shadow-[0_12px_24px_rgba(0,0,0,0.04)] backdrop-blur-md min-h-[360px] flex flex-col justify-between text-center animate-in fade-in">
                  <div>
                    <div className="mb-3 text-left">
                      <button
                        type="button"
                        onClick={() => setPanelMode('login')}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] hover:text-[#111111] transition-colors"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to sign in
                      </button>
                    </div>
                    <div className="mb-2">
                      <h3 className="text-base font-semibold text-[#111111]">Waiting for Approval</h3>
                      <p className="text-xs text-[#666666] mt-0.5">Share this invite code or scan the QR code with the administrator.</p>
                    </div>
                    <div className="my-3 font-mono text-xl font-bold tracking-[0.2em] text-[#111111] bg-[#f8f8f7] py-2 rounded-2xl border border-black/10">
                      {workerInviteCode}
                    </div>
                    <div className="my-3 flex justify-center">
                      <canvas ref={qrCanvasRef} className="rounded-2xl border border-black/10 p-2 bg-white shadow-sm" />
                    </div>
                    <div className="text-[11px] text-neutral-500 flex items-center justify-center gap-2 mt-3">
                      <Loader2 className="h-3 w-3 animate-spin text-[#1d5cff]" />
                      Polling approval status in real-time...
                    </div>
                  </div>
                </div>
              )}

            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
