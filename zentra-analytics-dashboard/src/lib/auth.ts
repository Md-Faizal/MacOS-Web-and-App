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

const DEFAULT_API_PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 5173];
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

function getApiCandidates() {
  const configured = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_TARGET || '').trim();
  const candidates = new Set<string>();

  if (typeof window !== 'undefined' && window.location?.origin) {
    candidates.add(window.location.origin.replace(/\/$/, ''));
  }

  if (configured) {
    candidates.add(configured.replace(/\/$/, ''));
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      for (const port of DEFAULT_API_PORTS) {
        candidates.add(`http://localhost:${port}`);
        candidates.add(`http://127.0.0.1:${port}`);
      }
    }
  }

  for (const host of DEFAULT_PRODUCTION_HOSTS) {
    candidates.add(host);
  }

  return Array.from(candidates);
}

export const API_BASE_URL = getApiCandidates()[0] || 'https://erp.faizal.uk';

function isAllowedCredentialedOrigin(origin: string) {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const normalized = `${parsed.protocol}//${parsed.host}`.toLowerCase();
    return getApiCandidates().some((candidate) => candidate.toLowerCase() === normalized);
  } catch {
    return false;
  }
}

function buildFetchOptions(url: string, init?: RequestInit) {
  const nextInit: RequestInit = { ...init };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const targetOrigin = new URL(url, window.location.href || 'http://localhost').origin;

  if (origin && targetOrigin !== origin) {
    nextInit.credentials = isAllowedCredentialedOrigin(targetOrigin) ? 'include' : 'omit';
  } else {
    nextInit.credentials = 'same-origin';
  }

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
  const response = await fetchWithFallback(endpoint, init);
  const contentType = response.headers.get('content-type') || '';

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
        throw new Error(data.error || 'Unable to log in');
      }

      return data;
    } catch (error) {
      lastError = error;
      console.warn('[Zentra Auth] failed on baseUrl', baseUrl, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch from the backend.');
}

export async function verifySession(token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetchWithFallback('/api/auth/verify', {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json().catch(() => ({}));
    return Boolean(data?.valid || data?.success || data?.user || data?.status);
  } catch (error) {
    const isLocalDemo = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    if (isLocalDemo) {
      return true;
    }

    return false;
  }
}
