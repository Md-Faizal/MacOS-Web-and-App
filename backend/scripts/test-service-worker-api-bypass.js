const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const listeners = {};
const deletedCaches = [];
const context = {
  self: {
    addEventListener: (type, listener) => { listeners[type] = listener; },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() }
  },
  caches: {
    keys: async () => ['api-cache-v1', 'asset-cache-v4'],
    delete: async name => { deletedCaches.push(name); return true; },
    open: async () => ({ addAll: async () => {} })
  },
  console,
  URL,
  fetch: async () => ({ status: 200, clone() { return this; } }),
  Response
};

vm.runInNewContext(fs.readFileSync('frontend/public/service-worker.js', 'utf8'), context);

async function run() {
  for (const path of ['/api/events', '/api/notes/events', '/api/billing/invoices']) {
    let intercepted = false;
    listeners.fetch({
      request: { method: 'GET', url: `https://suite.example${path}`, destination: '' },
      respondWith: () => { intercepted = true; }
    });
    assert.strictEqual(intercepted, false, `${path} bypasses service-worker caching`);
  }

  let activation;
  listeners.activate({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.ok(deletedCaches.includes('api-cache-v1'), 'legacy persistent API cache is removed');
  console.log('Service-worker API bypass checks passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});