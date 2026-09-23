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

function getApiCandidates(): string[] {
  const candidates: string[] = [];

  // 1. Primary: Same origin (handled by Vite dev proxy to backend port 3002, or Nginx/production server)
  if (typeof window !== 'undefined' && window.location?.origin) {
    candidates.push(window.location.origin.replace(/\/$/, ''));
  }

  // 2. Configured custom target if provided
  const configured = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_TARGET || '').trim();
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

      if (response.ok || response.status === 401 || response.status === 403) {
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
    const raw = localStorage.getItem(SESSION_KEY);
    const userRaw = localStorage.getItem(USER_KEY);
    return {
      token: raw || null,
      user: userRaw ? JSON.parse(userRaw) : null,
    };
  } catch {
    return { token: null, user: null };
  }
}

export function saveSession(payload: AuthSessionPayload) {
  if (payload.token) {
    localStorage.setItem(SESSION_KEY, payload.token);
  }

  if (payload.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  }
}

export function getRememberedAccounts(): RememberedAccount[] {
  try {
    const raw = localStorage.getItem(REMEMBERED_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  } catch {
    return [];
  }
}

export function setActiveRememberedAccount(accountId: string) {
  if (!accountId) return;
  localStorage.setItem(ACTIVE_USER_KEY, accountId);
}

export function saveRememberedAccount(user: UserRecord | null, identifierOverride?: string) {
  if (!user && !identifierOverride) return;

  const identifier = String(identifierOverride || user?.username || user?.email || 'user').trim();
  if (!identifier) return;

  const accounts = getRememberedAccounts();
  const normalized = {
    id: String(user?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    identifier,
    displayName: user?.full_name || user?.display_name || user?.username || identifier.split('@')[0] || 'User',
    displayPicture: user?.avatar || null,
    role: user?.role || 'user',
    lastActive: Date.now(),
  };

  const existingIndex = accounts.findIndex((account) => account.identifier.toLowerCase() === identifier.toLowerCase());
  const nextAccounts = [...accounts];

  if (existingIndex >= 0) {
    nextAccounts[existingIndex] = { ...nextAccounts[existingIndex], ...normalized };
  } else {
    nextAccounts.push(normalized);
  }

  localStorage.setItem(REMEMBERED_USERS_KEY, JSON.stringify(nextAccounts));
  localStorage.setItem(ACTIVE_USER_KEY, normalized.id);
  localStorage.setItem('macos_remember_account', 'true');
  localStorage.setItem('macos_user_identifier', identifier);
  localStorage.setItem('macos_user_display_name', normalized.displayName);
  if (normalized.displayPicture) {
    localStorage.setItem('macos_user_display_picture', normalized.displayPicture);
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('zentra-auth-session');
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
