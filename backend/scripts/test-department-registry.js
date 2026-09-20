const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const registry = require('../departments');
const serverSource = fs.readFileSync(path.join(root, 'backend/main/macos-api-server.js'), 'utf8');

const expectedDepartments = [
  'billing',
  'analytics',
  'product-list',
  'contacts',
  'auth',
  'admin',
  'settings',
  'desktop',
  'notes',
  'calendar',
  'logs',
  'ai',
  'suggestions',
  'wallpaper-content',
  'cloud-storage'
];

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

for (const departmentName of expectedDepartments) {
  const department = registry.get(departmentName);
  assert(!!department, `${departmentName} department is registered`);
  assert(typeof department.create === 'function' || !!department.service, `${departmentName} department exposes a service or factory`);
  assert(Array.isArray(department.ownedResponsibilities) && department.ownedResponsibilities.length > 0, `${departmentName} declares owned responsibilities`);
}

const calendarService = registry.get('calendar').create({});
assert(calendarService.compatibilityEngine === false, 'calendar uses a native department engine');
assert(typeof calendarService.router?.handle === 'function', 'calendar exposes a native router');
assert(!fs.existsSync(path.join(root, 'frontend/modules/calendar/api/index.js')), 'calendar legacy API entrypoint is deleted');
assert(!fs.existsSync(path.join(root, 'frontend/modules/calendar/api/handlers.js')), 'calendar legacy handlers are deleted');
assert(!fs.existsSync(path.join(root, 'frontend/modules/calendar/api/routes.js')), 'calendar legacy routes are deleted');

const notesService = registry.get('notes').create({
  prepare() { return { get: () => null, all: () => [] }; }
});
assert(notesService.compatibilityEngine === false, 'notes uses a native department engine');
assert(typeof notesService.router?.handle === 'function', 'notes exposes a native router');
assert(!fs.existsSync(path.join(root, 'frontend/modules/notes/api/index.js')), 'notes legacy API entrypoint is deleted');

for (const departmentName of ['logs', 'suggestions']) {
  const nativeService = registry.get(departmentName).create({});
  assert(nativeService.compatibilityEngine === false, `${departmentName} uses a native department engine`);
  assert(typeof nativeService.router?.handle === 'function', `${departmentName} exposes a native router`);
  assert(!fs.existsSync(path.join(root, `backend/core/${departmentName}/index.js`)), `${departmentName} legacy entrypoint is deleted`);
}

const cloudService = registry.get('cloud-storage').create({});
assert(cloudService.compatibilityEngine === false, 'cloud-storage uses a native department engine');
assert(typeof cloudService.router?.handle === 'function', 'cloud-storage exposes a native router');
assert(!fs.existsSync(path.join(root, 'frontend/modules/cloud/api/index.js')), 'cloud-storage legacy API entrypoint is deleted');

const settingsService = registry.get('settings').create({});
assert(settingsService.compatibilityEngine === false, 'settings uses a native department engine');
assert(typeof settingsService.router?.handle === 'function', 'settings exposes a native router');
assert(!fs.existsSync(path.join(root, 'frontend/modules/settings/api/index.js')), 'settings legacy API entrypoint is deleted');

const wallpaperService = registry.get('wallpaper-content').create();
assert(wallpaperService.compatibilityEngine === false, 'wallpaper-content uses a native department engine');
assert(typeof wallpaperService.router?.handle === 'function', 'wallpaper-content exposes a native router');
assert(!fs.existsSync(path.join(root, 'backend/core/wallpaper/index.js')), 'wallpaper legacy entrypoint is deleted');

const aiService = registry.get('ai').create({});
assert(aiService.compatibilityEngine === false, 'ai uses a native department engine');
assert(typeof aiService.router?.handle === 'function', 'ai exposes a native router');
assert(!fs.existsSync(path.join(root, 'backend/core/ai/index.js')), 'ai legacy entrypoint is deleted');

for (const departmentName of ['analytics', 'contacts']) {
  const nativeService = registry.get(departmentName).create({});
  assert(nativeService.compatibilityEngine === false, `${departmentName} uses a native department engine`);
  assert(typeof nativeService.router?.handle === 'function', `${departmentName} exposes a native router`);
  assert(!fs.existsSync(path.join(root, `frontend/modules/${departmentName}/api/index.js`)), `${departmentName} legacy entrypoint is deleted`);
}

const productListService = registry.get('product-list').create({});
assert(productListService.compatibilityEngine === false, 'product-list uses a native department engine');
assert(typeof productListService.router?.handle === 'function', 'product-list exposes a native router');
assert(!fs.existsSync(path.join(root, 'frontend/modules/product-list/api/index.js')), 'product-list legacy entrypoint is deleted');

const billingService = registry.get('billing').create({});
assert(billingService.compatibilityEngine === false, 'billing uses a native department engine');
assert(typeof billingService.router?.handle === 'function', 'billing exposes a native router');
assert(!fs.existsSync(path.join(root, 'frontend/modules/billing/api/index.js')), 'billing legacy entrypoint is deleted');

const authService = registry.get('auth').create({});
assert(authService.compatibilityEngine === false, 'auth uses a native department engine');
assert(!!authService.auth && !!authService.profile && !!authService.permissions, 'auth exposes its native service bundle');
assert(!fs.existsSync(path.join(root, 'backend/core/auth/auth.js')), 'auth legacy entrypoint is deleted');
assert(!fs.existsSync(path.join(root, 'backend/core/auth/profile.js')), 'profile legacy engine is deleted');

const adminService = registry.get('admin').create({});
assert(adminService.compatibilityEngine === false, 'admin uses a native department engine');
assert(!fs.existsSync(path.join(root, 'backend/core/auth/admin.js')), 'admin legacy engine is deleted');

assert(serverSource.includes("const departments = require('../departments');"), 'server loads the department registry');
for (const departmentName of ['settings', 'notes', 'calendar', 'logs', 'ai', 'suggestions', 'cloudStorage', 'wallpaperContent', 'desktop']) {
  assert(serverSource.includes(`departments.${departmentName}`), `server constructs ${departmentName} through the registry`);
}
for (const legacyImport of [
  "frontend/modules/billing/api",
  "frontend/modules/product-list/api",
  "frontend/modules/analytics/api",
  "frontend/modules/contacts/api",
  "frontend/modules/settings/api",
  "frontend/modules/notes/api",
  "frontend/modules/calendar/api",
  "frontend/modules/cloud/api",
  "../core/logs",
  "../core/ai",
  "../core/suggestions",
  "../core/wallpaper"
  ,"../core/auth/auth"
  ,"../core/auth/admin"
]) {
  assert(!serverSource.includes(`require('${legacyImport}')`), `server does not import ${legacyImport} directly`);
}
assert(!serverSource.includes("app.get('/api/desktop/state'"), 'desktop state is not owned inline by the server');
assert(serverSource.includes("{ path: '/api/desktop', router: desktopRouter }"), 'desktop routes are mounted through the desktop department');

console.log('Department registry checks passed.');
