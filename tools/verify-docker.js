const http = require('http');

async function test(name, path, options = {}) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3008,
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
          snippet: data.slice(0, 120).replace(/\n/g, ' ')
        });
      });
    });
    req.on('error', (err) => resolve({ name, path, error: err.message, status: 0 }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🧪 DOCKER CONTAINER VERIFICATION SUITE (Target: http://127.0.0.1:3008)');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const tests = [
    { name: 'Health Check Endpoint', path: '/api/health', expected: [200] },
    { name: 'Root SPA Entry (index.html)', path: '/', expected: [200] },
    { name: 'Desktop Workspace (home.html)', path: '/home.html', expected: [200] },
    { name: 'Customer Ledger Page', path: '/customer-ledger', expected: [200] },
    { name: 'Public Product Page', path: '/public/product/test', expected: [200] },
    { name: 'Auth Status Endpoint', path: '/api/auth/status', expected: [200] },
    { name: 'Database Query (Products API)', path: '/api/products', expected: [200, 401] },
    { name: 'Database Query (Notes API)', path: '/api/notes', expected: [200, 401] },
    { name: 'Database Query (Wallpapers API)', path: '/api/wallpapers', expected: [200, 401] },
    { name: 'Static Manifest JSON Asset', path: '/assets/manifest-N0mu_H-c.json', expected: [200] },
    { name: 'Static CSS Bundle Asset', path: '/assets/home-KmFKKS1z.css', expected: [200] },
    { name: 'Security Guard (Missing API Endpoint)', path: '/api/nonexistent-route', expected: [404] },
    { name: 'Security Guard (Missing Asset Extension)', path: '/assets/nonexistent.js', expected: [404] }
  ];

  let passed = 0;
  for (const t of tests) {
    const res = await test(t.name, t.path);
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
})();
