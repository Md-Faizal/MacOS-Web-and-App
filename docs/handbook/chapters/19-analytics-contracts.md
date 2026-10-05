# Analytics Data and Metric Contracts

## UI and API Ownership

The main MacOS analytics app is under `frontend/modules/analytics/`. `analytics.js` owns the shell/sidebar, persistent subview panels, active view/customer state, and billing/contact/order event subscriptions. Feature views are split across dashboard, sales, comparative analysis, order analytics, customer aging, product metrics, and customer profile files.

The main browser dashboard in `dashboard.js` requests executive KPI, top products and top customers in parallel. It shows loading state and then renders returned values. Inspect each response status/body and the server scope before presenting a KPI; a card label alone does not define the metric.

The Express mount is `/api/analytics`; route handlers live under `backend/departments/analytics/engine/`. Route groups cover dashboard summary, executive KPI, sales/deep-dive, order funnel, AR aging, RFM, product velocity, comparative analysis, top lists, customer stats, category performance and persisted analytics records. Use the exact route handler for a report; not all routes share one aggregation path.

## Data Sources and Access Scope

Several report handlers join invoices and invoice items to contacts/products. The analytics handler defines a contact-scope filter for worker role and an exclusion condition; non-worker scope uses `exclude_from_stats = 0` for its guarded report queries. Confirm each query calls this filter. The inspected customer-stats handler performs direct customer-ID reads for invoices/payments/ledger and should be reviewed for an equivalent worker/contact-access check before describing all analytics routes as worker-scoped.

The calculator's dashboard metrics receives `req.user` and calculates worker scope for contacts/invoices. It also filters contacts excluded from stats before deriving the allowed customer IDs used for metric rows. This protects those calculations only where the handler actually invokes that calculator with the current user.

## Metric Caveats

The analytics department service maps shared calculator results into dashboard response objects. The inspected `getDashboardSummary` currently sets `netProfit` to a fixed 25% of total billed revenue. That is a constant proxy, not a cost-of-goods/margin calculation, and should not be described as verified net profit. Its payload also sets `scope: 'all'`; verify this label against worker-scoped rows and the intended UI audience before exposing it as literal access scope.

The executive KPI service maps fields such as total billed, collected, credit notes, receivables, invoice count, GST, discount and collection rate from the shared billing calculator. Do not infer accounting/reporting definitions from aliases. Document numerator/denominator, date range, treatment of opening balances/credit notes/excluded contacts, and rounding directly from the calculation code and test fixtures.

The existing top-products and top-customers handlers use SQL aggregations and a worker contact filter. Product velocity, RFM, order funnel and comparative routes have separate implementations; do not assume they inherit the dashboard metric scope or date filters without tracing each route.

## Event Refresh and View Lifecycle

Analytics subscribes to `billing:`, `contacts:` and `orders:` domains. A billing event refreshes the customer list, invalidates render markers on hidden persistent panels, and rerenders selected active view types. Contact events refresh the customer list; order events rerender the order view only when it is active. This is targeted UI refresh behavior, not a server-side analytics invalidation contract.

When a chart appears stale, check in order: event producer, event domain/action, hidden panel marker, active-view render callback, view-level query, API handler and underlying aggregation. A preserved panel may still need explicit rerender logic when it becomes active.

## Reporting Test Matrix

| Case | Required evidence |
| --- | --- |
| Owner versus worker dashboard | Visible contact scope and excluded contacts are correct |
| Customer explicitly excluded from stats | Excluded from every report that claims the policy |
| Date range and timezone boundary | Inclusive/exclusive dates and date source are defined |
| Credit note/payment and opening balance | Collection/receivable math matches domain contract |
| Product quantity and revenue | Quantity, final amount, discount and tax treatment match invoice items |
| Customer stats endpoint | Worker/contact permission check and no IDOR access |
| Dashboard summary net profit | Replace proxy with sourced costs or label as estimate, backed by tests |
| Event-triggered report refresh | Active and hidden panel paths eventually show canonical server data |
| Large dataset | Query bounds/indexes and pagination behavior are explicit |

Regulatory, GST filing, margin and profitability claims need a domain/accounting owner and source data validation. Do not market an analytics field as statutory output or audited profit based only on an endpoint name.