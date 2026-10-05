# Android Billing and Session Data Flow

## Billing State Owner

`BillingViewModel` owns `StateFlow` collections for bills, payments, orders, contacts, products, ledger customers, detailed ledger and summary/dashboard calculations. It obtains its `ApiService` from `NetworkClient.getService(sessionManager)` and has a `UserScopedCacheManager` for local hydration.

On ViewModel construction, it attempts cache hydration for the current user ID. If the session says the user is logged in and an auth token is present, it starts a server load. Top-level `MainNavigation` also hydrates the current user's billing cache after login and calls `loadBillingData`; verify lifecycle composition before changing to avoid redundant or overlapping loads.

## Multi-Resource Load

`loadBillingData` guards unauthenticated state, marks loading/syncing flows, captures previous dashboard values for change detection, then loads resources through Retrofit. The inspected method loads bills, billing summary, ledger customers and contacts, followed by further billing resources. Individual blocks catch/log some errors, which means partial results may remain while other requests succeed or fail.

Document partial-load state per screen. A false loading flag does not necessarily mean every endpoint returned current data. Inspect the rest of `loadBillingData`, result reconciliation, cache persistence, cancellation and UI empty/error states before changing its contract.

## Mutation and Refresh Pattern

The ViewModel's create bill, record payment, credit note and update operations execute through `viewModelScope`. Successful calls invoke `loadBillingData`; failed responses return an operation-specific failure result/message. Many methods set/clear a shared `_isLoading` boolean. If operations can overlap, verify whether one operation can clear loading while another is still pending and whether callbacks can fire after screen disposal.

This is a network mutation followed by a full/partial data reload, not an optimistic invoice/payment insert in the inspected methods. Compare with MacOS browser behavior before claiming cross-client UX parity. Verify API response parsing and error-body handling for each route.

## Server URL and Request Construction

`SessionManager.serverUrl` normalizes trailing slash and ensures an `/api/` suffix. Defaults exist for production and Android emulator local development; settings can override it. `NetworkClient` detects a base URL change and rebuilds Retrofit/OkHttp. When diagnosing a failed request, inspect the configured URL through the app UI and sanitized logs, never print auth tokens or refresh tokens.

`NetworkClient` attaches an API key-like header in addition to platform/app headers and bearer auth. That header is hard-coded in client source and is not a secret. Remediation requires removing/rotating any affected credential and reviewing server expectations. Do not encode it in build variants or documentation as though it were private.

## Local Cache and User Isolation

The cache manager is called with user ID and a fallback identifier when hydrating. Inspect `UserScopedCacheManager` before making claims about encryption, expiry, clearing on logout, or tenant boundaries. Verify logout clears both ViewModel state and cached records for the correct identity, including account switching and a missing user ID.

## Android Billing Test Paths

| Behavior | Test/inspection |
| --- | --- |
| Login starts cache and server hydration | ViewModel/navigation lifecycle tests and request fakes |
| Account switch cannot show prior user's data | User-scoped cache tests and logout/login flow |
| Create invoice success/error | Repository/API response handling plus `BillingViewModel` callback behavior |
| Payment/credit-note refresh | Mutation response, subsequent API reload and ledger display |
| Concurrent operations | Loading flag/callback race tests |
| Server URL update | Settings UI persistence and NetworkClient service reconstruction |
| Token refresh/logout | OkHttp authenticator tests with test server; ensure secrets omitted from logs |
| Device-native behavior | Emulator/device test for offline transition, process recreation and supported API level |

Use synthetic accounts and test amounts. UI screenshot records must include device/API level, density/viewport, app revision, screen state and data classification. Never use exported production customer ledgers for screenshots.