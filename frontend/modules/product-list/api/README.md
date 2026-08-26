# Product List Module API Documentation

This directory contains the complete backend API router, route handlers, and database interfaces for the **Product List Module**.

---

## 📌 Overview

- **Base Route**: `/api/products`
- **Database Tables**: `products`, `categories`, `variants`, `batches` (SQLite via `better-sqlite3`)
- **Module Path**: `frontend/modules/product-list/api/`
  - `index.js`: Express router mounting & database initialization
  - `routes.js`: Route definitions (orders static/sub-resource routes before wildcard `/:id`)
  - `handlers.js`: Database query logic, atomic transaction diffing, and business rules

---

## 🗄️ Database Relationships

The `products` table serves as the primary catalog entity for all items in the system. It forms a 4-tier relational structure with categories, pack size variants, and manufacturing batches:

```
                  ┌─────────────────┐
                  │   categories    │
                  └────────┬────────┘
                           │ 1:N
                           ▼
                  ┌─────────────────┐
                  │    products     │
                  └────────┬────────┘
                           │ 1:N
                           ▼
                  ┌─────────────────┐
                  │    variants     │
                  └────────┬────────┘
                           │ 1:N
                           ▼
                  ┌─────────────────┐
                  │     batches     │
                  └─────────────────┘
```

---

## 📋 Data Structure (Product Entity)

```json
{
  "id": 1,
  "name": "Brahmi Taila",
  "category_id": 3,
  "category_name": "Herbal Tonics",
  "classification": "Gold",
  "created_at": "2026-07-26 12:00:00",
  "updated_at": "2026-07-26 12:00:00",
  "pack": "200 ML",
  "batch_no": "BATCH-001",
  "mrp": 200.0,
  "variants": [
    {
      "id": 10,
      "product_id": 1,
      "pack_size_value": 200,
      "pack_size_type": "ML",
      "created_at": "2026-07-26 12:00:00",
      "updated_at": "2026-07-26 12:00:00",
      "batches": [
        {
          "id": 101,
          "variant_id": 10,
          "batch_no": "BATCH-001",
          "mrp": 200.0,
          "mfg_date": "2024-01-01",
          "exp_date": "2026-01-01",
          "units_sold": 0,
          "created_at": "2026-07-26 12:00:00",
          "updated_at": "2026-07-26 12:00:00"
        }
      ]
    }
  ],
  "batches": [
    {
      "id": 101,
      "variant_id": 10,
      "batch_no": "BATCH-001",
      "mrp": 200.0,
      "mfg_date": "2024-01-01",
      "exp_date": "2026-01-01",
      "units_sold": 0
    }
  ]
}
```

### Field Descriptions
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | Integer/String | Primary key auto-increment product ID |
| `name` | String | Product title / name (Required) |
| `category_id` | Integer | Foreign key ID referencing `categories.id` |
| `category_name` | String | Joined name of the product category |
| `classification` | String | Item classification tier (`Gold` or `Non-Gold`) |
| `pack` | String | Summary string of first variant (e.g. `"200 ML"`) |
| `batch_no` | String | Summary batch number of first batch lot |
| `mrp` | Double | Summary MRP price (₹) of first batch lot |
| `variants` | Array<Variant> | List of pack size variants under this product |
| `variants[].pack_size_value` | Double/String | Numeric pack quantity (e.g. `200`, `500`) |
| `variants[].pack_size_type` | String | Unit measure (`ML`, `GMS`, `TAB`, `L`, `KG`, `PCS`) |
| `variants[].batches` | Array<Batch> | List of physical batches under this variant |
| `batches[].batch_no` | String | Manufacturing lot number (e.g. `"BATCH-001"`) |
| `batches[].mrp` | Double | Maximum Retail Price (₹) |
| `batches[].mfg_date` | String | Manufacturing date (`YYYY-MM-DD`) |
| `batches[].exp_date` | String | Expiry date (`YYYY-MM-DD`) |
| `batches[].units_sold` | Integer | Cumulative sold units count |
| `created_at` | String | Timestamp of entity creation |
| `updated_at` | String | Timestamp of most recent modification |

---

## 🚀 API Endpoints Reference

### 1. Get All Products
- **Endpoint**: `GET /api/products`
- **Query Params**: `?search=...` (optional case-insensitive search by product name)
- **Description**: Returns all products with nested variants, batches, and top-level summary attributes (`pack`, `batch_no`, `mrp`).
- **Response**: `Array<Product>`

---

### 2. Create Product
- **Endpoint**: `POST /api/products`
- **Description**: Transactionally creates a product along with nested variants and batches inside a single atomic `db.transaction()`.
- **Body**:
  ```json
  {
    "name": "Brahmi Taila",
    "category_name": "Herbal Tonics",
    "classification": "Gold",
    "variants": [
      {
        "pack_size_value": "200",
        "pack_size_type": "ML",
        "batches": [
          {
            "batch_no": "BATCH-001",
            "mrp": 200.0,
            "mfg_date": "2024-01-01",
            "exp_date": "2026-01-01",
            "units_sold": 0
          }
        ]
      }
    ]
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "id": 1,
    "name": "Brahmi Taila",
    "category_id": 3,
    "classification": "Gold"
  }
  ```

---

### 3. Get Single Product
- **Endpoint**: `GET /api/products/:id`
- **Description**: Returns a single product object with full nested variants and batches.
- **Response**: `Product` object or `404 Not Found`.

---

### 4. Update Product
- **Endpoint**: `PUT /api/products/:id`
- **Description**: Dynamically diffs and updates product info, variants, and batches inside an atomic transaction. Omitted variant or batch IDs are automatically deleted from the database.
- **Body**: Product update object with nested variants and batches.
- **Response**:
  ```json
  { "success": true, "id": "1" }
  ```

---

### 5. Delete Product
- **Endpoint**: `DELETE /api/products/:id`
- **Description**: Deletes the product safely inside a **database transaction**. Cascades manual deletion across dependent child records (`invoice_items`, `order_items`, `customer_item_memory`, `batches`, and `variants`) prior to deleting the product row.
- **Response**:
  ```json
  { "success": true, "id": "1" }
  ```

---

### 6. Get Categories
- **Endpoint**: `GET /api/products/categories`
- **Description**: Returns all categories ordered alphabetically by name (`COLLATE NOCASE ASC`).
- **Response**: `Array<Category>`

---

### 7. Create Category
- **Endpoint**: `POST /api/products/categories`
- **Body**: `{ "name": "Herbal Tonics" }`
- **Response**: `201 Created`
  ```json
  { "success": true, "id": 3, "name": "Herbal Tonics" }
  ```

---

### 8. Update Category
- **Endpoint**: `PUT /api/products/categories/:id`
- **Body**: `{ "name": "Ayurvedic Tonics" }`
- **Response**:
  ```json
  { "success": true, "id": "3", "name": "Ayurvedic Tonics" }
  ```

---

### 9. Delete Category
- **Endpoint**: `DELETE /api/products/categories/:id`
- **Description**: Deletes category. Blocked with `400 Bad Request` if products currently reference this category.
- **Response**:
  ```json
  { "success": true, "id": "3" }
  ```

---

### 10. Create Variant
- **Endpoint**: `POST /api/products/variants`
- **Body**: `{ "product_id": 1, "pack_size_value": 500, "pack_size_type": "ML" }`
- **Response**: `201 Created`

---

### 11. Update Variant
- **Endpoint**: `PUT /api/products/variants/:id`
- **Body**: `{ "pack_size_value": 450, "pack_size_type": "ML" }`
- **Response**: `{ "success": true, "id": "10" }`

---

### 12. Create Batch
- **Endpoint**: `POST /api/products/batches`
- **Body**: `{ "variant_id": 10, "batch_no": "BATCH-002", "mrp": 400.0, "mfg_date": "2024-01-01", "exp_date": "2026-01-01" }`
- **Response**: `201 Created`

---

### 13. Update Batch
- **Endpoint**: `PUT /api/products/batches/:id`
- **Body**: `{ "batch_no": "BATCH-002", "mrp": 450.0, "units_sold": 10 }`
- **Response**: `{ "success": true, "id": "101" }`

---

### 14. Delete Batch
- **Endpoint**: `DELETE /api/products/batches/:id`
- **Response**: `{ "success": true, "id": "101" }`

---

### 15. Bulk Update MRP
- **Endpoint**: `POST /api/products/update-mrp`
- **Body**: `{ "product_id": 1, "variant_id": 10, "batch_no": "BATCH-001", "mrp": 220.0 }`
- **Response**: `{ "success": true }`

---

## 📱 Integration Across Clients

### 1. Web Frontend (`frontend/modules/product-list/js/product-list.js`)
- Uses standard `fetch('/api/products', { credentials: 'same-origin' })`.
- Transmits session auth cookies to comply with web security model.
- Syncs variants and batches inline during product form save operations.

### 2. Native Android App (`android/app/...`)
- **Retrofit Interface**: `ApiService.kt` (`getProducts`, `createProduct`, `updateProduct`, `deleteProduct`, `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `updateVariant`, `updateBatch`, `deleteBatch`).
- **Authentication**: `NetworkClient.kt` injects both `Authorization: Bearer <token>` and `Cookie: auth_token=<token>`.
- **View Model**: `MainViewModel.kt` (`loadProducts`, `createProduct`, `updateProduct`, `deleteProduct`, `createCategory`, `updateCategory`, `deleteCategory`, `updateVariant`, `updateBatch`, `deleteBatch`).
- **Compose Screen**: `ProductsScreen.kt` featuring native Material 3 UI, zero-space notification bar header placement, dual-tab animation (Products & Categories), automatic refresh on open, `PullToRefreshBox`, alphabetical A-Z/Z-A grouping with collapsible headers, and confirmed deletion bottom sheets.
