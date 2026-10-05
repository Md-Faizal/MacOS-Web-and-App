# Data and Domain Ownership

## Persistence Entry Points

| Concern | Owner | Verify |
| --- | --- | --- |
| SQLite file open and initialization | `backend/core/db/database-manager.js` | Effective path, WAL pragmas, repair order, migration and integrity checks |
| Master `CREATE TABLE` statements | `backend/core/db/schema-master.js` | Full SQL, uniqueness, FK actions, indexes and column nullability |
| File-backed migrations | `backend/core/db/migrations/` | Ordering, idempotency and compatibility |
| API response shape | `backend/shared/api/response.js` | Handler use; legacy response shapes may differ |
| Department contract registry | `backend/departments/` | Registry metadata versus actual router mount/callers |

## Core Relationship Map

- `contacts` is a customer/supplier master referenced by invoices and orders.
- `categories` categorize products; products reference categories.
- `variants` belong to products; batch records belong to variants and have variant-scoped batch uniqueness.
- `invoices` reference contacts; `invoice_items` belong to invoices and may reference product, variant, and batch rows.
- Invoice-item rows use cascading relationships from invoice and selected product/catalog entities; inspect SQL before deletion changes.
- `payments` reference contacts and may reference invoices; deleting a referenced invoice is configured to null the payment's invoice relationship.
- `ledger` stores customer-level account summary fields; do not assume exactly one row per customer unless code/schema enforces it.
- `orders` reference contacts; `order_items` belong to an order and may refer to product/variant/batch records.
- Auth schemas include user, session, refresh-token, WebAuthn, audit, identity and lifecycle-related tables.
- Desktop, calendar, reminders, cloud, settings, and logs have additional tables in the master schema.

Financial values include SQLite `REAL` columns in the current master schema. Confirm rounding/quantization in domain calculations and serializers; do not claim integer-paise persistence from the Rust ledger alone.

## Billing Department Navigation

`backend/departments/billing/index.js` declares billing responsibilities and constructs a router/service from the shared database. Its initialization wires submodules for orders, payments, variants, batches, credit notes and invoices before creating the main billing routes. The server mounts this router at `/api/billing` with selective public subpaths. Trace feature paths as:

1. Browser/Android billing action.
2. API method/path and authenticated caller.
3. Billing router or nested submodule.
4. Handler/service and shared billing calculator.
5. SQLite transaction/statements and linked tables.
6. Data-bus broadcast or client refresh, if present.
7. Contract test and UI result/error state.

The department's `ownedResponsibilities` metadata is useful navigation but does not prove every listed responsibility has migrated from legacy code. Check `compatibilityEngine`, route/service implementation, and actual invocation.

## Product and Inventory Navigation

- Product master, variant and batch schema are separate tables with FK relationships.
- Product UI is under `frontend/modules/product-list/`; server ownership starts at `backend/departments/product-list/`.
- Billing can consume catalog/batch data; verify stock mutation at invoice handler and transaction boundary.
- Expiry/batch terminology and quantities may have UI calculations that differ from persisted fields; inspect serializer and tests.
- Catalog screen and batch screenshots must use synthetic products and non-sensitive dates.

## Migration and Backup Safety

- Startup runs repair/schema/migration/cleanup/integrity logic before APIs are initialized.
- The master schema should not be edited as if startup only adds missing tables; cleanup behavior can affect an existing file.
- Test a migration against empty and synthetic legacy database copies, then verify a second run is safe.
- Keep live WAL databases on an approved SQLite-aware backup path; don't copy a changing database file alone as a recovery guarantee.
- `npm run migrate:ledger:preview` and the mutating ledger migration are feature-specific commands; inspect their scripts and target before use.
- Production backup frequency, off-host retention, restore test, RPO/RTO and accountable operator are owner-confirmation items.

## Documentation Boundaries

Use `docs/DATABASE_SCHEMA.md` and `docs/BILLING_DB_SCHEMA.md` as starting maps, not current executable truth. When a contract changes, update migration, API/department contract, clients, tests and affected handbook chapter together. Keep example IDs/data synthetic. Never export a production DB, credentials, personal identifiers or payment details into AI references.

For cross-client event behavior and the process-wide SSE access review, route to `docs/handbook/chapters/17-realtime-sync.md`. Event payloads are not a durable queue or a substitute for fetching canonical rows.