# MacOS Business Suite API Documentation

## Overview

This API powers the MacOS business suite across billing, product management, contacts, analytics, notes, settings, and mobile integrations. It follows a domain-owned architecture and exposes a JSON-first contract while providing a browser-friendly HTML landing page at `/api` for developer navigation.

- Base API: `http://localhost:3002/api` in local development
- Public host: `https://mac.faizal.uk/api`
- Documentation page: `http://localhost:5173/api/` during Vite local development

## Architecture Notes

The API is organized around separate business domains rather than one large ad hoc route file. The server exposes canonical contract responses and compatibility wrappers to keep older frontend modules stable while allowing the platform to evolve safely.

### Core domains

- Billing
- Products / Product List
- Contacts
- Analytics
- Notes
- Settings
- System health and diagnostics
- Android/mobile update and auth endpoints

## Security and Authentication

### Browser sessions

Browser-based flows should use cookie/session authentication where applicable.

### Mobile and native clients

Native Android/mobile clients should use bearer token-based authentication with headers such as:

```http
Authorization: Bearer <token>
X-App-Type: native_android
X-Client-Platform: android
X-API-Key: <key>
```

### CSRF

Browser-facing endpoints continue to enforce CSRF protections. Stateless mobile requests are generally treated separately from browser cookie flows.

## Response Standard

Responses are JSON-first. Standard success payloads generally use the following shape:

```json
{
  "success": true,
  "data": {
    "items": [],
    "count": 0
  },
  "meta": {
    "generatedAt": "2026-09-20T00:00:00.000Z",
    "status": "ready"
  }
}
```

Common HTTP status codes:

- 200 OK
- 201 Created
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 500 Internal Server Error

## Route Conventions

- Use domain-owned resources instead of raw legacy modules.
- List endpoints may support `limit`, `offset`, and search filters when applicable.
- Timestamps are returned as ISO-8601 UTC strings.
- Canonical response wrappers are preferred for new domain logic.

## Developer Landing Page

The root API page is available at:

- `GET /api`

This endpoint renders an HTML documentation page in a browser and returns JSON when requested by API clients.

In local development, the frontend Vite server proxies `/api` to the Node backend, which is why the URL `http://localhost:5173/api/` reflects the same API server while the app lives in the frontend dev server.

## Endpoint Catalog

### Billing

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/billing` | List billing resources |
| POST | `/api/billing` | Create billing item |
| GET | `/api/billing/:id` | Fetch one billing record |
| PUT | `/api/billing/:id` | Update billing record |
| DELETE | `/api/billing/:id` | Delete billing record |
| GET | `/api/billing/summary` | Billing summary metrics |
| GET | `/api/billing/dashboard-metrics` | Dashboard KPI payload |
| GET | `/api/billing/customers/:id/statement` | Customer statement |
| GET | `/api/billing/customer/:id/statement` | Alias customer statement |
| GET | `/api/billing/invoices/payments` | Invoice payment view |
| POST | `/api/billing/payments` | Create payment |
| GET | `/api/billing/orders` | List orders |
| GET | `/api/billing/creditnotes` | List credit notes |

### Products / Inventory

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/products` | List products |
| POST | `/api/products` | Create product |
| GET | `/api/products/:id` | Fetch product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |
| GET | `/api/products/categories` | Product categories |
| POST | `/api/products/categories` | Create category |
| GET | `/api/products/variants` | Product variants |
| POST | `/api/products/variants` | Create variant |
| GET | `/api/products/batches` | Product batches |
| POST | `/api/products/batches` | Create batch |

### Contacts

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/contacts` | List contacts |
| POST | `/api/contacts` | Create contact |
| GET | `/api/contacts/:id` | Fetch contact |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact |

### Analytics

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/analytics` | Analytics overview |
| GET | `/api/analytics/dashboard` | Dashboard summary data |
| GET | `/api/analytics/summary` | Executive KPI summary |

### Notes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/notes` | List notes |
| POST | `/api/notes` | Create note |
| GET | `/api/notes/:id` | Fetch note |
| PUT | `/api/notes/:id` | Update note |
| DELETE | `/api/notes/:id` | Delete note |
| GET | `/api/notes/health` | Note DB health |
| GET | `/api/notes/debug/all` | Debug all notes |

### System and status

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/status` | Server status |
| GET | `/api/debug/notes` | Debug guidance for notes |
| GET | `/api/android/update/check` | Android update check |
| GET | `/api/auth/status` | Auth status |

## Example Requests

### Health check

```http
GET https://mac.faizal.uk/api/health
```

Example response:

```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-09-20T00:00:00.000Z",
  "service": "MacOS Business Suite API"
}
```

### Billing dashboard metrics

```http
GET https://mac.faizal.uk/api/billing/dashboard-metrics
```

Example response:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalBilled": 35829,
      "totalCollected": 12820,
      "amountDue": 23009
    }
  }
}
```

### Customer statement

```http
GET https://mac.faizal.uk/api/billing/customers/123/statement
```

## Error Shape

Error responses follow a practical JSON pattern:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource was not found",
    "details": null
  }
}
```

## Local Development Notes

The local frontend runs on:

- `http://localhost:5173`

The backend runs on:

- `http://localhost:3002`

The Vite configuration proxies `/api` requests from the frontend dev server to the backend server, so front-end modules can call `/api/...` paths without manual host switching.

## Operational Guidance

- Use the structured domain routes rather than legacy fragmented endpoints.
- Prefer canonical service contracts for new functionality.
- Maintain tenant-aware and auth-aware access controls.
- Keep the public docs readable for developers without exposing internal operational secrets.

## Summary

This API is designed to be:

- developer-friendly
- secure by default
- domain-oriented
- stable for the current app stack
- extensible for future business modules and mobile integrations
