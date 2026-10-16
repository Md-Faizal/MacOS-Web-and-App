const billing = require('./billing');
const analytics = require('./analytics');
const productList = require('./product-list');
const contacts = require('./contacts');
const auth = require('./auth');
const admin = require('./admin');
const settings = require('./settings');
const desktop = require('./desktop');
const notes = require('./notes');
const calendar = require('./calendar');
const logs = require('./logs');
const ai = require('./ai');
const suggestions = require('./suggestions');
const wallpaperContent = require('./wallpaper-content');
const cloudStorage = require('./cloud-storage');
const manufacturing = require('./manufacturing');
const compliance = require('./compliance');
const shared = require('./shared');

module.exports = {
  name: 'departments',
  billing,
  analytics,
  productList,
  contacts,
  auth,
  admin,
  settings,
  desktop,
  notes,
  calendar,
  logs,
  ai,
  suggestions,
  wallpaperContent,
  cloudStorage,
  manufacturing,
  compliance,
  shared,
  registry: shared,
  list() {
    return [
      'billing', 'analytics', 'product-list', 'contacts', 'auth', 'admin',
      'settings', 'desktop', 'notes', 'calendar', 'logs', 'ai', 'suggestions',
      'wallpaper-content', 'cloud-storage', 'manufacturing', 'compliance'
    ];
  },
  get(name) {
    return this.registry.get(name);
  }
};
