const http = require('http');
const express = require('express');
const app = express();
const { attachResponseHelpers, sendSuccess, sendError } = require('../shared/api/response');

app.use((req, res, next) => {
  req.requestId = 'phase1-check';
  next();
});
app.use(attachResponseHelpers);

app.get('/ok', (req, res) => {
  res.api.success({ ok: true, source: 'phase1' });
});

app.get('/bad', (req, res) => {
  res.api.error('VALIDATION_ERROR', 'Bad request', { field: 'example' }, 400);
});

const server = app.listen(0, () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  Promise.all([
    fetch(`${base}/ok`),
    fetch(`${base}/bad`)
  ])
    .then(async ([okRes, badRes]) => {
      const ok = await okRes.json();
      const bad = await badRes.json();

      console.log('=== PHASE 1 API FOUNDATION CHECK ===');
      console.log('OK response keys:', Object.keys(ok).sort().join(', '));
      console.log('OK success:', ok.success, 'status:', ok.meta?.status, 'requestId:', ok.meta?.requestId);
      console.log('BAD response keys:', Object.keys(bad).sort().join(', '));
      console.log('BAD success:', bad.success, 'status:', bad.error?.status, 'code:', bad.error?.code);

      const okPass = ok.success === true && ok.meta?.requestId === 'phase1-check';
      const badPass = bad.success === false && bad.error?.code === 'VALIDATION_ERROR';

      if (!okPass || !badPass) {
        console.error('Phase 1 API foundation check failed.');
        process.exit(1);
      }

      console.log('\nPhase 1 API foundation checks passed.');
      server.close();
    })
    .catch((error) => {
      console.error('Phase 1 check failed:', error);
      server.close();
      process.exit(1);
    });
});
