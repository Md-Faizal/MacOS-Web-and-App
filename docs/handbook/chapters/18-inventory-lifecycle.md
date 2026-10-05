# Product and Inventory Lifecycle

## Ownership and Screens

The main Product List UI is `frontend/modules/product-list/js/product-list.js`. The backend route owner is `backend/departments/product-list/`; its factory creates an engine handler set with the shared SQLite connection. Department metadata names products, categories, variants, batches and public catalog as owned responsibilities, while some metadata still mentions a legacy frontend handler path. Follow the `create()` factory and actual route table for current execution.

The UI's domain model nests `Product` → `ProductVariant` → `ProductBatch` for interaction, while the database stores normalized `products`, `variants`, and `batches` rows. Serializers translate between nested client state and API payloads. Keep those shapes distinct when debugging missing IDs, stale stock, or destructive sync.

## Catalog Read Path

`GET /api/products` returns products enriched with category/creator/editor metadata, variants and batches. Search requests first try the Rust SuiteCore bridge when it is loaded. If that path is unavailable/fails, the handler falls back to SQL `LIKE` over product name, alternate-language name and category. The no-search path reads catalog rows ordered by creation date.

The product response calculates batch `units_sold` from invoice-item quantities matched by direct batch ID or legacy variant/batch/product fields, then adds the stored `batches.units_sold` value. This supports older references but means the displayed quantity combines multiple sources. Before changing the formula, establish whether stored units are a legacy aggregate, an increment, or an authoritative value for each migrated record; add a fixture covering old and new invoice-item references.

On initialization, `ProductListApp` checks the API, then loads products/categories. It normalizes multiple historical response shapes and deserializes nested rows into client model instances. Product/variant/batch changes and billing invoice events invalidate `/products` and force a reload. The UI also reconciles the MacOS reactive store. A new/refreshed catalog update should preserve current subview/draft state; inspect the keep-alive panel before changing render calls.

## Route Inventory

| Method/path under `/api/products` | Operation | Evidence |
| --- | --- | --- |
| `GET /`, `POST /` | List/create product | `engine/routes.js`, `engine/handlers.js` |
| `GET /:id`, `PUT /:id`, `DELETE /:id` | Read/update/delete product | General routes are registered after static paths |
| `GET/POST/PUT/DELETE /categories...` | Category lifecycle | Category routes must precede `/:id` |
| `POST/PUT /variants...` | Variant create/update | Check exact ID and ownership validation |
| `POST/PUT/DELETE /batches...` | Batch create/update/delete | Check uniqueness and expiry/date validation |
| `POST /update-mrp` | MRP update | Inspect handler-specific fields |
| `GET/POST /catalog/pdf` | Catalog PDF generation | Verify data size, output and authorization |
| `/public/catalog`, `/public/:sku` | Public catalog lookup | Verify actual Express route precedence and public data projection |

The route file places generic `/:id` handlers before the later `/public/...` handlers. Confirm the public route behavior against Express matching and tests before documenting it as active; avoid assuming a handler declared later receives a request already matched by the generic route.

## Mutation Semantics

Product create and update handlers use better-sqlite3 transactions for the product plus nested variant/batch writes. Product deletion also uses a transaction, but its current manual cascade deletes invoice items, order items and customer-item memory before removing batches, variants and product rows. That has direct historical-record implications: deleting a catalog product can remove invoice/order line details rather than merely archive the product.

Do not describe delete as harmless catalog cleanup. Before using it against production data, confirm business retention/accounting requirements and backup/restore plan. Any change from deletion to archive/soft-delete must update FK/query behavior, API contracts, UIs and migration tests.

Variant/batch APIs are separate mutation endpoints. Product client methods invalidate `/products` and publish inventory events after API success. Some nested methods log that an update was saved locally when API synchronization fails; verify whether their caller retains local changes or presents an unsynced state. Never assume every `CoreDataBus.publish` means the server committed that exact payload.

## Search and Catalog Visibility

When investigating a search miss, record the exact query and whether the WASM bridge loaded. Compare SuiteCore scoring inputs/thresholds with the SQL fallback, which only checks selected text fields via substring matching. Verify normalization, language/diacritics, classification, category and variants before changing search behavior. Add parity fixtures for both branches and label which engine actually ran.

Public catalog endpoints should return an intentional public projection. Review SKU mapping, customer/private pricing, batch/expiry detail, file/PDF generation and access policy before exposing new fields. A UI menu being hidden is not API authorization.

## Inventory Mutation Test Matrix

| Scenario | Verify |
| --- | --- |
| Create product with multiple variants/batches | All normalized rows commit or roll back together |
| Update a product with retained/new/removed variants | Child ownership, update count and rollback on one invalid child |
| Delete product referenced by historical invoices/orders | Explicit retention decision and referential behavior |
| Add/update/delete a batch | Batch uniqueness, date parsing, inventory event and fresh list result |
| Invoice changes stock | Actual invoice-item references and quantity formula update displayed stock once |
| Rust search unavailable | SQL fallback behavior is surfaced and tested |
| Cross-tab inventory change | Event schema, cache invalidation, active-view refresh and draft preservation |

Use synthetic catalog rows only. Do not paste supplier/customer inventories, private purchase costs, or expiry-risk data into screenshots or agent context.