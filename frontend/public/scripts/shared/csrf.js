(() => {
  const originalFetch = window.fetch.bind(window);
  const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  function readCookie(name) {
    const prefix = `${name}=`;
    const value = document.cookie.split('; ').find(item => item.startsWith(prefix));
    return value ? decodeURIComponent(value.slice(prefix.length)) : null;
  }

  window.fetch = (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url || input, window.location.href);
    const method = (init.method || request?.method || 'GET').toUpperCase();
    const isSameOriginApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');

    if (!isSameOriginApi || !stateChangingMethods.has(method)) {
      return originalFetch(input, init);
    }

    const headers = new Headers(request?.headers || {});
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    const csrfToken = readCookie('csrf_token');
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

    const nextInit = { ...init, method, headers };
    return originalFetch(request || input, nextInit);
  };
})();
