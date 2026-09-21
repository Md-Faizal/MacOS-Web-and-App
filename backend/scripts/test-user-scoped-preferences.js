const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const checks = [
  {
    file: 'frontend/shared/wallpaper-engine.js',
    required: ['_getScopedStorageKey', "getScopedStorageKey('selectedWallpaper')", "getScopedStorageKey('macos_wallpaper_variant')"],
    label: 'Wallpaper engine scopes keys to the active user'
  },
  {
    file: 'frontend/modules/settings/js/settings.js',
    required: ['getScopedStorageKey', "getScopedStorageKey('settingsAppData')", "getScopedStorageKey('macos_theme')"],
    label: 'Settings app scopes keys to the active user'
  },
  {
    file: 'backend/departments/settings/engine/handlers.js',
    required: ['resolveUserDeviceId', 'SELECT id FROM user_devices WHERE id = ? AND user_id = ?', 'No valid device binding for this user'],
    label: 'Backend settings API enforces user/device ownership'
  },
  {
    file: 'frontend/scripts/welcome/modules/desktop.js',
    required: ['getScopedStorageKey', "getScopedStorageKey('desktopShortcuts')", "getScopedStorageKey('desktop_show_grid')"],
    label: 'Desktop shortcuts and grid settings are scoped to the active user'
  },
  {
    file: 'frontend/modules/widgets/js/WeatherWidget.js',
    required: ['getScopedStorageKey', "getScopedStorageKey('weather-city')", "getScopedStorageKey('weather-expanded')"],
    label: 'Weather widget keys are scoped to the active user'
  },
  {
    file: 'frontend/modules/widgets/js/ClockWidget.js',
    required: ['getScopedStorageKey', "getScopedStorageKey('mac-system-time-settings')", "getScopedStorageKey('mac-clock-expanded')"],
    label: 'Clock widget keys are scoped to the active user'
  }
];

let failed = false;
for (const check of checks) {
  const filePath = path.join(root, check.file);
  const source = fs.readFileSync(filePath, 'utf8');
  const missing = check.required.filter(token => !source.includes(token));
  if (missing.length) {
    failed = true;
    console.error(`FAIL: ${check.label} in ${check.file} is missing: ${missing.join(', ')}`);
  } else {
    console.log(`PASS: ${check.label}`);
  }
}

if (failed) {
  process.exit(1);
}
