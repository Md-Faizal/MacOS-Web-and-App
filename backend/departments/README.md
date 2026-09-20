# Department Architecture

This folder formalizes the application into department-owned modules that mirror the Rust engine's separation of responsibilities.

## Naming Convention

Each department owns:
- `index.js` – module metadata and boundary contract
- `contract.js` – canonical API payload contract for that department
- optional `service.js` – domain logic adaptor or orchestration layer
- optional `routes.js` – route façade when a feature grows beyond its current legacy module

## Approved Departments

- billing
- analytics
- product-list
- contacts

## Rules

- Database and schema remain unchanged.
- Legacy web files remain functional and are treated as compatibility adapters.
- Each department is authorized to own a canonical API contract and a service envelope.
- New business logic should be added within the department module, not spread across unrelated UI modules.
- The department metadata is now the source of truth for ownership; the legacy handlers are only compatibility shims during the cutover.
- Full replacement is progressive: compatibility stays until the department service is fully authoritative, then the legacy path is removed intentionally.
