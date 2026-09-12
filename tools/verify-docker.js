const http = require('http');
const fs = require('fs');
const path = require('path');

const targetPort = parseInt(process.argv[2] || process.env.TARGET_PORT || '3001', 10);
const REQUEST_TIMEOUT_MS = 6000;

async function request(name, reqPath, options = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: reqPath,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: REQUEST_TIMEOUT_MS
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          name,
          path: reqPath,
          status: res.statusCode,
          durationMs: Date.now() - startTime,
          contentType: res.headers['content-type'] || '',
          bodyLength: data.length,
          data: data,
          snippet: data.slice(0, 120).replace(/\r?\n/g, ' ')
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ name, path: reqPath, error: 'ETIMEDOUT', status: 0, durationMs: Date.now() - startTime, data: '' });
    });

    req.on('error', (err) => {
      resolve({ name, path: reqPath, error: err.message, status: 0, durationMs: Date.now() - startTime, data: '' });
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

function extractBundledAssets(html) {
  if (!html || typeof html !== 'string') return { js: [], css: [] };
  const js = [];
  const css = [];

  // Match: <script ... src="(/assets/...js)" ...>
  // Strictly captures strings bounded by quotes that end in .js
  const scriptRegex = /<script\b[^>]*\bsrc=["'](\/assets\/[^"'#?]+\.js)(?:[?#][^"']*)?["']/gi;
  let m;
  while ((m = scriptRegex.exec(html)) !== null) {
    const url = m[1];
    if (!url.includes('manifest') && !js.includes(url)) {
      js.push(url);
    }
  }

  // Match: <link ... href="(/assets/...css)" ...>
  // Strictly captures strings bounded by quotes that end in .css
  const cssRegex = /<link\b[^>]*\bhref=["'](\/assets\/[^"'#?]+\.css)(?:[?#][^"']*)?["']/gi;
  while ((m = cssRegex.exec(html)) !== null) {
    const url = m[1];
    if (!css.includes(url)) {
      css.push(url);
    }
  }

  return { js, css };
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`🧪 DOCKER CONTAINER VERIFICATION SUITE (Target: http://127.0.0.1:${targetPort})`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // Probe live target container to discover runtime compiled bundle asset URLs
  let sampleCssPath = null;
  let sampleJsPath = null;

  try {
    const homeHtmlRes = await request('Probe Home HTML', '/home.html');
    const indexHtmlRes = await request('Probe Index HTML', '/');

    const homeAssets = extractBundledAssets(homeHtmlRes.data || '');
    const indexAssets = extractBundledAssets(indexHtmlRes.data || '');

    sampleCssPath = homeAssets.css[0] || indexAssets.css[0] || null;
    sampleJsPath = homeAssets.js[0] || indexAssets.js[0] || null;
  } catch (e) {}

  // Local filesystem inspection fallback if dist/assets exists locally
  try {
    const assetsDir = path.resolve(__dirname, '../dist/assets');
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      if (!sampleCssPath) {
        const cssFile = files.find(f => f.endsWith('.css'));
        if (cssFile) sampleCssPath = `/assets/${cssFile}`;
      }
      if (!sampleJsPath) {
        const jsFile = files.find(f => f.endsWith('.js') && !f.includes('manifest'));
        if (jsFile) sampleJsPath = `/assets/${jsFile}`;
      }
    }
  } catch (e) {}

  const tests = [
    { name: 'Deep Health Check (/api/health)', path: '/api/health', expected: [200] },
    { name: 'Synthetic Health Probe (/healthz)', path: '/healthz', expected: [200, 404] },
    { name: 'Root SPA Entry (index.html)', path: '/', expected: [200] },
    { name: 'Desktop Workspace (home.html)', path: '/home.html', expected: [200] },
    { name: 'Customer Ledger Page', path: '/customer-ledger', expected: [200] },
    { name: 'Public Product Page', path: '/public/product/test', expected: [200] },
    { name: 'Web App Manifest', path: '/manifest.json', expected: [200] },
    { name: 'Desktop Favicon Asset', path: '/assets/Images/Favicon.png', expected: [200] },
    { name: 'Auth Status Endpoint', path: '/api/auth/status', expected: [200] },
    { name: 'Database Query (Products API)', path: '/api/products', expected: [200, 401] },
    { name: 'Database Query (Notes API)', path: '/api/notes', expected: [200, 401] },
    { name: 'Database Query (Wallpapers API)', path: '/api/wallpapers', expected: [200, 401] }
  ];

  if (sampleCssPath) {
    tests.push({ name: 'Static CSS Bundle Asset', path: sampleCssPath, expected: [200] });
  }
  if (sampleJsPath) {
    tests.push({ name: 'Static JS Bundle Asset', path: sampleJsPath, expected: [200] });
  }

  tests.push(
    { name: 'Security Guard (Missing API Endpoint)', path: '/api/nonexistent-route', expected: [404] },
    { name: 'Security Guard (Missing Asset Extension)', path: '/assets/nonexistent.js', expected: [404] }
  );

  let passed = 0;
  for (const t of tests) {
    const res = await request(t.name, t.path);
    const isPass = t.expected.includes(res.status);
    const timing = `${res.durationMs}ms`.padStart(6);
    const cType = res.contentType ? res.contentType.split(';')[0] : 'none';

    if (isPass) {
      passed++;
      console.log(`✅ PASS [${timing}] | ${t.name.padEnd(38)} [${t.path}] -> ${res.status} (${cType})`);
    } else {
      console.log(`❌ FAIL [${timing}] | ${t.name.padEnd(38)} [${t.path}] -> ${res.status} (${res.error || res.snippet || 'Unexpected status'})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`📊 SUMMARY: ${passed}/${tests.length} tests passed (${Math.round((passed / tests.length) * 100)}% Ready)`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  if (passed !== tests.length) {
    process.exit(1);
  }
})();
