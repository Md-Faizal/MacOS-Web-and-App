const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '../../database/MacOS.db'));
const { buildProductListResponse, buildProductCategoriesResponse } = require('../shared/api/product-list-contract');

const productsStmt = db.prepare(`
  SELECT p.*, c.name as category_name
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  ORDER BY p.created_at DESC
`);
const products = productsStmt.all();
const categoriesStmt = db.prepare('SELECT id, name, english_meaning, created_at FROM categories ORDER BY id ASC');
const categories = categoriesStmt.all();

const productResponse = buildProductListResponse(products, 'phase4-check');
const categoryResponse = buildProductCategoriesResponse(categories, 'phase4-check');

console.log('=== PHASE 4 PRODUCT LIST CONTRACT CHECK ===');
console.log('products success:', productResponse.success, 'count:', productResponse.data.count);
console.log('categories success:', categoryResponse.success, 'count:', categoryResponse.data.count);

const ok = productResponse.success && categoryResponse.success && productResponse.data.count > 0 && categoryResponse.data.count > 0;
if (!ok) {
  console.error('Phase 4 product list contract check failed.');
  process.exit(1);
}

console.log('\nPhase 4 product list contract checks passed.');
