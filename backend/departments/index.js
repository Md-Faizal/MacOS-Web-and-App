const billing = require('./billing');
const analytics = require('./analytics');
const productList = require('./product-list');
const contacts = require('./contacts');
const shared = require('./shared');

module.exports = {
  name: 'departments',
  billing,
  analytics,
  productList,
  contacts,
  shared,
  registry: shared,
  list() {
    return ['billing', 'analytics', 'product-list', 'contacts'];
  },
  get(name) {
    return this.registry.get(name);
  }
};
