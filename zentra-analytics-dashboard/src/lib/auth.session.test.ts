import assert from 'node:assert/strict';
import { readStoredSession, saveSession, clearSession } from './auth';

const globalScope = globalThis as any;

function setupStorage() {
  const store = new Map<string, string>();
  const sessionStore = new Map<string, string>();

  const createStorage = (target: Map<string, string>) => ({
    getItem(key: string) {
      return target.has(key) ? target.get(key)! : null;
    },
    setItem(key: string, value: string) {
      target.set(key, String(value));
    },
    removeItem(key: string) {
      target.delete(key);
    },
    clear() {
      target.clear();
    },
  });

  Object.defineProperty(globalScope, 'localStorage', { value: createStorage(store), configurable: true });
  Object.defineProperty(globalScope, 'sessionStorage', { value: createStorage(sessionStore), configurable: true });
}

setupStorage();
clearSession();

saveSession({ token: 'abc-123', user: { id: 7, username: 'demo', full_name: 'Demo User' } });
assert.equal(readStoredSession().token, 'abc-123', 'session should read from sessionStorage');
assert.equal(globalScope.localStorage.getItem('zentra-auth-session'), null, 'token must not persist in localStorage');
assert.equal(globalScope.sessionStorage.getItem('zentra-auth-session'), 'abc-123', 'token should survive only for browser session');

clearSession();
assert.equal(readStoredSession().token, null, 'session should be cleared');

const legacyLocalToken = 'legacy-token';
globalScope.localStorage.setItem('zentra-auth-session', legacyLocalToken);
assert.equal(readStoredSession().token, null, 'stale localStorage session should not auto-login on reopen');

globalScope.localStorage.removeItem('zentra-auth-session');
console.log('zentra auth session regression test passed');
