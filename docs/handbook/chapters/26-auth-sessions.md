# Browser and Mobile Authentication Sessions

## Route and Owner Map

The Auth department factory provides local auth, profile, OAuth, permissions, worker Google login and audit services. The API entrypoint declares auth routes directly and protects domain routers through mounted middleware. Relevant paths include:

| Flow | Routes / implementation |
| --- | --- |
| Password login/status/logout | `/api/auth/login`, `/api/auth/status`, `/api/auth/logout`, auth engine |
| Mobile session lifecycle | `/api/auth/mobile/refresh`, `/api/auth/mobile/logout`, mobile session service |
| Device management | `/api/auth/devices...`, auth engine and owner/admin handlers |
| WebAuthn | `/api/auth/webauthn/registration-options`, `registration-verify`, `authentication-options`, `authentication-verify` |
| Worker Google login | `/api/auth/google/worker-login`, worker Google auth service |
| Owner administration | `/api/admin/...`, authenticated owner-only service |
| Browser CSRF | `frontend/scripts/shared/csrf.js`, global Express CSRF middleware |

Read the actual route mount and middleware order for each path. Similar login behavior does not mean the browser and Android store or present the same credential type.

## Browser Login and Session

The local login handler checks that an active user with a password hash exists and uses bcrypt comparison for password verification. It derives device/app metadata, updates the user's active device row, records login history, and can snapshot worker permissions. For web login it creates a database-backed opaque session through `session-service.js`, sets an HTTP-only session cookie, records an audit event, and also returns a JWT/cookie path in the current handler. Verify exact response/cookie use in the browser auth controller before changing it.

The session service creates a random 32-byte opaque secret, stores only a SHA-256 hash in `auth_sessions`, sets idle/absolute expiration, and returns it in an HTTP-only `auth_session` cookie. Normal sessions use a seven-day idle timeout and thirty-day absolute timeout; elevated sessions expire sooner. Resolve checks revocation, expiry and active user status, updates `last_seen_at`, and slides the idle expiry up to the absolute limit. Device unlink can revoke a browser session. Cookie `secure` depends on production/VM mode or HTTPS, and `sameSite` is `Lax` in the inspected service.

The auth middleware gives a Bearer token priority; an invalid Bearer token returns 401 rather than falling through to cookies. Native Android requests are denied if no Bearer token is present and do not fall back to ambient browser cookies. Non-Android browser requests try the database-backed session cookie, then the JWT cookie fallback.

## Android Access and Refresh Tokens

The mobile session service issues a 15-minute access JWT plus a random refresh token with a thirty-day refresh-token lifetime. It stores only the SHA-256 refresh-token hash, family/device/user metadata and expiry in the database. Refresh rotation inserts the replacement token and revokes the previous row within a DB transaction. If a revoked/expired refresh token is reused, the service revokes active tokens in its family.

Android's OkHttp authenticator uses the refresh token after an eligible 401, serializes refresh through a lock, updates stored access/refresh tokens, and retries with the new bearer value. `NetworkClient` filters browser-session cookie names. Verify logout revokes the mobile refresh token and `token_version` behavior before documenting global versus device-only sign-out.

`SessionManager` attempts to store tokens through `SecureTokenStore`, which uses Android Keystore AES-GCM when available. It also maintains a legacy/recovery SharedPreferences backup that is reversibly XOR-obfuscated with a package-derived string and Base64-encoded. That backup is not encryption. Do not claim all token paths are secure-at-rest solely because the Keystore provider exists; review migration, clearing, backup exposure and failure fallback.

## CSRF and Request Headers

The API issues a readable `csrf_token` cookie. The main browser fetch wrapper adds `X-CSRF-Token` to same-origin mutating `/api/` requests when the cookie exists. Server-side enforcement applies to cookie-session mutations with selected auth-entry/bearer exceptions. `X-App-Type` and `X-Client-Platform` mark native Android requests, which changes cookie fallback behavior.

CORS, CSRF, authentication, authorization and application/platform headers answer different questions. Never set wildcard CORS or disable CSRF to resolve one client path without reproducing the exact request and route policy.

## WebAuthn Lifecycle

The Auth engine uses `@simplewebauthn/server`. Registration and authentication options use configured RP name/ID/origin when provided, with request-derived fallbacks. Challenges are stored with a five-minute expiry and consumed from storage during verification. Registration requires an authenticated session; authentication options are available to begin login. The verification path validates expected origin/RP and then issues the relevant web/mobile session according to the client.

Inspect full WebAuthn options, user-verification requirements, credential storage, challenge consumption and authenticator counter behavior before documenting compliance or phishing resistance. Do not infer all requested roadmap features are present from the dependency or route names.

## Critical Signing-Secret Gate

Both `auth.js` and `mobile-session-service.js` define fallback JWT signing secrets in source; `auth.js` also contains a recovery-key fallback. The exact values are intentionally omitted from this handbook. These are not acceptable production defaults: if used, anyone with source access may forge tokens or invoke recovery. Treat them as potentially compromised.

Required action is rotation/revocation and removal, not merely adding new environment values while retaining fallback behavior. Require strong approved secret injection, fail-closed startup checks, history/artifact/deployment review, secret scanning, and verification that issued sessions are invalidated/reissued with the rotated key. Avoid running commands that print the values.

## Session Test Matrix

| Scenario | Check |
| --- | --- |
| Inactive/missing user login | Denied before session/device creation |
| Browser session expiry/revocation | Correct 401, cookie clear and audit record |
| Invalid Bearer plus valid cookie | Bearer priority is explicit and tested |
| Android request without Bearer | Rejected; no browser-cookie fallback |
| Refresh rotation and reuse | Old token revoked; reuse revokes intended family |
| Device unlink/global logout | Browser sessions, refresh rows, devices and token version align |
| Worker permissions | Snapshot and server route checks agree; UI hiding is not the policy |
| CSRF mutation | Valid/invalid/missing token and auth-entry cases behave deliberately |
| WebAuthn challenge | Expired/replayed/wrong-origin/wrong-RP cases are rejected |
| Missing signing secrets | Startup fails closed; no source fallback is used |