# Real-Time Events and Cross-Client Synchronization

## Architecture at a Glance

![Illustrated real-time event path from mutation through backend SSE, browser bus, cross-tab channel, and view refresh](asset:realtime-sync.svg)

The current implementation uses multiple transports with different scopes:

| Transport | Scope | Owner |
| --- | --- | --- |
| `EventTarget` custom events | Components in one browser page | `frontend/shared/core-databus.js` |
| `BroadcastChannel` | Same-origin browser contexts/tabs that support it | `frontend/shared/core-databus.js` |
| Server-Sent Events | Connected HTTP clients receiving backend broadcasts | `backend/core/sync/data-bus.js` and API route |
| HTTP fingerprint/ETag | Conditional check of selected collection summaries | Billing router and Rust bridge |

These mechanisms are related but not interchangeable. A tab-local publish does not imply a server mutation; an SSE event does not automatically prove the current view refreshed; and a fingerprint over a selected table summary is not a full snapshot hash.

## Mutation to Consumer Trace

For a browser invoice create, the path is:

1. The invoice form calls `BillingAPI.createBill` and awaits the `POST /api/billing` response.
2. The billing handler writes invoice-related data, then calls `dataBus.broadcast('billing:invoice', 'created', payload)` and broadcasts a ledger update.
3. `CoreDataBusBackend` wraps the message as `{ type, domain, action, payload, timestamp }` and writes it to all connected SSE clients. It emits a named domain event and a default SSE message for client compatibility.
4. The browser EventSource consumes default messages at `/api/events`, derives the event type and passes it to `dispatchInternal` without re-broadcasting to avoid a transport loop.
5. `dispatchInternal` creates the page event detail, dispatches exact-type and domain events plus `core-data-domain`, and supports legacy window listeners.
6. A `BroadcastChannel` relay can carry local publishes to other tabs, with a self-origin check on receipt.
7. The Ledger's `subscribeDomain('billing:', ...)` handler receives the normalized event. For relevant payment/credit-note events it updates local state optimistically; it then calls a server sync and only updates the DOM when its container exists.

An event is an invalidation/refresh signal, not a durable queue or a guaranteed exactly-once transaction record. Consumers should be able to recover by refetching canonical server data. Test duplicate, reconnect, stale-cache and hidden-view cases explicitly.

## SSE Connection Behavior

`CoreDataBusBackend.handleSSEConnection` sets event-stream/no-cache headers, disables proxy buffering, adds the client to an in-memory set, writes an initial handshake and removes the connection when the request closes or response errors. A 25-second heartbeat writes SSE comment pings. `broadcast` sends each event to every connection in the current process; there is no per-customer or per-user filter in the inspected broadcaster.

The browser client opens `/api/events` once after page initialization, resets reconnect delay on open, closes the failed source and retries with increasing delay capped at 30 seconds. Browser support is checked before construction. In-page `EventTarget` and `BroadcastChannel` remain separate from SSE retry state.

## Critical Access-Control Review Gate

The main Express server mounts `GET /api/events` directly to `handleSSEConnection`. In the inspected route order, that direct route is not visibly wrapped with the auth middleware used for protected department routers. The broadcaster sends event payloads to every client in its in-memory set. This creates a material access-control question because payloads may include business identifiers or amounts.

Do not describe this endpoint as authenticated or safe for sensitive production events until the security owner verifies the deployed route and intended access policy. Required review:

1. Inventory all event domains/payload fields and classify customer/financial/identity data.
2. Confirm whether upstream proxy or an earlier global middleware authenticates the request; the current source path itself does not show a route auth wrapper.
3. Add an explicit authenticated/authorized policy or reduce payload fields, as approved by the owner.
4. Test unauthenticated, wrong-role, worker-scope and authorized SSE connections, including CORS and cookie/bearer semantics.
5. Verify event fan-out respects the intended user/tenant scope; the current `clients` set is process-wide.
6. Review reconnection, stream lifetime, proxy buffering and event retention expectations. SSE here is in-memory fan-out, not a durable event log.

The endpoint and event examples in this handbook must never include real customer payloads, tokens, host identifiers or production captures.

## Fingerprint Endpoint

Billing routes include `GET /api/billing/sync/fingerprint`, handled through the billing route group. The backend maps selected domains to row count, maximum ID, and maximum `updated_at`, then delegates fingerprint calculation to `SuiteCoreBridge.computeFingerprint`. It sets an ETag and returns 304 when the request's `If-None-Match` equals the computed ETag. Because the route is under the billing prefix, inspect the route-prefix middleware when describing its auth policy.

The inspected summary uses invoices for billing, products for inventory/products, contacts for contacts/customers, and notes for notes. A payment-only change may not alter an invoice-table summary unless the mutation also changes a covered row. Event broadcasts and ETags therefore cover different invalidation paths. Do not claim an ETag fingerprints every field or table in a domain without inspecting query inputs and tests.

## Ledger Lifecycle and Cache

`LedgerView` creates its CoreDataBus domain subscription in the constructor and deliberately retains it when polling is stopped. Its periodic fallback defaults to 60 seconds. On a manual/event-triggered sync it invalidates matching billing API cache entries, calls `loadBillingDataFromAPI` with a force-refresh option, checks for the relevant DOM container, derives ledger data and applies a diff/render.

Troubleshoot a stale ledger in this order:

1. Confirm the mutation request succeeded and identify the returned invoice/payment ID.
2. Confirm the backend broadcast was issued from the committed mutation path.
3. Confirm `/api/events` is connected and receives the default SSE message.
4. Confirm the expected `domain` and `action` match the subscriber filter.
5. Check whether the view retained its event subscription and whether the container is mounted.
6. Verify billing cache invalidation and the forced server refetch.
7. Compare canonical API data with the ledger diff/render result using synthetic data.

Do not increase polling frequency as the first response; identify which hop dropped or stale-cached the event.

## Event Contract Checklist

| Field/behavior | Verify |
| --- | --- |
| Event type | Domain and action naming are identical at producer and consumer |
| Payload | Contains only required identifiers/data; privacy classification reviewed |
| Origin | Local tab echoes are suppressed; remote server events are not re-broadcast indefinitely |
| Ordering | Do not assume total ordering across multiple server instances or tabs |
| Durability | Current in-memory stream is not a persisted event log |
| Authorization | Connection and payload fan-out obey approved user/tenant scope |
| Reconciliation | Consumer can refetch canonical state after reconnect/missed event |
| Tests | Cover producer call, normalization, dedup, reconnect and the rendered view |