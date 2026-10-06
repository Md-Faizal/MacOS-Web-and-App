# MacOS Web Shell and Billing Workflow

## Browser Entry and Shell

The main browser app is delivered from the `frontend/` root, with page entries configured in `vite.config.js`. The actual boot order is owned by the script tags in each HTML file. For a UI bug, begin with the page the user opened, identify synchronous global/bootstrap scripts and module imports, then trace the app registration into the window manager. Do not assume `index.html` and `home.html` mount identical module graphs.

The desktop shell is organized under `frontend/scripts/`; app implementations are under `frontend/modules/`. A user-visible app can be launched from desktop, Dock, Launchpad, or app-bar surfaces. Trace the app ID from registration through launch and close handling: inconsistent IDs can create stale window references. Window visibility, destruction, module disposal, and event-bus unsubscription are separate lifecycle events.

## Billing Module Surface

`frontend/modules/billing/js/billing-app.js` contains the `BillingAPI` implementation and billing application coordination. The sibling modules divide responsibilities:

| UI responsibility | Module |
| --- | --- |
| Billing shell/view switching and API access | `billing-app.js` |
| Create invoice | `new-bill.js` |
| Existing bill editing/payment administration | `edit-bills-payments.js` |
| Customer ledger | `ledger.js` and `customer-ledger.js` |
| Payment and credit-note entry | `payment-credit-note.js` |
| Sales/order entry | `new-order.js` |
| History | `history.js` |
| Dashboard | `dashboard.js` |
| Ledger document helpers | `ledger-file-utils.js` |

Confirm which view constructs each child and which instances are retained in `_subviewPanels` before documenting a lifecycle. A keep-alive panel retains DOM state but may need an activation refresh; a hidden component should not be assumed either stale or fresh without tracing its event/data source.

In the new/edit bill item cards, the batch field opens a picker when the selected product pack has multiple catalog batches; selecting a batch updates the bill line's batch identity and MRP. The shared QR scanner closes and stops its camera stream when screensaver activation is signaled. For faster repeat scans, it uses the QR-only ZXing reader with short decode intervals and re-arms the same value after it has left the camera view; holding one QR in view does not continuously trigger duplicate actions. Expanded scanner history groups scans by product/variant/batch into one live quantity selector. New/edit bill and order rows use plus/minus controls; QC rows show current received versus expected and clamp adjustments to that range. The history stays with the active new/edit bill or order while the scanner is closed and reopened, and resets when that bill/order context is replaced or cleared. An expanded-view torch control is enabled only if the active camera exposes torch support.

## BillingAPI Request Semantics

The inspected `BillingAPI` uses `/api` as its default base and defines static shared maps for GET cache and in-flight requests. The configured default read TTL is three seconds. Identical GETs use the URL as their key and share a pending promise; cached responses can be returned until TTL expires unless `forceRefresh` is set. Mutation requests attempt to invalidate cache keys based on selected endpoint substrings.

This is a client behavior, not a server freshness guarantee. Inspect the exact endpoint, `forceRefresh` option, request body, error handling, and cache invalidation target for every stale-data report. Verify that any caller's URL is actually covered by the string invalidation rule. The in-flight map and cache are process/page-memory state; they do not synchronize browser tabs or Android.

The current billing client also attaches a hard-coded credential-like header value on requests. The value is intentionally not reproduced here. Treat this as a release-blocking security finding: rotate/revoke as applicable and remove the embedded value; browser constants cannot act as secrets.

## Invoice-to-Ledger Trace

For a billing defect, use a synthetic customer and trace:

1. Invoice or payment form event handler and current validation state.
2. Payload construction, especially customer/product identifiers, quantities, batch IDs, tax fields and date representation.
3. `BillingAPI` method, URL, HTTP method, serialization and headers.
4. Server route under `/api/billing`, route-level auth, handler and domain service.
5. DB statements/transaction and related invoice, item, payment and ledger rows.
6. Response schema, cache invalidation and any `CoreDataBus`/cross-view notification.
7. Optimistic state versus server-confirmed refresh and final render.
8. Relevant contract/parity test and user-visible error path.

Record financial semantics exactly from implementation. Do not infer a FIFO/FEFO order, rounding precision, idempotency guarantee, or atomic commit from a screen label or an old diary.

## Troubleshooting the Stale Ledger

- Confirm the active customer and request URL in the browser network panel with synthetic data.
- Check the last mutation response and request ID before interpreting the UI.
- Confirm a `billing:` event is published by the server/client mutation path and consumed by the mounted ledger.
- Inspect whether the ledger view is active/hidden and whether its event subscription survives tab switches.
- Verify the shared GET cache was invalidated or a forced refresh requested.
- Compare server rows using a test database fixture, then check the client merge/diff/render guard.
- Add one regression assertion at the layer where the stale state originates; avoid broad event polling changes without evidence.

## Capture Points

Figures WEB-01 through WEB-03 in the earlier frontend chapter reserve space for the desktop shell, billing, and inventory screenshots. Capture each after the corresponding workflow has been verified at the current revision. Use synthetic records and include empty/error states where they explain a distinct branch.