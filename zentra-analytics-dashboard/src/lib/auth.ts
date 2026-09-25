export type AuthSessionPayload = {
  success?: boolean;
  token?: string;
  sessionId?: string;
  user?: UserRecord;
  message?: string;
};

export type UserRecord = {
  id?: number;
  username?: string;
  email?: string;
  full_name?: string;
  display_name?: string;
  role?: string;
  status?: string;
  avatar?: string;
};

export type RememberedAccount = {
  id: string;
  identifier: string;
  displayName: string;
  displayPicture: string | null;
  role: string;
  lastActive: number;
  isTouchIdEnabled?: boolean;
};

const DEFAULT_PRODUCTION_HOSTS = [
  'https://erp.faizal.uk',
  'https://mac.faizal.uk',
  'http://erp.faizal.uk',
  'http://mac.faizal.uk',
];
const SESSION_KEY = 'zentra-auth-session';
const USER_KEY = 'zentra-auth-user';
const REMEMBERED_USERS_KEY = 'macos_remembered_users';
const ACTIVE_USER_KEY = 'macos_active_user_id';

const viteEnv = typeof import.meta !== 'undefined' ? ((import.meta as any)?.env ?? {}) : {};

function getSessionStorageSafe() {
  const target = typeof window !== 'undefined' ? window : globalThis as any;
  try {
    return target.sessionStorage || null;
  } catch {
    return null;
  }
}

function getLocalStorageSafe() {
  const target = typeof window !== 'undefined' ? window : globalThis as any;
  try {
    return target.localStorage || null;
  } catch {
    return null;
  }
}

function getApiCandidates(): string[] {
  const candidates: string[] = [];

  // 1. Primary: Same origin (handled by Vite dev proxy to backend port 3002, or Nginx/production server)
  if (typeof window !== 'undefined' && window.location?.origin) {
    candidates.push(window.location.origin.replace(/\/$/, ''));
  }

  // 2. Configured custom target if provided
  const configured = (viteEnv.VITE_API_BASE_URL || viteEnv.VITE_API_TARGET || '').trim();
  if (configured) {
    const clean = configured.replace(/\/$/, '');
    if (!candidates.includes(clean)) {
      candidates.push(clean);
    }
  }

  // 3. Local direct backend port fallback (port 3002)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const port3002 = `http://${window.location.hostname}:3002`;
      if (!candidates.includes(port3002)) {
        candidates.push(port3002);
      }
    }
  }

  // 4. Production remote fallbacks
  for (const host of DEFAULT_PRODUCTION_HOSTS) {
    if (!candidates.includes(host)) {
      candidates.push(host);
    }
  }

  return candidates;
}

export const API_BASE_URL = getApiCandidates()[0] || '';

export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function buildFetchOptions(url: string, init?: RequestInit): RequestInit {
  const nextInit: RequestInit = { ...init };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  let isSameOrigin = false;

  try {
    const targetOrigin = new URL(url, window.location.href || 'http://localhost').origin;
    isSameOrigin = Boolean(origin && targetOrigin === origin);
  } catch {
    isSameOrigin = true;
  }

  if (isSameOrigin) {
    nextInit.credentials = 'same-origin';
  } else {
    nextInit.credentials = 'include';
  }

  const headers = new Headers(nextInit.headers || {});
  const csrf = getCsrfToken();
  if (csrf && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrf);
  }
  nextInit.headers = headers;

  return nextInit;
}

export async function fetchWithFallback(endpoint: string, init?: RequestInit) {
  let lastError: unknown;

  for (const baseUrl of getApiCandidates()) {
    const targetUrl = `${baseUrl}${endpoint}`;
    try {
      const finalInit = buildFetchOptions(targetUrl, init);
      const response = await fetch(targetUrl, finalInit);
      const contentType = response.headers.get('content-type') || '';

      if (response.ok || response.status === 401 || response.status === 403 || (response.status === 404 && contentType.includes('application/json'))) {
        if (response.status === 200 && contentType.includes('text/html')) {
          continue;
        }
        return response;
      }

      if (contentType.includes('text/html')) {
        continue;
      }
    } catch (error) {
      lastError = error;
      console.warn('[Zentra Auth] fetch failed', { targetUrl, error });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch from the backend.');
}

export async function apiFetch<T = any>(endpoint: string, init?: RequestInit): Promise<T> {
  const session = readStoredSession();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) || {}),
  };
  
  if (session.token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  const response = await fetchWithFallback(endpoint, {
    ...init,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';

  if (response.status === 401 || response.status === 403) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zentra:unauthorized'));
    }
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export function readStoredSession() {
  try {
    const sessionStore = getSessionStorageSafe();
    const raw = sessionStore ? sessionStore.getItem(SESSION_KEY) : null;
    const userRaw = sessionStore ? sessionStore.getItem(USER_KEY) : null;
    return {
      token: raw || null,
      user: userRaw ? JSON.parse(userRaw) : null,
    };
  } catch {
    return { token: null, user: null };
  }
}

export function saveSession(payload: AuthSessionPayload) {
  const sessionStore = getSessionStorageSafe();
  if (!sessionStore) return;

  if (payload.token) {
    sessionStore.setItem(SESSION_KEY, payload.token);
  }

  if (payload.user) {
    sessionStore.setItem(USER_KEY, JSON.stringify(payload.user));
  }
}

export function getRememberedAccounts(): RememberedAccount[] {
  try {
    const raw = localStorage.getItem(REMEMBERED_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Deduplicate and merge accounts by user ID or normalized displayName
    const map = new Map<string, RememberedAccount>();
    for (const item of parsed) {
      if (!item) continue;
      // Key primarily by display name or id so Google and local accounts of the same user merge
      const key = String(item.displayName || item.id || item.identifier).trim().toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
      } else {
        map.set(key, {
          ...existing,
          ...item,
          id: existing.id || item.id,
          displayName: existing.displayName || item.displayName,
          displayPicture: existing.displayPicture || item.displayPicture,
          isTouchIdEnabled: existing.isTouchIdEnabled || item.isTouchIdEnabled,
          lastActive: Math.max(existing.lastActive || 0, item.lastActive || 0),
        });
      }
    }
    const deduplicated = Array.from(map.values());
    if (deduplicated.length !== parsed.length) {
      localStorage.setItem(REMEMBERED_USERS_KEY, JSON.stringify(deduplicated));
    }
    return deduplicated.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  } catch {
    return [];
  }
}

export function setActiveRememberedAccount(accountId: string) {
  if (!accountId) return;
  localStorage.setItem(ACTIVE_USER_KEY, accountId);
}

export function saveRememberedAccount(user: UserRecord | null, identifierOverride?: string, isTouchIdEnabled?: boolean) {
  if (!user && !identifierOverride) return;

  const identifier = String(identifierOverride || user?.username || user?.email || 'user').trim();
  if (!identifier) return;

  const accounts = getRememberedAccounts();
  const userId = user?.id ? String(user.id) : null;
  const userDisplayName = user?.full_name || user?.display_name || user?.username;

  // Match existing account by user ID, identifier, or display name
  const existingIndex = accounts.findIndex((account) => {
    if (userId && String(account.id) === userId) return true;
    if (account.identifier.toLowerCase() === identifier.toLowerCase()) return true;
    if (user?.email && account.identifier.toLowerCase() === user.email.toLowerCase()) return true;
    if (user?.username && account.identifier.toLowerCase() === user.username.toLowerCase()) return true;
    if (userDisplayName && account.displayName.toLowerCase() === userDisplayName.toLowerCase()) return true;
    return false;
  });

  const existing = existingIndex >= 0 ? accounts[existingIndex] : null;
  const effectiveTouchId = isTouchIdEnabled !== undefined ? isTouchIdEnabled : (existing?.isTouchIdEnabled || false);

  const normalized: RememberedAccount = {
    id: existing?.id || userId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identifier: existing?.identifier || identifier,
    displayName: userDisplayName || existing?.displayName || identifier.split('@')[0] || 'User',
    displayPicture: user?.avatar || existing?.displayPicture || null,
    role: user?.role || existing?.role || 'owner',
    lastActive: Date.now(),
    isTouchIdEnabled: effectiveTouchId,
  };

  const nextAccounts = [...accounts];
  if (existingIndex >= 0) {
    nextAccounts[existingIndex] = { ...existing, ...normalized };
  } else {
    nextAccounts.push(normalized);
  }

  localStorage.setItem(REMEMBERED_USERS_KEY, JSON.stringify(nextAccounts));
  localStorage.setItem(ACTIVE_USER_KEY, normalized.id);
  localStorage.setItem('macos_remember_account', 'true');
  localStorage.setItem('macos_user_identifier', normalized.identifier);
  localStorage.setItem('macos_user_display_name', normalized.displayName);
  if (normalized.displayPicture) {
    localStorage.setItem('macos_user_display_picture', normalized.displayPicture);
  }

  return normalized;
}

export function clearSession() {
  const sessionStore = getSessionStorageSafe();
  const localStore = getLocalStorageSafe();

  sessionStore?.removeItem(SESSION_KEY);
  sessionStore?.removeItem(USER_KEY);
  localStore?.removeItem(SESSION_KEY);
  localStore?.removeItem(USER_KEY);
  localStore?.removeItem('zentra-auth-session');

  if (typeof document !== 'undefined') {
    document.cookie = 'auth_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
  }
}

export async function loginWithPassword(identifier: string, password: string) {
  const payload = {
    identifier,
    password,
    deviceName: 'Zentra Web',
    deviceType: 'Desktop',
    clientType: 'web',
    clientApp: 'zentra',
  };

  const candidates = getApiCandidates();
  console.debug('[Zentra Auth] login attempt', { candidates, payload });

  let lastError: unknown;

  for (const baseUrl of candidates) {
    try {
      const targetUrl = `${baseUrl}/api/auth/login`;
      const finalInit = buildFetchOptions(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-App': 'zentra',
          'X-Client-Platform': 'web',
        },
        body: JSON.stringify(payload),
      });
      const response = await fetch(targetUrl, finalInit);
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/html')) {
        continue;
      }

      const data = (await response.json().catch(() => ({}))) as AuthSessionPayload & { error?: string };
      console.debug('[Zentra Auth] response', { baseUrl, status: response.status, ok: response.ok, data });

      if (!response.ok) {
        throw new Error(data.error || 'Invalid username or password');
      }

      return data;
    } catch (error) {
      // If the backend actually responded (e.g. 401 Invalid credentials, 403, 400),
      // rethrow immediately so the UI displays the error without spamming other candidate URLs!
      if (error instanceof Error && error.message !== 'Failed to fetch' && !error.message.includes('NetworkError') && !error.message.includes('Load failed')) {
        throw error;
      }
      lastError = error;
      console.warn('[Zentra Auth] failed on baseUrl', baseUrl, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to connect to authentication server.');
}

export async function verifySession(token?: string): Promise<{ valid: boolean; user: UserRecord | null; permissions?: any }> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return { valid: false, user: null };
  }

  const cleanToken = token.trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cleanToken}`,
  };

  try {
    const response = await fetchWithFallback('/api/auth/verify', {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      return { valid: false, user: null };
    }

    const data = await response.json().catch(() => ({}));
    const isSuccess = Boolean(data?.authenticated === true || data?.success === true || data?.valid === true);
    
    if (isSuccess && data?.user) {
      return {
        valid: true,
        user: data.user,
        permissions: data.permissions || null,
      };
    }

    return { valid: false, user: null };
  } catch (error) {
    console.warn('[Zentra Auth] Session verification error:', error);
    return { valid: false, user: null };
  }
}

export function removeRememberedAccount(idOrKey: string): RememberedAccount[] {
  if (!idOrKey) return getRememberedAccounts();
  const rawTarget = String(idOrKey).trim().toLowerCase();
  const accounts = getRememberedAccounts();

  const next = accounts.filter(a => {
    const aid = String(a.id || '').trim().toLowerCase();
    const aIdent = String(a.identifier || '').trim().toLowerCase();
    const aName = String(a.displayName || '').trim().toLowerCase();
    return aid !== rawTarget && aIdent !== rawTarget && aName !== rawTarget;
  });

  localStorage.setItem(REMEMBERED_USERS_KEY, JSON.stringify(next));

  const activeId = localStorage.getItem(ACTIVE_USER_KEY);
  const legacyIdent = localStorage.getItem('macos_user_identifier');

  const matchedActive = activeId && (
    activeId.toLowerCase() === rawTarget ||
    !next.some(a => a.id === activeId)
  );
  const matchedLegacy = legacyIdent && legacyIdent.toLowerCase() === rawTarget;

  if (matchedActive || matchedLegacy || next.length === 0) {
    if (next.length > 0) {
      localStorage.setItem(ACTIVE_USER_KEY, next[0].id);
      localStorage.setItem('macos_user_identifier', next[0].identifier);
      if (next[0].displayName) localStorage.setItem('macos_user_display_name', next[0].displayName);
      if (next[0].displayPicture) localStorage.setItem('macos_user_display_picture', next[0].displayPicture);
    } else {
      localStorage.removeItem(ACTIVE_USER_KEY);
      localStorage.removeItem('macos_remember_account');
      localStorage.removeItem('macos_user_identifier');
      localStorage.removeItem('macos_user_display_name');
      localStorage.removeItem('macos_user_display_picture');
    }
  }

  // Also dispatch a window event so all tabs or sync listeners update
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('macos-profiles-updated', { detail: { users: next } }));
  }

  return next;
}

export async function fetchSecurityChallenge(identifier: string): Promise<{ question: string | null; isRecoveryKey: boolean; hasSecurityQuestion: boolean }> {
  const res = await fetchWithFallback(`/api/auth/challenge?identifier=${encodeURIComponent(identifier.trim())}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Account not found with this username or email');
  }
  const data = await res.json();
  return {
    question: data.question || null,
    isRecoveryKey: !data.question,
    hasSecurityQuestion: Boolean(data.hasSecurityQuestion),
  };
}

export async function verifySecurityAnswer(identifier: string, answer: string, isRecoveryKey = false): Promise<{ success: boolean; sessionId?: string }> {
  const payload = isRecoveryKey
    ? { identifier: identifier.trim(), recoveryKey: answer.trim() }
    : { identifier: identifier.trim(), answer: answer.trim() };

  const res = await fetchWithFallback('/api/auth/verify-answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Incorrect answer or recovery key');
  }
  return data;
}

export async function updatePasswordAfterRecovery(newPassword: string, identifier?: string): Promise<{ success: boolean }> {
  const res = await fetchWithFallback('/api/auth/update-security', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, identifier }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update password');
  }
  return data;
}

export async function fetchGoogleConfig(): Promise<{ clientId: string } | null> {
  try {
    const res = await fetchWithFallback('/api/auth/google/config');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loginWithGoogle(idToken: string, linkPassword?: string) {
  const body: any = {
    idToken,
    deviceName: 'Zentra Web',
    deviceType: 'Desktop',
    clientType: 'web',
    clientApp: 'zentra',
  };
  if (linkPassword) {
    body.linkPassword = linkPassword;
  }

  const res = await fetchWithFallback('/api/auth/google/worker-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-App': 'zentra',
      'X-Client-Platform': 'web',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.requiresLinking) {
    return { status: 409 as const, requiresLinking: true, email: data.email || '' };
  }
  if (data.status === 'pending') {
    return { status: 'pending' as const, inviteCode: data.inviteCode, qrDataUrl: data.qrDataUrl, data };
  }
  if (!res.ok) {
    throw new Error(data.error || 'Google login failed');
  }
  return { status: 200 as const, ...data };
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function bytesToBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function serializeCredential(credential: any): any {
  const response = credential.response;
  const result: any = {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
    },
  };

  if (response.attestationObject) {
    result.response.attestationObject = bytesToBase64Url(response.attestationObject);
  }
  if (response.authenticatorData) {
    result.response.authenticatorData = bytesToBase64Url(response.authenticatorData);
    result.response.signature = bytesToBase64Url(response.signature);
    result.response.userHandle = response.userHandle ? bytesToBase64Url(response.userHandle) : null;
  }
  return result;
}

export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);
}

export async function authenticateWithPasskey(identifier?: string): Promise<AuthSessionPayload> {
  if (!isPasskeySupported()) {
    throw new Error('Passkey / WebAuthn is not supported in this browser.');
  }

  const endpoint = `/api/auth/webauthn/authentication-options${identifier ? `?identifier=${encodeURIComponent(identifier)}` : ''}`;
  const optionsRes = await fetchWithFallback(endpoint);
  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.error || 'Passkey is not set up on this account.');
  }

  const options = await optionsRes.json();
  options.challenge = base64UrlToBytes(options.challenge);
  (options.allowCredentials || []).forEach((c: any) => {
    c.id = base64UrlToBytes(c.id);
  });

  const credential = await navigator.credentials.get({ publicKey: options });
  if (!credential) {
    throw new Error('Passkey authentication was cancelled.');
  }

  const verifyRes = await fetchWithFallback('/api/auth/webauthn/authentication-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier,
      deviceName: 'Zentra Web',
      deviceType: 'Web',
      response: serializeCredential(credential),
    }),
  });

  const data = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok) {
    throw new Error(data.error || 'Passkey verification failed');
  }

  return data;
}

export async function registerPasskey(token?: string): Promise<{ success: boolean }> {
  if (!isPasskeySupported()) {
    throw new Error('Passkey / WebAuthn is not supported in this browser.');
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const optionsRes = await fetchWithFallback('/api/auth/webauthn/registration-options', {
    headers,
  });
  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.error || 'Unable to start passkey registration.');
  }

  const options = await optionsRes.json();
  options.challenge = base64UrlToBytes(options.challenge);
  options.user.id = base64UrlToBytes(options.user.id);
  (options.excludeCredentials || []).forEach((c: any) => {
    c.id = base64UrlToBytes(c.id);
  });

  const credential = await navigator.credentials.create({ publicKey: options });
  if (!credential) {
    throw new Error('Passkey creation was cancelled.');
  }

  const verifyRes = await fetchWithFallback('/api/auth/webauthn/registration-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(serializeCredential(credential)),
  });

  const data = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok) {
    throw new Error(data.error || 'Passkey enrollment verification failed');
  }

  localStorage.setItem('touchIdEnabled', 'true');
  return { success: true };
}

export async function checkAccountHasPasskey(identifier: string): Promise<boolean> {
  if (!identifier || !isPasskeySupported()) return false;
  try {
    const res = await fetchWithFallback(`/api/auth/webauthn/authentication-options?identifier=${encodeURIComponent(identifier)}`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSecurityQuestions(): Promise<string[]> {
  try {
    const res = await fetchWithFallback('/api/auth/questions');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.questions) ? data.questions : [];
  } catch {
    return [];
  }
}

export async function checkUsernameAvailability(username: string): Promise<{ available: boolean; message: string }> {
  const clean = username.trim();
  if (!clean) return { available: false, message: '' };
  try {
    const res = await fetchWithFallback(`/api/auth/check-username?username=${encodeURIComponent(clean)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { available: Boolean(data.available), message: data.message || (data.available ? 'Username available' : 'Username taken') };
    }
    return { available: false, message: data.message || data.error || 'Username not available' };
  } catch {
    return { available: false, message: 'Could not verify username' };
  }
}

export async function updateWorkerSecurityCredentials(payload: {
  newPassword: string;
  securityQuestion: string;
  securityAnswer: string;
  identifier: string;
  email?: string;
  username?: string;
}, token?: string): Promise<{ success: boolean; message?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const bearerToken = token || getSessionStorageSafe()?.getItem(SESSION_KEY) || getLocalStorageSafe()?.getItem(SESSION_KEY) || getSessionStorageSafe()?.getItem('token') || getLocalStorageSafe()?.getItem('token') || getSessionStorageSafe()?.getItem('macos_token') || getLocalStorageSafe()?.getItem('macos_token');
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const res = await fetchWithFallback('/api/auth/update-security', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save local credentials');
  }

  return data;
}

