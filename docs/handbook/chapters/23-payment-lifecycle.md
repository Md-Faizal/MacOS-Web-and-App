# Payments, Credit Notes, and Ledger Updates

## Route Families: Do Not Confuse Them

Billing currently has more than one route family with similar names:

| URL under `/api/billing` | Implementation | Storage/meaning |
| --- | --- | --- |
| `/invoices/payments` | Invoice module's payment handler (`backend/core/invoices/payments.js`) | Unified `payments` table; `type='PAYMENT'` |
| `/invoices/creditnotes` | Same invoice payment handler | Unified `payments` table; `type='CREDIT_NOTE'` |
| `/invoices/payments/:id` | Same invoice payment handler | Updates/deletes a payment or unified credit-note record and re-syncs ledger |
| `/payments/...` | Separate core payments module | Legacy transaction/payment model; inspect its schema/handler, do not assume equivalent columns |
| `/creditnotes/...` | Separate core credit-notes module | Separate `credit_notes` table, distinct from unified invoice `payments` rows |

The Billing department composes nested modules. A route's spelling does not identify which table it uses. Trace the exact router mount, route declaration, handler factory and SQL statement before changing data or documenting reconciliation.

The main `PaymentCreditNote` UI posts to `/api/billing/invoices/payments` and `/api/billing/invoices/creditnotes`. These are the primary browser workflows described below.

## Browser Payment Creation

The payment form reads customer, amount, payment method, date, reference and notes. It rejects a missing customer or a non-positive amount, then resolves customer ID from current bill data or contacts. An optional current invoice ID is sent when the form was opened for a specific bill; general customer payments may have no invoice ID.

The client sends one `POST /api/billing/invoices/payments` payload with customer ID, amount, payment medium, date, reference, notes and optional invoice. On success it:

1. Invalidates the `/billing` API cache.
2. Prepends an optimistic payment object to in-memory `billingData.payments`.
3. Publishes local `billing:payment:created` and `billing:ledger:updated` events.
4. Requests a force-refresh of canonical billing data.
5. Clears the form, updates customer balance/recent transactions/statistics, and syncs an active ledger view.

The optimistic ID can fall back to the current timestamp if the server response has no recognized payment ID. Treat this temporary object as UI state, not a canonical durable record; the subsequent server reload reconciles it.

## Server Payment Creation

The nested `createPayment` handler validates customer and amount, checks worker access to the customer, and validates `invoice_id` if supplied. It generates a reference/date when absent, inserts a `PAYMENT` row in the shared `payments` table, synchronizes the customer's ledger and prior invoice dues, records an audit event, broadcasts payment and ledger events, and returns HTTP 201 with payment ID/reference/current due fields.

The inspected handler performs these steps synchronously but does not wrap payment insert, ledger recalculation, prior-due updates, audit log and broadcast in one explicit transaction in this function. Ledger synchronization can catch errors and return null; therefore success/response fields should be verified with tests before claiming full atomicity. Events are emitted after the insert and sync call, but audit/event writes are not a durable outbox in the inspected path.

## Credit-Note Allocation in the Browser

The current form sorts the customer's bills by creation date and iterates from oldest to newest. For each bill it calculates paid amount and due, applies up to the remaining credit, and appends an invoice-specific allocation. Any remainder is represented by a standalone credit note with `invoice_id: null`, which supports opening-balance cases.

The UI loops through these allocations and sends one `POST /api/billing/invoices/creditnotes` per allocation. Each handler call writes a separate unified `payments` row with type `CREDIT_NOTE`, validates customer access, optionally validates the invoice, generates a reference, synchronizes the ledger/prior dues, logs activity and broadcasts credit-note/ledger events.

**Partial success risk:** the browser issues these requests sequentially and there is no visible shared transaction around the allocation set. If request N fails after earlier allocations succeeded, the operation can be partially applied. The client catch path reports an error but cannot roll back prior server commits. Before relying on multi-invoice credit-note allocation, add an idempotent server endpoint that validates and commits the full allocation atomically, or explicitly design/implement compensating operations and tests.

The frontend and server should share one allocation authority. The current browser computes allocations from its in-memory bills/payments; verify that server state cannot change between that calculation and each request. Test stale client balances, over-credit, zero/negative inputs, duplicate submission, and retry after partial failure.

## Ledger Recalculation

`syncCustomerLedgerAndPriorDues(customerId)` reads opening balance, invoice totals, payments and credit notes. It derives customer-level current due and status, upserts the ledger row, then recalculates `previous_due` for each invoice using chronological comparison of invoice/payment/credit dates and IDs.

Verify the sort key and tie-breaking contract before describing allocation as FIFO. The function recomputes prior dues from customer-wide aggregates; it is not necessarily the same as a payment explicitly applied to a particular invoice. Check whether `invoice_id` affects ledger math or is only a reference/association for this endpoint.

The function catches its own errors and returns `null`. Callers may still return success with absent ledger totals. Add tests that assert the caller's response and DB state when ledger recalculation fails.

## Delete and Reconciliation

The browser optimistically removes a payment row, awaits `DELETE /api/billing/invoices/payments/:id`, invalidates cache, publishes local delete/ledger events, reloads history and starts canonical refresh. The server handler checks customer access, deletes the unified payments row, recalculates ledger/prior dues, audits, broadcasts and returns a response.

Inspect delete ordering and failure handling before assuming rollback: if row deletion succeeds but ledger sync fails, test whether the handler reports success or error and whether a later reconciliation repairs the ledger. Also distinguish a delete event's `{ id, customer_id }` payload from a complete transaction record.

## API Contract Test Matrix

| Case | Verify |
| --- | --- |
| Payment without invoice | Allowed if customer exists/access check passes |
| Payment with invalid invoice ID | Returns 404 and does not insert a row |
| Worker accesses unauthorized customer | Returns 403 with no write |
| Payment reference omitted | Server generates a unique reference/date according to helper |
| Credit note across several bills | Current UI may issue several independent POSTs; test partial failure/retry |
| Credit note remainder | Standalone row has null invoice link and correct customer total |
| Duplicate submit | Prevent double payment or expose idempotency limitation |
| Ledger sync error | Response and persisted payment status are deliberate and tested |
| Delete | Permission, missing ID, ledger recalculation and cross-client event |
| Separate `/creditnotes` route | Confirm whether the legacy table is still consumed or should be retired |

## Figure Capture

![Screenshot placeholder: payment receipt and credit-note allocation](asset:screenshot-placeholder.svg)

**Figure BILL-04. Payment and credit-note allocation.** Capture the payment form and a multi-invoice allocation using synthetic customer, invoice and amount values. Record which invoices receive each portion, the standalone remainder case if applicable, and post-submit ledger state. Never use production customer details or financial records.