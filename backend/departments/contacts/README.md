# Contacts Department

This department owns master contact and party data.

## Responsibilities
- Customers and suppliers
- Contact access controls
- Contact list responses
- Contact-related enrichment and metadata

## Service Boundary

The `service.js` façade normalizes list responses for the canonical contacts contract while allowing legacy route handlers to keep their current behavior.

## Contract

Canonical API contract lives in `../../shared/api/contacts-contract.js`.
