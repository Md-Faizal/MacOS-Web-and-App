# Zentra Application Architecture

## Application Composition

`zentra-analytics-dashboard/src/App.tsx` owns top-level authentication and dashboard navigation state. It reads a stored session at initialization, tracks the authenticated user, active tab/current view, workspace-settings section, and visual transition phases. Several dashboard views and the widget modal are loaded with `React.lazy` under `Suspense`; profile/header/common shell elements are imported directly.

An application-level `zentra:unauthorized` event clears the stored session, user state, and authenticated view. This defines a client response to unauthorized events; it does not prove every API client emits the event or that server session revocation is immediate. Trace the call site that dispatches the event when debugging unexpected sign-out.

## View Ownership

| View | Source |
| --- | --- |
| Home/overview | `src/views/HomeView.tsx` |
| Billing | `src/views/BillingView.tsx` |
| Payments | `src/views/PaymentsView.tsx` |
| Balances | `src/views/BalancesView.tsx` |
| Customers | `src/views/CustomersView.tsx` |
| Products | `src/views/ProductsView.tsx` |
| Reports | `src/views/ReportsView.tsx` |
| Workspace connection/access | `src/views/ConnectView.tsx` and worker access components |
| Profile and workspace settings | Profile/settings views and app-level handlers |

The app's `currentView` and `activeTab` are separate state variables. Settings/profile handlers can alter the current view while resetting the header tab. For a navigation regression, inspect the transition timers, exit guards and the current state pair rather than assuming a URL router controls the page.

## Data and Access Tracing

The source tree has separate `data/`, `lib/`, `types.ts`, and view/component layers. Follow the actual API client in `src/data/`, auth/session helpers in `src/lib/`, and its caller in the view. Verify authorization server-side as well as UI tab visibility. A hidden/absent UI tab is not a backend access-control boundary.

For report or balance discrepancies:

1. Find the active view and its filter/period state.
2. Trace the data hook/request to the API base URL and response fields.
3. Compare the response to the server route, domain calculation and data tenant/account scope.
4. Inspect loading, empty and error branches; do not confuse a zero-result response with a request failure.
5. Check request cancellation/stale result behavior when users change filters rapidly.
6. Add tests for transformations at the layer that owns them and run the TypeScript check/build.

The project's `lint` script is `tsc --noEmit`, not ESLint. Its package graph and Vite config are separate from the root main web project.

## Authentication and Workspace Access

The app reads stored session state during startup and handles an unauthorized event at the top level. Follow login/session code through token persistence, API headers, refresh/error handling, logout cleanup, and any worker access/permission service before documenting details. Do not assume a session is secure at rest or that every route uses the same scope without inspecting its implementation.

Capture login, worker access, dashboard, and report screens using a dedicated synthetic workspace. Hide user identity, tenant IDs, customer data, financial totals, browser URL parameters and network diagnostics. The screenshot placeholder in the frontend chapter remains until these captures have been reviewed.