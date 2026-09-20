const billing = require('../billing');
const analytics = require('../analytics');
const productList = require('../product-list');
const contacts = require('../contacts');
const auth = require('../auth');
const admin = require('../admin');
const settings = require('../settings');
const desktop = require('../desktop');
const notes = require('../notes');
const calendar = require('../calendar');
const logs = require('../logs');
const ai = require('../ai');
const suggestions = require('../suggestions');
const wallpaperContent = require('../wallpaper-content');
const cloudStorage = require('../cloud-storage');

module.exports = {
  name: 'domain-registry',
  departments: {
    billing,
    analytics,
    'product-list': productList,
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
    'wallpaper-content': wallpaperContent,
    'cloud-storage': cloudStorage
  },
  list() {
    return Object.keys(this.departments);
  },
  get(name) {
    return this.departments[name] || null;
  }
};
