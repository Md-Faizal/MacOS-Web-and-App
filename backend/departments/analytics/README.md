# Analytics Department

This department owns aggregated reporting, KPI summaries, and executive metrics.

## Responsibilities
- Dashboard summary
- KPI rollups
- Sales trends and executive reporting
- Aging-driven reporting
- Customer and product performance summaries

## Service Boundary

Use the `service.js` façade to generate canonical analytics responses. The web route handlers remain compatibility adapters and should delegate here when more logic needs to be owned by the domain.

## Contract

Canonical API contract lives in `../../shared/api/analytics-contract.js`.
