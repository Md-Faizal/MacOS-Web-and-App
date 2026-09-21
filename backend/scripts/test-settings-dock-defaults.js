const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../core/db/database-manager');
const createSettingsHandlers = require('../departments/settings/engine/handlers');

const db = DatabaseManager.initialize();
const settingsApi = createSettingsHandlers(db);

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passed++;
  } else {
    console.log(`FAIL: ${label}`);
    failed++;
  }
}

const settingsReq = { user: { deviceId: 900000 + Date.now(), role: 'worker' } };
const settingsRes = {
  json(data) {
    assert(data['dock-magnification'] === false, 'worker default dock magnification is off');
    assert(data['dock-auto-hide'] === false, 'worker default dock auto-hide is off');
  },
  status(code) { return { json: () => {} }; }
};
settingsApi.getSettings(settingsReq, settingsRes);

const settingsSource = fs.readFileSync(path.join(__dirname, '../../frontend/modules/settings/js/settings.js'), 'utf8');
assert(settingsSource.includes("const allowedSections = ['profile', 'dock', 'wallpaper', 'android-update'];"), 'worker settings include dock section');
assert(settingsSource.includes("'dock-magnification': saved['dock-magnification'] !== undefined ? saved['dock-magnification'] : false"), 'frontend default dock magnification is off');
assert(settingsSource.includes("'dock-auto-hide': saved['dock-auto-hide'] !== undefined ? saved['dock-auto-hide'] : false"), 'frontend default dock auto-hide is off');

const appBarSource = fs.readFileSync(path.join(__dirname, '../../frontend/scripts/app-bar/modules/app-bar.js'), 'utf8');
assert(appBarSource.includes("return saved['dock-magnification'] === true;"), 'dock runtime default is off when missing');

console.log(`
Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
