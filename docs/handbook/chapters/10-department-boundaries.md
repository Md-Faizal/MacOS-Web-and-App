# Departments and Data Boundaries

## Department Model

`backend/departments/README.md` describes departments as domain-owned modules that may expose metadata, canonical contracts, services, and routers. The API entry point currently constructs department instances with the initialized shared database, calls initialization functions, builds a route list, and mounts those routers under prefixes. This is a gradual ownership boundary: documentation should distinguish a department contract from a legacy compatibility handler when both exist.

The department README lists billing, analytics, product-list, contacts, auth, admin, settings, desktop, notes, calendar, logs, ai, suggestions, wallpaper-content, and cloud-storage. The server entrypoint also composes some cross-cutting surfaces directly, including Android updates, QR routing, profile/OAuth, owner administration, and event streams. A directory name, registry entry, and mounted endpoint are different facts; trace each one before claiming completeness.

## Route Ownership at the Server Boundary

The route table in `backend/main/macos-api-server.js` currently mounts these router groups:

| Prefix | Owner/router source | Notes to verify in the feature |
| --- | --- | --- |
| `/api/billing` | Billing department | Invoices, payment-related and nested commerce endpoints are consolidated here; inspect sub-router and route-specific public exceptions |
| `/api/products` | Product List department | Product/catalog routes and selectively public product views |
| `/api/contacts` | Contacts department | Contact reads and mutations |
| `/api/notes`, `/api/calendar` | Notes and Calendar departments | Domain-specific CRUD and associated validation |
| `/api/analytics` | Analytics department | Verify whether each response is computed, cached, or persisted |
| `/api/settings`, `/api/desktop` | Settings and Desktop departments | Desktop subrouters include clock, weather, quick notes, and reminders |
| `/api/suggestions`, `/api/logs`, `/api/ai` | Suggestion, Logs, and AI departments | Logs contain a specific unauthenticated app-report exception; inspect before changing |
| `/api/wallpapers`, `/api/cloud` | Content and storage departments | Public read/share paths have selective gates; verify path and method |

Additional endpoints are directly attached for `/api/auth`, `/api/admin`, `/api/profile`, `/api/events`, `/api/realtime/events`, and `/api/android/update`. A question about an endpoint should start at its exact route definition, follow to the handler, then inspect the router's contract and data access. Do not treat the table above as the complete API catalog.

## Middleware and Policy Ownership

Middleware can execute before the route and change what the handler receives or whether it runs. Relevant categories include:

- Request IDs are accepted/generated and returned in `X-Request-ID`; use them to correlate logs without copying sensitive request values.
- JSON/urlencoded parsers define payload limits; oversized or malformed bodies are handled centrally.
- CSRF validation applies conditionally to cookie-session mutations. Bearer/mobile paths are separate auth flows.
- CORS origin decisions gate browser cross-origin access, not user permission.
- Rate limiting applies to a fixed set of sensitive auth paths in the inspected entrypoint; don't assume it is a general API quota.
- Route mounts apply authentication, owner-only checks, or narrowly scoped exceptions depending on prefix and subpath.

When changing middleware or authorization, capture the route/method/auth state matrix in a test. A successful health endpoint, OPTIONS response, or static page request does not verify authorization for business mutations.

## Data Ownership Workflow

For a persistent domain, establish these facts before changing its API:

1. Which migration/schema statement creates or alters the relevant table/index/constraint?
2. Which `DatabaseManager` connection and transaction boundaries are used?
3. Which department/service owns validation and business rules?
4. Which route enforces authentication, user/owner permissions, and input bounds?
5. Which clients submit or consume this shape, including browser, Zentra, Android, and any Rust bridge?
6. Which tests prove migration compatibility, invalid input handling, concurrency/order guarantees, and output shape?
7. What backup/restore or rollback action is available if the persistent change fails?

Use `docs/DATABASE_SCHEMA.md` and `docs/BILLING_DB_SCHEMA.md` as maps, not executable truth. Verify current schema and migrations before documenting columns, defaults, indexes, triggers, or deletion behavior. Avoid suggesting destructive database commands in routine setup instructions.

## Event and Synchronization Contracts

For a real-time update, document the mutation event at both sides: the backend broadcast call, the domain/action/payload schema, transport (local event, cross-tab channel, or server stream), consumer subscription, cache invalidation, and render/update behavior. Distinguish optimistic UI state from server-committed state. Include behavior for reconnect, duplicate origin, stale cache, and failure only where current code or tests demonstrate it.

The shared Rust crate is another potential compute boundary, not a generic owner for all business rules. Link a payload to the Rust type, export, JS/JNI wrapper, actual client call site, and parity test. If any link in that chain is absent, mark integration as planned or unverified.

## Contract Change Checklist

Before merging an API/data contract change, check the route, schema/migration, department contract, response/error helper, authorization middleware, all clients, Rust bridge types where applicable, and focused contract tests. Update the chapter and AI routing only when ownership or task navigation changed. Never place production database records or secrets in example payloads.