const http = require('http');
const fs = require('fs');
const path = require('path');

const targetPort = parseInt(process.argv[2] || process.env.TARGET_PORT || '3001', 10);

async function request(name, path, options = {}) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          name,
          path,
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          bodyLength: data.length,
          data: data,
          snippet: data.slice(0, 120).replace(/\n/g, ' ')
        });
      });
    });
    req.on('error', (err) => resolve({ name, path, error: err.message, status: 0, data: '' }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`🧪 DOCKER CONTAINER VERIFICATION SUITE (Target: http://127.0.0.1:${targetPort})`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // Dynamically probe the live target container to discover real built asset URLs
  let sampleCssPath = null;
  let sampleJsPath = null;

  try {
    const homeHtmlRes = await request('Probe Home HTML', '/home.html');
    const indexHtmlRes = await request('Probe Index HTML', '/');
    const htmlData = (homeHtmlRes.data || '') + ' ' + (indexHtmlRes.data || '');

    const cssMatches = htmlData.match(/\/assets\/[a-zA-Z0-9_.-]+\.css/g);
    if (cssMatches && cssMatches.length > 0) {
      sampleCssPath = cssMatches[0];
    }

    const jsMatches = htmlData.match(/\/assets\/[a-zA-Z0-9_.-]+\.js/g);
    if (jsMatches && jsMatches.length > 0) {
      sampleJsPath = jsMatches[0];
    }
  } catch (e) {}

  // Local filesystem fallback if dist/assets exists locally
  try {
    const assetsDir = path.resolve(__dirname, '../dist/assets');
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      if (!sampleCssPath) {
        const cssFile = files.find(f => f.endsWith('.css'));
        if (cssFile) sampleCssPath = `/assets/${cssFile}`;
      }
      if (!sampleJsPath) {
        const jsFile = files.find(f => f.endsWith('.js'));
        if (jsFile) sampleJsPath = `/assets/${jsFile}`;
      }
    }
  } catch (e) {}

  const tests = [
    { name: 'Health Check Endpoint', path: '/api/health', expected: [200] },
    { name: 'Root SPA Entry (index.html)', path: '/', expected: [200] },
    { name: 'Desktop Workspace (home.html)', path: '/home.html', expected: [200] },
    { name: 'Customer Ledger Page', path: '/customer-ledger', expected: [200] },
    { name: 'Public Product Page', path: '/public/product/test', expected: [200] },
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
    if (isPass) {
      passed++;
      console.log(`✅ PASS | ${t.name.padEnd(42)} [${t.path}] -> ${res.status} (${res.contentType.split(';')[0]})`);
    } else {
      console.log(`❌ FAIL | ${t.name.padEnd(42)} [${t.path}] -> ${res.status} (${res.error || res.snippet})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`📊 SUMMARY: ${passed}/${tests.length} tests passed (${Math.round((passed / tests.length) * 100)}% Ready)`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  if (passed !== tests.length) {
    process.exit(1);
  }
})();
