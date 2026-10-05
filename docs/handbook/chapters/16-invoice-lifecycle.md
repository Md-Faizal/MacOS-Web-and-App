# Invoice Creation and Integrity Lifecycle

## Scope and Entry Points

This chapter traces the current MacOS browser create-invoice path. It does not assert identical Android behavior, a complete GST compliance guarantee, or atomic persistence. Verify current code whenever any of the call sites below changes.

| Stage | Source |
| --- | --- |
| Browser form and submit event | `frontend/modules/billing/js/new-bill.js` |
| Shared request wrapper | `BillingAPI` in `frontend/modules/billing/js/billing-app.js` |
| Billing route | `backend/departments/billing/engine/routes.js` |
| Create handler | `backend/departments/billing/engine/handlers.js`, `createBill` |
| Server calculation | `backend/core/billing/calculator.js` |
| Persistent schema | `backend/core/db/schema-master.js` |
| Server event transport | `backend/core/sync/data-bus.js` |

The router registers `/calculate` before the generic `/:id` route and mounts `POST /` to `createBill`. The main API server mounts the billing router at `/api/billing` with an auth middleware and explicit exceptions for public subpaths and its event stream. Therefore ordinary invoice creation is on the authenticated path.

## Browser Payload Preparation

The create form reads customer name and date fields, maps each in-memory product through `BillCalculator.frontendToDb`, and computes a client summary for the UI. If no due date was provided, the inspected code derives one seven days after the selected invoice date, preserving local date components to avoid a UTC date shift. Create mode sends `invoice_no: null` and includes customer name, due/invoice date, line products, displayed subtotal/discount/GST/rounding/grand-total values, and a client `previous_due` of zero.

Those client totals are useful for a preview but are not authoritative. The backend receives the line items and recalculates through the server calculation engine. Do not document a client-provided total as the value persisted by the API.

## Server Validation and Calculation

The handler:

1. Requires a customer ID or name, then requires a non-empty `products` array.
2. When only a name is supplied, performs a case-insensitive contact lookup and may create a contact if one does not exist.
3. Checks whether the authenticated user can access the resolved customer; a worker denial returns 403.
4. Calls `calculateBillItemsAndSummary` with the resolved customer, submitted products, round-off behavior, invoice date and request user.
5. Uses the server result for subtotal, discounts, GST, round-off, grand total, previous due and item rows.
6. Generates the invoice number on the server when the request leaves `invoice_no` empty.

The handler returns local JSON error objects for its validation/creation errors, including 400 for missing required input and 403 for inaccessible customers. This path does not consistently use the shared response envelope; clients should handle its actual shape rather than assuming every response has a standard `meta` object.

## Persistence Sequence Observed in Source

The handler inserts the invoice record, then inserts each calculated invoice item, updates per-customer/product preference memory, calculates customer totals/status, writes an activity log, broadcasts billing events and returns HTTP 201 with the generated identifiers and calculated result.

Important observed failure behavior:

- The invoice insert is individually caught; an insert error returns 500.
- Each invoice-item insert is caught inside the item loop and logged, but the loop continues. In the inspected handler path, this does not abort the request or remove the invoice.
- Preference-memory writes are also caught and logged individually.
- The inspected create handler does not wrap invoice, item, preference, and event work in a single SQLite transaction.
- Therefore a 201 response is not currently proof every requested item row was written. Do not describe this path as atomic until code and tests establish that property.
- The handler performs contact creation before invoice insertion; verify that side effect and rollback behavior when a later step fails.

These are documentation findings, not an approved substitute for fixing data-integrity risk. Before relying on an all-or-nothing invoice guarantee, add a focused test that injects a line-item failure and asserts the intended invoice/contact/item state. If atomicity is required, review a transaction boundary and event timing with the domain owner; do not simply move broadcasts into an open transaction.

## Response, Local UI State, and Events

On success, the handler returns status 201 with invoice ID/number/reference, customer identifiers/name, calculated totals, due/date, projected due, calculated items, item count and timestamp. It broadcasts `billing:invoice` / `created` with an invoice summary and `billing:ledger` / `updated` with the customer ID. Consumers should treat these events as refresh/invalidation signals; the invoice event payload is not the full canonical row.

The browser awaits `BillingAPI.createBill`, displays a success notification, appends a local bill record containing the server-generated IDs/number, publishes local CoreDataBus events, attempts to reload billing data, clears the form and returns to the existing-bills view. A reload failure is logged after create success; it does not change the already received server result. On request failure, the browser displays an error and retains the create path's failure state for correction/retry.

Do not equate the server broadcast with the browser's local event: they are separate producers and may carry different payloads/origins. Verify deduplication and subscribers before changing notifications or refresh behavior.

## Review and Test Checklist

| Invariant | Evidence/test to add or inspect |
| --- | --- |
| Customer resolution is deterministic | Case-insensitive match, duplicate names, worker scope, and contact-creation tests |
| Client totals cannot override server calculation | Request with deliberately inconsistent totals; assert persisted/returned values are server-calculated |
| Invoice numbering remains unique under concurrent requests | Concurrent create test against a disposable DB; inspect unique index/generator transaction |
| Line-item failure has explicit semantics | Force an item insert failure; assert rollback or documented partial result |
| Contact creation and invoice failure are coherent | Force post-contact create failure; assert intended contact cleanup/persistence |
| Worker customer access is enforced server-side | Allowed and denied user-contact scope cases |
| Response shape is handled by all clients | Browser/Android contract tests for 201 and 4xx/5xx variants |
| UI/event refresh does not resurrect stale data | Local create, cross-tab event and API refetch integration test |
| Financial fields have defined rounding precision | Calculator tests, stored values, serialization and cross-platform parity |

Use only synthetic customer, product, batch and amount fixtures. Do not copy production invoice payloads into tests or screenshots.