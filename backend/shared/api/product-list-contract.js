function buildProductListResponse(products, requestId) {
  const items = Array.isArray(products) ? products : [];

  return {
    success: true,
    data: {
      requestId: requestId || null,
      domain: 'product-list',
      resource: 'products',
      items,
      count: items.length,
      generatedAt: new Date().toISOString()
    },
    meta: {
      generatedAt: new Date().toISOString(),
      status: 'ready',
      count: items.length,
      source: 'product-list-engine'
    },
    count: items.length,
    items
  };
}

function buildProductCategoriesResponse(categories, requestId) {
  const items = Array.isArray(categories) ? categories : [];

  return {
    success: true,
    data: {
      requestId: requestId || null,
      domain: 'product-list',
      resource: 'product-categories',
      items,
      count: items.length,
      generatedAt: new Date().toISOString()
    },
    meta: {
      generatedAt: new Date().toISOString(),
      status: 'ready',
      count: items.length,
      source: 'product-list-engine'
    },
    count: items.length,
    items
  };
}

module.exports = {
  buildProductListResponse,
  buildProductCategoriesResponse
};
