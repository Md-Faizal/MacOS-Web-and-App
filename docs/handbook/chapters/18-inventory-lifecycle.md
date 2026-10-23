# Product and Inventory Lifecycle

## Ownership and Screens

The main Product List UI is `frontend/modules/product-list/js/product-list.js`. The backend route owner is `backend/departments/product-list/`; its factory creates an engine handler set with the shared SQLite connection. Department metadata names products, categories, variants, batches and public catalog as owned responsibilities, while some metadata still mentions a legacy frontend handler path. Follow the `create()` factory and actual route table for current execution.

The UI's domain model nests `Product` → `ProductVariant` → `ProductBatch` for interaction, while the database stores normalized `products`, `variants`, and `batches` rows. Serializers translate between nested client state and API payloads. Keep those shapes distinct when debugging missing IDs, stale stock, or destructive sync.

## QR Label Generation and Verification

Product-list PDFs refresh the catalog from the API immediately before generating labels and embed stable product, variant, and batch IDs. `VITE_PUBLIC_APP_URL` configures the public HTTPS origin encoded in QR links; local-host printing is blocked unless this is explicitly configured, preventing labels that point to an unreachable development server. Batch links include the human-readable batch number plus stable IDs. The public product page resolves a batch QR through its `sku` product ID and highlights the exact `batch_id`; it must not silently show a sample/fallback product when a QR lookup fails. The PDF API rejects requests without current product-list HTML rather than silently producing a QR-free fallback catalog.

For print-press handoff, Product List also exposes `POST /api/products/catalog/print-assets`. It reads the current catalog from SQLite, reuses the stable product/batch URL builders, and invokes the SuiteCore Rust/WASM renderer for a monochrome vector A4 label-sheet PDF. The SVG + CSV designer ZIP includes one resizable, viewBox-based black-and-white QR SVG per batch (or one product QR when that product has no batches), a stable-ID-to-QR mapping CSV, the Rust PDF, and a print note. The reference PDF uses a 3 × 8 A4 sheet grid and exports are capped at 2,000 labels; actual sticker stock, final label size, safe area, and cut lines are not inferred and must be confirmed with the press. The existing styled, Odia-capable catalogue PDF remains on Puppeteer to preserve its current layout; the Rust path is the dedicated production QR-label export.

Keep catalog IDs stable after labels are printed. Before launch, test generated product and batch QR links on the public hostname, verify deleted/missing IDs fail clearly, and confirm product-list print actions stop rather than print from stale catalog data if the API refresh fails.

## Catalog Read Path

`GET /api/products` returns products enriched with category/creator/editor metadata, variants and batches. Search requests first try the Rust SuiteCore bridge when it is loaded. If that path is unavailable/fails, the handler falls back to SQL `LIKE` over product name, alternate-language name and category. The no-search path reads catalog rows ordered by creation date.

The product response calculates batch `units_sold` from invoice-item quantities matched by direct batch ID or legacy variant/batch/product fields, then adds the stored `batches.units_sold` value. This supports older references but means the displayed quantity combines multiple sources. Before changing the formula, establish whether stored units are a legacy aggregate, an increment, or an authoritative value for each migrated record; add a fixture covering old and new invoice-item references.

On initialization, `ProductListApp` checks the API, then loads products/categories. It normalizes multiple historical response shapes and deserializes nested rows into client model instances. Reactive-store payloads are rehydrated when received and before product, category, and inventory rendering so model methods remain available. Product/variant/batch changes and billing invoice events invalidate `/products` and force a reload. The UI also reconciles the MacOS reactive store. A new/refreshed catalog update should preserve current subview/draft state; inspect the keep-alive panel before changing render calls.

## Route Inventory

| Method/path under `/api/products` | Operation | Evidence |
| --- | --- | --- |
| `GET /`, `POST /` | List/create product | `engine/routes.js`, `engine/handlers.js` |
| `GET /:id`, `PUT /:id`, `DELETE /:id` | Read/update/delete product | General routes are registered after static paths |
| `GET/POST/PUT/DELETE /categories...` | Category lifecycle | Category routes must precede `/:id` |
| `POST/PUT /variants...` | Variant create/update | Check exact ID and ownership validation |
| `POST/PUT/DELETE /batches...` | Batch create/update/delete | Check uniqueness and expiry/date validation |
| `POST /update-mrp` | MRP update | Inspect handler-specific fields |
| `GET/POST /catalog/pdf` | Styled catalogue PDF generation | Verify data size, output and authorization |
| `POST /catalog/print-assets` | Rust QR-label PDF or SVG/CSV designer ZIP | Verify stable QR URLs, output sizes, and press dimensions |
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