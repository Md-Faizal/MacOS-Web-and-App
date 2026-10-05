# Task-to-Source Playbooks

These recipes route investigation; they do not replace tests or authorize a production operation. Keep the request scope narrow and stop when the owning path is found.

## API Request Fails

1. Capture method, path, status, sanitized response and request ID from a local/synthetic call.
2. Inspect the caller's final URL, base URL, method, credentials mode and headers.
3. Search the exact route in `backend/main/macos-api-server.js` and mounted router.
4. Verify environment/host selection, proxy target and whether request reached the API.
5. Trace middleware order: origin, parser, CSRF, session/bearer auth, authorization, route.
6. Read the handler's response/error branch and closest contract test.
7. Change the smallest layer that owns the failure; do not loosen global controls without proof.

## Data or Balance Is Incorrect

1. Identify displayed value, source endpoint and exact customer/invoice/product identifiers using synthetic fixtures.
2. Trace response serializer to service calculation and SQL reads/writes.
3. Inspect DB schema, foreign keys, migration state and transaction sequence.
4. Check client optimistic state, cache, refresh and event path independently.
5. Compare stored rows before/after a local test transaction; never probe against live production data.
6. Add a regression test for the calculation/ordering contract and the serialized response.
7. Update the data chapter and API contract if the interface changed.

## Browser App Is Blank or Stale

1. Confirm which HTML entry loaded and the Vite/server port from browser navigation.
2. Check browser console and network without exposing tokens or personal payloads.
3. Verify referenced script/CSS paths and whether static assets return the correct MIME type.
4. Follow the module import/bootstrap order from that HTML page.
5. Check keep-alive panel activation, event subscription, cache invalidation and render guards.
6. Reproduce using a clean local profile only after preserving any needed diagnostics.
7. Verify at the touched module's UI/test boundary; a successful Vite build does not prove runtime interaction.

## MacOS Frontend Cannot Reach the API

1. Read effective root command and Vite environment target.
2. Confirm API process is running on the expected local port.
3. Confirm proxy is receiving the `/api` request and not the production hostname handler.
4. Inspect request ID, CORS response, CSRF token presence and auth mode.
5. Check only the selected endpoint's server route/middleware.
6. Avoid adding permissive origins or disabling session protections as a connectivity shortcut.

## Zentra Data or Route Is Missing

1. Confirm the app is running as Vite port 3000 or under the API's `/zentra` host/path route.
2. Read Zentra package scripts and `vite.config.ts`, not root Vite assumptions.
3. Inspect effective API base URL and browser request URL.
4. Follow the React route/guard and data hook to the exact API path.
5. Inspect server hostname dispatch and built SPA availability only for the deployment mode in question.
6. Run Zentra's TypeScript check and build after the narrow behavior test.

## Android Connectivity or Authentication Fails

1. Inspect current `SessionManager.serverUrl` through approved local settings; do not print tokens.
2. Follow Retrofit service, OkHttp interceptor and authenticator for the exact request.
3. Determine public versus protected endpoint and expected bearer/refresh lifecycle.
4. Check Android network security and cleartext policy for the configured scheme.
5. Compare to backend mobile route and auth middleware; don't assume browser cookie behavior.
6. Test with a test account/server and synthetic data; do not embed a shared secret into the app.
7. For a release, verify signing and credential-remediation gates independently from `assembleRelease` success.

## Rust Result Differs from Another Client

1. Find the authoritative Rust function and host/unit test.
2. Find the export or bridge for the affected target.
3. Find the actual caller, serialization and fallback path in Node/JS/Kotlin.
4. Compare types, null/default handling, integer/float rounding and error mapping at each boundary.
5. Add parity fixtures to the closest shared test; run target build where configured.
6. Do not infer production Rust use from crate presence or roadmap claims.

## Android UI or Navigation Regression

1. Find the route/destination and screen composable.
2. Identify state ownership: local Compose state, ViewModel flow, repository or saved session.
3. Trace navigation arguments and lifecycle restoration.
4. Reproduce with an emulator at the documented API level and viewport.
5. Add a unit/UI test at the closest available layer and note device-only behavior separately.

## Build or Dependency Regression

1. Identify which package root is executing the command.
2. Confirm runtime version and lockfile were used for that package.
3. Check whether the failure is install, typecheck, compile, bundling, native compilation or runtime.
4. Inspect the direct package declaration and lockfile graph before updating a dependency.
5. Avoid forced bulk upgrades; run focused tests plus dependent app builds.
6. Record warnings and untested targets accurately.

## Deployment or VM Incident

1. Pause before any mutating command; verify authorization, target and revision.
2. Identify active workflow/runtime from owner-approved environment data.
3. Preserve sanitized health/log evidence and request IDs.
4. Check recent workflow status, health endpoint, proxy target and persistent volume availability.
5. Confirm backup currency and tested rollback with the owner before recovery.
6. Do not infer VM hosts, ports, keys, capacity or RPO/RTO from old docs.
7. Record action/result in the approved incident system, not in public AI context.

## Screenshot or Diagram Request

1. Decide whether the figure should be a source diagram or captured UI; don't use screenshots for logical architecture.
2. For screenshots, use the figure capture guide and synthetic data.
3. Record app revision, surface, platform, device/viewport, scenario and status.
4. Inspect visible content for customer names, balances, URLs, credentials, notifications and logs.
5. Rebuild and inspect the full-size HTML and PDF figure before marking `captured`.

## Documentation Claim Update

1. Find the originating code/config/test/workflow.
2. Record whether evidence is source-verified, test-verified, historical or owner-confirmation-required.
3. Update the subsystem chapter first and AI route only if navigation changed.
4. Regenerate catalog, site and PDFs.
5. Run line-count, link/asset and PDF checks; do not promote historical metrics without current measurements.