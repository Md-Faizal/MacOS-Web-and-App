const billing = require('../billing');
const analytics = require('../analytics');
const productList = require('../product-list');
const contacts = require('../contacts');

module.exports = {
  name: 'domain-registry',
  departments: {
    billing,
    analytics,
    'product-list': productList,
    contacts
  },
  list() {
    return Object.keys(this.departments);
  },
  get(name) {
    return this.departments[name] || null;
  }
};
