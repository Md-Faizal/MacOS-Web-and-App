const http = require('http');

const PORT_A = 3008; // Docker
const PORT_B = 3001; // PM2 Prod backend
const PORT_C = 3000; // PM2 Prod frontend

async function request(port, path, options = {}) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          port,
          path,
          status: res.statusCode,
          headers: res.headers,
          contentType: res.headers['content-type'] || '',
          bodyLength: data.length,
          body: data
        });
      });
    });
    req.on('error', (err) => resolve({ port, path, error: err.message, status: 0 }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🔬 PARITY TEST SUITE: Docker (:3008) vs PM2 Production (:3001/:3000)');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const testCases = [
    { name: 'Health Check', path: '/api/health', expectedStatus: 200, compareJson: true },
    { name: 'Auth Status', path: '/api/auth/status', expectedStatus: 200, compareJson: true },
    { name: 'Index HTML', path: '/index.html', expectedStatus: 200, compareHtml: true },
    { name: 'Home HTML', path: '/home.html', expectedStatus: 200, compareHtml: true },
    { name: 'Customer Ledger Route', path: '/customer-ledger', expectedStatus: 200, compareHtml: true },
    { name: 'Public Product Route', path: '/public/product/test', expectedStatus: 200, compareHtml: true },
    { name: 'Shared CSRF JS', path: '/scripts/shared/csrf.js', expectedStatus: 200 },
    { name: 'Products API Auth Check', path: '/api/products', expectedStatus: 401 },
    { name: 'Notes API Auth Check', path: '/api/notes', expectedStatus: 401 },
    { name: 'Wallpapers API Auth Check', path: '/api/wallpapers', expectedStatus: 401 },
    { name: 'Settings API Auth Check', path: '/api/settings', expectedStatus: 401 },
    { name: 'Billing API Auth Check', path: '/api/billing', expectedStatus: 401 },
    { name: '404 Guard for Missing Route', path: '/api/nonexistent-route', expectedStatus: 404 }
  ];

  let passed = 0;

  for (const tc of testCases) {
    const dockerRes = await request(PORT_A, tc.path);
    // For API routes check :3001, for HTML routes check :3000 (or :3001 if unified)
    const pm2Port = tc.path.startsWith('/api') ? PORT_B : PORT_C;
    const pm2Res = await request(pm2Port, tc.path);

    const dockerOk = dockerRes.status === tc.expectedStatus;
    const pm2Ok = pm2Res.status === tc.expectedStatus;
    const parity = dockerRes.status === pm2Res.status;

    if (dockerOk && parity) {
      passed++;
      console.log(`✅ MATCH | ${tc.name.padEnd(30)} Docker: ${dockerRes.status} | PM2: ${pm2Res.status} (${dockerRes.contentType.split(';')[0]})`);
    } else {
      console.log(`❌ DIVERGENCE | ${tc.name.padEnd(30)} Docker: ${dockerRes.status} (err: ${dockerRes.error || 'none'}) | PM2: ${pm2Res.status} (err: ${pm2Res.error || 'none'})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`📊 PARITY SCORE: ${passed}/${testCases.length} (${Math.round((passed / testCases.length) * 100)}%)`);
  console.log('═══════════════════════════════════════════════════════════════════════');
})();
