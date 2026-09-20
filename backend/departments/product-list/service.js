const {
  buildProductListResponse,
  buildProductCategoriesResponse
} = require('../../shared/api/product-list-contract');

function normalizeListOptions(options = {}) {
  return {
    requestId: options.requestId || null,
    categoryId: options.categoryId || options.category_id || null,
    search: options.search || null
  };
}

function getProducts(products, options = {}) {
  const normalized = normalizeListOptions(options);
  return buildProductListResponse(Array.isArray(products) ? products : [], normalized.requestId);
}

function getProductCategories(categories, options = {}) {
  const normalized = normalizeListOptions(options);
  return buildProductCategoriesResponse(Array.isArray(categories) ? categories : [], normalized.requestId);
}

module.exports = {
  name: 'product-list',
  normalizeListOptions,
  getProducts,
  getProductCategories
};
