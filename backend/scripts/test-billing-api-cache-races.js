const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('frontend/modules/billing/js/billing-app.js', 'utf8');
const start = source.indexOf('export class BillingAPI');
const end = source.indexOf('\nexport class BillingApp', start);
assert.notStrictEqual(start, -1, 'BillingAPI class exists');
assert.notStrictEqual(end, -1, 'BillingAPI class has a following class boundary');

const billingApiSource = `${source.slice(start, end).replace('export class BillingAPI', 'class BillingAPI')}\nglobalThis.BillingAPI = BillingAPI;`;
const pendingFetches = [];
const context = {
  window: { currentUserData: { id: 'user-a' } },
  sessionStorage: { getItem: () => null },
  localStorage: { getItem: () => null },
  log: { error: () => {} },
  fetch: (url, options) => new Promise((resolve) => pendingFetches.push({ resolve, url, options }))
};
vm.runInNewContext(billingApiSource, context);

function response(data) {
  return { ok: true, json: async () => data };
}

async function run() {
  const api = new context.BillingAPI();
  const staleRead = api.getProducts();
  assert.strictEqual(pendingFetches.length, 1, 'first GET starts a network request');

  const mutation = api.createProduct({ name: 'Synthetic' });
  assert.strictEqual(pendingFetches.length, 2, 'mutation starts independently');
  pendingFetches[1].resolve(response({ success: true }));
  await mutation;

  const freshRead = api.getProducts({ forceRefresh: true });
  assert.strictEqual(pendingFetches.length, 3, 'forced GET does not join stale in-flight request');
  pendingFetches[2].resolve(response({ version: 'fresh' }));
  await freshRead;
  pendingFetches[0].resolve(response({ version: 'stale' }));
  await staleRead;

  const userACacheKey = 'user-a:/api/products';
  assert.strictEqual(BillingAPICacheValue(context, userACacheKey).version, 'fresh', 'superseded GET cannot overwrite fresh cache data');

  context.window.currentUserData = { id: 'user-b' };
  const userBRead = api.getProducts();
  assert.strictEqual(pendingFetches.length, 4, 'different user receives a separate cache scope');
  pendingFetches[3].resolve(response({ version: 'user-b' }));
  await userBRead;
  assert.strictEqual(BillingAPICacheValue(context, 'user-b:/api/products').version, 'user-b');
  console.log('BillingAPI cache race checks passed.');
}

function BillingAPICacheValue(vmContext, key) {
  return vmContext.BillingAPI._sharedCache.get(key)?.data;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});