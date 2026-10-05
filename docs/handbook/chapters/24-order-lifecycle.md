# Order Stages and Invoice Conversion

## Domain Shape

Orders are a separate domain from invoices. The schema stores an order header (`order_number`, customer, stage, dates, QC/delivery notes, checklist, bill reference, status and total) plus `order_items` rows. The UI uses three stage identifiers: `stage1` intake, `stage2` QC/pack, and `stage3` dispatch/delivery. A stage string is workflow state, not proof an invoice has been created or goods have physically shipped.

Backend ownership begins at `backend/core/orders/` and is mounted into the Billing department under `/api/billing/orders`. The route table exposes create/list/next-number/detail/update/delete. Worker contact access is checked for customer-bound order operations.

## Create and Edit Order

Order creation requires customer ID and at least one item. It uses a supplied order number or generates one from the requested date, calculates a fallback total from item quantities/prices when total is absent, and checks global order-number uniqueness. If the number already exists for the same customer, the POST returns the existing order with a retry marker; if it belongs to a different customer, the handler returns 409.

The inspected create handler inserts the order header, then order items, enriches/reads the full order, audits and broadcasts. Verify whether this path has a transaction covering header and item inserts before describing create as atomic. The schema's unique `order_number` constraint and the handler's pre-check both matter under concurrency; test the collision between check and insert.

Update accepts stage, notes, QC/delivery fields, total and items. When a non-empty item array is provided, the handler deletes prior order items and inserts the replacement set. Inspect the implementation for transaction wrapping before promising that a failed item insert preserves the prior set. An empty array may not trigger replacement, so distinguish "clear all items" from "no item change" in the client contract.

## Three-Stage Browser Workflow

`frontend/modules/billing/js/new-order.js` owns the MacOS order workflow. It loads `/api/billing/orders`, tracks current order/stage and renders the relevant stage panel. Stage transitions update `current_stage` and call the order save path. Stage 1 supports catalog line items, an AI label-scan action, and a QR scanner for existing product/batch catalog tags. A product QR adds one unit when its options are unambiguous; batch QR selects the exact batch, and repeated scans increment the matching line. Product tags with multiple variants/batches keep the existing selection step. Order lines currently persist product/batch, quantity, and unit price; discounts, schemes, and tax remain part of invoice entry rather than the order-line contract. Stage 2 covers QC/packing and allows navigation back to Stage 1; Stage 3 captures delivery completion and can navigate back to Stage 2.

The UI can filter stage 2/stage 3 order queues separately. Verify whether each stage change is persisted before the next render and which fields are replaced when saving. A stage move should be tested against stale detail data and retries.

## Android Order Entry

`android/.../ui/screens/billing/NewOrderScreen.kt` derives contacts/products from `BillingViewModel`. It fetches a next order number when opened and keeps customer, stage, notes and line items as Compose state. For non-empty items, it calculates an immediate local preview and starts a server calculation after a 200 ms debounce.

On save, Android prefers items in the server calculation response, but if no successful result is present it can fall back to mapping the raw client items and computes total from those values. This means the order-create request is not guaranteed to wait for authoritative server calculation. The server's later invoice conversion recalculates the order items; document/test that boundary and do not call order creation itself server-authoritative.

Android order screen paths and permission behavior should be verified against the current navigation and ViewModel. A successful order creation callback is not the same as invoice conversion or delivery completion.

## Convert Order to Invoice

The route is `POST /api/billing/orders/:id/convert-to-invoice` and is handled by the Billing engine. The handler:

1. Loads order and customer; returns 404 if the order is absent and checks worker customer access.
2. Loads order item rows joined to product/variant/batch context; rejects orders without items.
3. Maps order rows to billing calculator inputs and recalculates via the server-authoritative bill calculator.
4. Generates a new invoice number, inserts the invoice header and calculated invoice items.
5. Advances the order to `stage3`, marks it completed, sets bill reference/delivery date, audits and returns invoice ID/number/total.

The inspected conversion handler does not visibly wrap invoice insert, all invoice items, and order-stage update in one explicit transaction. A failure partway through can leave an invoice/order state that needs reconciliation. Before relying on exactly-once conversion, test retry after each failure point and add an idempotency marker or transaction-backed conversion contract as approved by the domain owner.

The endpoint's route-level authentication and customer scope come from the `/api/billing` mount and handler access check. The main handler path shown does not broadcast invoice/ledger events in the conversion excerpt; verify current source around that handler before claiming a converted order updates every open view in real time.

## Order-to-Invoice Test Matrix

| Scenario | Expected contract to verify |
| --- | --- |
| Create with duplicate order number for same customer | Idempotent retry response; no duplicate header/items |
| Create with duplicate number for another customer | 409 conflict and no new rows |
| Worker creates/reads/updates inaccessible customer's order | 403 and no data leakage |
| Stage transition and back navigation | Stage and QC/delivery fields persist correctly |
| Empty/replacement item update | Explicit semantics; no accidental orphan/replacement loss |
| Invalid order item insertion | Header/items are either atomic or explicitly repairable |
| Convert without order items | 400 and no invoice created |
| Convert with stale client amounts | Server calculation governs invoice amount |
| Conversion retry after timeout | No duplicate invoice; order and invoice linkage reconciles |
| Conversion mid-write failure | Transaction/rollback or documented recovery is tested |
| Android server calculation unavailable | User is told the request used fallback data or submission is blocked, as designed |

## Screenshot Placeholder

![Screenshot placeholder: order intake, QC, and delivery stages](asset:screenshot-placeholder.svg)

**Figure BILL-05. Order stage workflow.** Capture stage 1, stage 2 and stage 3 with a synthetic customer and products. Include app build/revision, platform, viewport/device, selected stage, and the transition/save state. Do not show real order numbers or customer delivery details.