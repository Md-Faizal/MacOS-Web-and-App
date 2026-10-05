const assert = require('assert');
const dataBus = require('../core/sync/data-bus');

const permissionRows = new Map([
  ['worker-billing:billing', { can_view: 1 }],
  ['worker-products:products', { can_view: 1 }]
]);
const db = {
  prepare: () => ({
    get: (userId, moduleName) => permissionRows.get(`${userId}:${moduleName}`) || null
  })
};
const received = new Map();

function createClient(id, role) {
  const messages = [];
  received.set(id, messages);
  return {
    user: { id, role },
    db,
    res: { write: (message) => messages.push(message) }
  };
}

async function run() {
  dataBus.clients.clear();
  dataBus.clients.add(createClient('owner', 'owner'));
  dataBus.clients.add(createClient('worker-billing', 'worker'));
  dataBus.clients.add(createClient('worker-products', 'worker'));
  dataBus.clients.add(createClient('worker-no-access', 'worker'));

  dataBus.broadcast('billing:invoice', 'updated', { customer_id: 42, grand_total: 125 });

  assert.strictEqual(received.get('owner').length, 1, 'owner receives billing event');
  assert.strictEqual(received.get('worker-billing').length, 1, 'worker with billing view permission receives invalidation');
  assert.strictEqual(received.get('worker-products').length, 0, 'worker without billing permission does not receive event');
  assert.deepStrictEqual(
    JSON.parse(received.get('worker-billing')[0].split('\ndata: ')[1].split('\n')[0]).payload,
    {},
    'worker event payload is redacted'
  );

  dataBus.broadcast('inventory:product', 'updated', { id: 12, name: 'Private Product' });
  assert.strictEqual(received.get('worker-products').length, 1, 'product-view permission maps from inventory domain');

  let statusCode = null;
  let responseBody = null;
  const unauthenticatedResponse = {
    status: (status) => {
      statusCode = status;
      return unauthenticatedResponse;
    },
    json: (body) => { responseBody = body; }
  };
  dataBus.handleSSEConnection({ user: null }, unauthenticatedResponse, db);
  assert.strictEqual(statusCode, 401, 'unauthenticated connection is rejected');
  assert.strictEqual(responseBody.error, 'Unauthorized');

  dataBus.clients.clear();
  console.log('Realtime event access checks passed.');
}

run().catch((error) => {
  dataBus.clients.clear();
  console.error(error);
  process.exitCode = 1;
});