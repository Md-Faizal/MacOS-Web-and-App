# Billing Department

This department owns all financial truth for the application.

## Responsibilities
- Dashboard metrics
- Invoice and payment settlement
- Customer ledger statements
- Aging and receivables
- Debt and payment reconciliation

## Service Boundary

Use the `service.js` façade for domain access. The legacy route handlers remain as compatibility adapters and should delegate to the department service rather than duplicating business logic.

## Contract

Canonical API contract lives in `../../shared/api/billing-contract.js`.
