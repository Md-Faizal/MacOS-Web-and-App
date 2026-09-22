const { spawn } = require('child_process');
const http = require('http');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk.toString();
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

(async () => {
  const port = 4050;
  const child = spawn(process.execPath, ['backend/main/macos-api-server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      ZENTRA_DEV_PROXY: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    console.error('Timed out waiting for backend startup');
    console.error(logs);
    process.exit(1);
  }, 20000);

  try {
    let response;
    for (let i = 0; i < 40; i++) {
      try {
        response = await fetchText(`http://127.0.0.1:${port}/zentra`);
        if (response.statusCode) break;
      } catch (error) {
        // server may still be starting
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log('STATUS', response?.statusCode || 'NO_RESPONSE');
    console.log('BODY_SNIPPET', (response?.body || '').slice(0, 200));

    if (!response || response.statusCode < 200 || response.statusCode >= 400) {
      throw new Error(`Expected /zentra to be served, got ${response?.statusCode || 'no response'}`);
    }

    console.log('ZENTRA_ROUTE_OK');
  } finally {
    clearTimeout(timeout);
    child.kill('SIGTERM');
  }
})();
