const DEFAULTS = {
  FRONTEND_URL: 'http://localhost:5173',
  BACKEND_URL: 'http://localhost:3002'
};

function getEnv(name) {
  return process.env[name] || DEFAULTS[name];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'accept': 'application/json', ...(opts.headers || {}) } });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function checkWithRetries(name, fn, { retries = 8, delayMs = 750 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await fn();
      return result;
    } catch (e) {
      lastErr = e;
      if (i === retries) break;
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

async function main() {
  const mode = (process.argv[2] || 'dev').toLowerCase();
  const frontendBase = normalizeBaseUrl(mode === 'prod'
    ? (process.env.FRONTEND_URL || 'http://localhost')
    : getEnv('FRONTEND_URL'));

  const backendBase = normalizeBaseUrl(mode === 'prod'
    ? (process.env.BACKEND_URL || 'http://localhost:3001')
    : getEnv('BACKEND_URL'));

  const results = [];

  // Frontend health (prod server provides /healthz; dev server doesn't)
  if (mode === 'prod') {
    results.push(await checkWithRetries('frontend /healthz', async () => {
      const r = await fetchJson(`${frontendBase}/healthz`);
      if (!r.ok) throw new Error(`frontend /healthz failed: ${r.status}`);
      return { name: 'frontend /healthz', ...r };
    }));
  }

  // Backend health direct
  results.push(await checkWithRetries('backend /api/health', async () => {
    const r = await fetchJson(`${backendBase}/api/health`);
    if (!r.ok) throw new Error(`backend /api/health failed: ${r.status}`);
    if (r.data?.status !== 'healthy') throw new Error(`backend unhealthy: ${JSON.stringify(r.data)}`);
    return { name: 'backend /api/health', ...r };
  }));

  // Backend DB/settings health (stronger signal that DB is readable)
  results.push(await checkWithRetries('backend /api/settings/health/status', async () => {
    const r = await fetchJson(`${backendBase}/api/settings/health/status`);
    if (!r.ok) throw new Error(`backend settings health failed: ${r.status}`);
    return { name: 'backend /api/settings/health/status', ...r };
  }));

  // Proxy health via frontend (/api/...): in dev this hits Vite proxy; in prod it hits server-prod proxy
  results.push(await checkWithRetries('frontend proxy /api/health', async () => {
    const r = await fetchJson(`${frontendBase}/api/health`);
    if (!r.ok) throw new Error(`frontend proxy /api/health failed: ${r.status}`);
    if (r.data?.status !== 'healthy') throw new Error(`proxy backend unhealthy: ${JSON.stringify(r.data)}`);
    return { name: 'frontend proxy /api/health', ...r };
  }));

  // Print summary
  console.log(`Healthcheck mode=${mode}`);
  console.log(`Frontend: ${frontendBase}`);
  console.log(`Backend:  ${backendBase}`);

  for (const r of results) {
    console.log(`- OK ${r.name} (${r.status})`);
  }
}

main().catch(err => {
  console.error('Healthcheck failed:', err?.message || err);
  process.exit(1);
});

