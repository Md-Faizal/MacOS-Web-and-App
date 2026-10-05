# Backend and API Routes

## Startup Trace

| Order | Source step | Why it matters |
| ---: | --- | --- |
| 1 | Load `.env` and environment-specific dotenv file | Effective values depend on `NODE_ENV` and working directory |
| 2 | Determine mode and validate configuration | Current startup has credential-like fallbacks; see security gate below |
| 3 | Initialize `DatabaseManager` | DB repair/schema/migration can run before routes are available |
| 4 | Construct departments with the shared DB | Department factories receive the same initialized connection |
| 5 | Install middleware | Request ID, headers, parsing, CORS/CSRF/origin and rate controls affect later routes |
| 6 | Select/serve Zentra or MacOS assets where applicable | Host and `/zentra` path branches are different serving modes |
| 7 | Mount auth/admin/profile/event routes and domain routers | Route prefix does not fully determine auth policy; exceptions exist |
| 8 | Install error/health/system/documentation endpoints and listen | Health success is not proof every domain is ready or authorized |

Primary implementation: `backend/main/macos-api-server.js`. Read sequentially because Express is order-sensitive.

## Router Prefixes

| Prefix | Registry owner | Follow-up area |
| --- | --- | --- |
| `/api/billing` | Billing department | `backend/departments/billing/`, `backend/core/payments/`, `orders/`, `invoices/`, `creditnotes/`, `variants/`, `batches/` |
| `/api/products` | Product List department | `backend/departments/product-list/` and product core |
| `/api/contacts` | Contacts department | Contacts department service and persistence |
| `/api/notes` | Notes department | Notes routes and image persistence |
| `/api/calendar` | Calendar department | Calendar routes/service |
| `/api/analytics` | Analytics department | Analytics routes and calculation source |
| `/api/settings` | Settings department | Public health/telemetry exceptions are route-specific |
| `/api/desktop` | Desktop department | Clock, weather, quick notes and reminders subrouters are mounted separately |
| `/api/suggestions` | Suggestions department | Check input source and customer history access |
| `/api/logs` | Logs department | App-log POST has a specific unauthenticated exception |
| `/api/ai` | AI department | Check provider/configuration and request handling |
| `/api/wallpapers` | Wallpaper content department | Public reads differ from write/management operations |
| `/api/cloud` | Cloud storage department | Share/download/media subpaths have explicit exceptions |

Also inspect direct route declarations in the main server for auth/mobile, admin, profile, OAuth, QR, Android updates, and SSE. Do not derive an exhaustive API contract from this prefix table.

## Request Control Checklist

- Request IDs are generated or accepted at middleware entry and returned in response headers.
- `attachResponseHelpers` attaches a response facade; individual legacy handlers may bypass it.
- JSON and form parser size limits are server configuration, not feature-specific behavior.
- CORS handles browser cross-origin policy; auth establishes identity; authorization checks permissions; CSRF protects selected cookie-session writes.
- Rate limits apply to a finite in-memory set of sensitive auth mutations, not a distributed general quota.
- Public/read exceptions are conditional on both request method and nested path for some routers.
- The global error handler recognizes malformed JSON and oversized body errors; inspect all other errors at the actual handler.
- The API's health routes are public probes and do not assert downstream domain correctness.

## Auth Path Routing

| Operation | Server route area | Client owner |
| --- | --- | --- |
| Browser login/logout/status | `/api/auth/*` | Main browser login/session modules |
| Mobile access/refresh/logout | `/api/auth/mobile/*` and login route | Android `NetworkClient` plus auth repository/view-model |
| WebAuthn enrollment/authentication | `/api/auth/webauthn/*` | Browser auth modules and auth department |
| Worker Google auth | `/api/auth/google/worker-login` and status/config routes | Browser/Android flows; inspect exact platform call |
| User profile | `/api/profile` | Browser profile and Android account/profile screens |
| Owner administration | `/api/admin/*` | Admin-only UI and `ownerOnly` middleware |

These routes have differing middleware; this matrix is only navigation. For a permission change, test allowed and denied cases for every affected role/session type.

## Diagnostic Search Procedure

1. Search the exact method/path in `backend/main/macos-api-server.js` and router source.
2. Identify middleware already run at that mount and any local bypass.
3. Search frontend/Android caller for request URL, method, payload and headers.
4. Record status, sanitized response shape, and `X-Request-ID` from a local/synthetic request.
5. Follow service to DB/provider boundary and closest test.
6. Do not change CORS/auth/CSRF defaults before reproducing the specific denied path.

## Security Gate

Source inspection found credential-like defaults/fallbacks in API startup and hard-coded authentication headers in the main web billing client and Android networking. The actual values must not appear in this reference set. Require revocation/rotation, source removal, approved secret injection, artifact/history review and release validation before relying on these integrations in production. Treat client-embedded keys as public because browser and mobile packages can be inspected.