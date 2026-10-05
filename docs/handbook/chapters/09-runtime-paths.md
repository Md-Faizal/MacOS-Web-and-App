# Runtime Modes and Request Paths

## One Repository, Several Runtime Modes

The local Vite workflow, the Node process's built-in static/API server, the standalone `server-prod.js`, Docker Compose, and PM2 configuration are distinct runtime arrangements. Read the exact launcher/configuration before mapping a hostname or port to a service. The older README description of a separate production frontend and backend does not match every checked-in launch path.

![Illustrated local web request path from browser through Vite, shared Express API, domain router, and persistence](asset:request-flow.svg)

The diagram is a request ownership map. It omits specific route auth exceptions and does not assert a complete production network layout.

## Main MacOS Local Development

Root `package.json` defines:

| Command | Process started | Configuration evidence |
| --- | --- | --- |
| `npm run backend` | Node API entry point with script-level `PORT=3002` | Root `package.json` |
| `npm run dev` | Vite CLI with `--host localhost --port 5173` | Root `package.json`; Vite root is `frontend/` |
| `npm run dev:local` | Both commands through `concurrently` | Root `package.json` |

`vite.config.js` sets the main app root to `frontend`, defines five HTML build entries, and proxies `/api` and `/storage` to `VITE_API_TARGET` or its local fallback. It also rewrites development ledger aliases to `customer-ledger.html`. The npm `dev` script supplies a host and port on the CLI; do not report only the config-file defaults when describing the effective command. The Vite process serves the frontend; API requests traverse its proxy to Express.

If the browser loads but API calls fail, verify in this order: which Vite process and port is running; its loaded mode/environment; `VITE_API_TARGET`; whether the API is listening at that target; then the API's request ID, CORS/CSRF/auth result, and route behavior. Do not broaden CORS or disable CSRF as an unverified first fix.

## Zentra Development and API Flow

`npm run dev:zentra` delegates to the root composition that starts the API plus Zentra Vite on `0.0.0.0:3000`. Zentra's `vite.config.ts` installs the React and Tailwind Vite plugins and proxies `/api` to `VITE_API_TARGET` or a local default. The API process also contains a `/zentra` path that can proxy to a dev server using `ZENTRA_DEV_TARGET`, or serve a built SPA outside the dev mode. These are separate access paths; a standalone port-3000 client and an API-hosted `/zentra` path are not the same URL arrangement.

The example Zentra environment values differ from the root backend's script-level default. When debugging, inspect the loaded environment and browser network request target rather than assuming `.env.example`, the root `.env`, and the Vite proxy all resolve identically.

## API Startup and Middleware Order

The Express entry point performs startup work before listening:

1. Loads `.env` and then `.env.<NODE_ENV>` using the configured environment name.
2. Determines production/development/VM mode and initializes the shared database through `DatabaseManager`.
3. Constructs department APIs using the initialized database and initializes domain modules.
4. Installs cross-cutting middleware for CORS, traffic telemetry, request IDs, response helpers, security headers, body parsing, cookies, CSRF, and additional origin/rate checks.
5. Configures optional Zentra development/static serving and the MacOS static paths.
6. Creates domain routers, mounts authentication/admin/profile and event endpoints, then applies route-level auth gates to the router groups.
7. Adds error handling and health/system/API documentation endpoints, then starts the configured listener.

Express middleware ordering is behavior. A route can be public, authenticated, owner-only, or selectively exempted; inspect the exact mount and nested handler before documenting its policy. The route list and health response are not authorization specifications. For a failure, record the HTTP method/path, request ID, status, non-sensitive environment name, and matching request path; do not collect tokens or body data unnecessarily.

The API uses both same-origin and cross-origin checks. CSRF behavior depends on cookie session, mutating method, auth-entry exceptions, and bearer-auth presence. CORS, CSRF, authentication, and authorization answer different questions; passing one check does not imply the others passed.

## Android API Client Boundary

Android's `NetworkClient` reads `SessionManager.serverUrl` and rebuilds the Retrofit client when that value changes. Requests use OkHttp interceptors, platform/app headers, bearer access tokens for protected calls, and refresh-token handling after an eligible unauthorized response. The mobile cookie jar filters browser session-cookie names so the native app is intended to use mobile token flows rather than inherit a desktop browser session.

The server URL is an operator/app setting. Inspect the current session value and settings flow when diagnosing connectivity; do not assume the server is always on `localhost` or the same port as Vite. Android and API source also currently contain hard-coded credential-like values. Treat them as an unresolved security incident: do not copy them into examples, and require removal plus revocation/rotation before a release is considered safe.

## Production Arrangement: Confirm the Selected Path

| Configuration | What the checked-in file says | What not to infer |
| --- | --- | --- |
| `Dockerfile` | Container command runs `backend/main/macos-api-server.js`; runtime declares port 3001 and health-checks `/api/health` | This does not prove which image, env file, volumes, or VM are active |
| `docker-compose.yml` | Defines blue/green service slots mapped to loopback host ports 3001 and 3004; persistent paths are bind-mounted | This is not proof both slots are active or of the reverse-proxy target |
| `ecosystem.config.js` | PM2 declares `macos-server` plus a Windows-oriented `ipv6-updater`, with environment profiles | Root npm PM2 scripts mention app selectors that do not match these names; do not use them without reconciliation |
| `server-prod.js` | Separate static server with `/api` proxy and static/SPA fallback behavior | It is not the Dockerfile command and is not an app in the current PM2 config |

The environment owner must identify the active runtime before a deployment diagram is labeled production. Record process/container name, config source, binding, upstream proxy, health check, and persistent volume from the active host, without including secret values.