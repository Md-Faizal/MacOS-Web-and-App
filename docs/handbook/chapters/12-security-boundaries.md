# Authentication and Security Boundaries

## Security Is Layered

The Node API has multiple request controls that solve different problems. Origin/CORS policy controls which browser origins may read cross-origin responses. CSRF checks help protect cookie-authenticated mutations. Authentication establishes a caller identity. Authorization controls access to a resource or operation. Rate limits reduce attempts on selected sensitive endpoints. A request passing one layer does not prove it passed the others.

The entrypoint installs request IDs, response helpers, security headers, body parsers, cookie parsing, CSRF/origin checks, a small in-memory rate-limit map, and route-specific auth gates. Middleware ordering and prefix exceptions matter. Verify the exact method, path, cookies, bearer header, origin and nested route handler when debugging a 401/403/429; do not weaken a global control to fix one endpoint.

The global Permissions-Policy allows camera access only to the first-party page (`camera=(self)`) so browser camera features such as QR scanning can request user permission. Microphone and geolocation remain disabled. Camera APIs also require HTTPS or localhost and the user must grant site-level permission.

## Browser and Mobile Sessions

The auth department constructs auth, profile, OAuth, worker Google, permission and audit modules. The server mounts login/refresh/logout/status/security-question/WebAuthn routes and applies auth middleware selectively. Owner-administration routes add an owner-only guard after authentication. The billing, products, cloud, logs, wallpaper, and settings route groups have specific path/method exceptions in the main server; use the current mount code rather than assuming the entire prefix has one policy.

Android uses a distinct token-oriented path. `NetworkClient` reads the configured `SessionManager.serverUrl`, attaches a bearer token for protected calls, filters desktop-session cookies, and has an authenticator that attempts refresh using a refresh token. Keep Android and browser flows separate when documenting cookie, CSRF, refresh, logout, and session-revocation semantics. Verify storage protection and lifecycle in `SessionManager` before describing tokens as secure at rest.

`SessionManager` first consults `SecureTokenStore`, but its fallback backup obfuscation is a reversible XOR using a package-derived string before Base64 encoding. This fallback is not cryptographic protection against someone inspecting app preferences or the package. Do not describe that backup as encryption or secure-at-rest protection. Review whether the fallback is necessary, define migration/cleanup of legacy values, and verify Android Keystore configuration before making a security claim.

## Request IDs and Error Envelopes

The server accepts a client `x-request-id` or generates a UUID, then returns `X-Request-ID`. The shared response module builds JSON envelopes with a success flag, data/error, and metadata that can include request ID, generated time and status. The global handler maps oversized and malformed JSON requests into structured errors and handles other failures centrally.

When documenting or testing an endpoint, record its actual status codes and body from its handler; legacy routes may bypass the shared helpers or return their own shape. Use request IDs to correlate diagnostic records. Avoid logging request authorization headers, cookies, tokens, password fields, or full customer payloads.

## Selected Rate-Limited Paths

The inspected main server applies an in-memory, per-process time bucket to a fixed set of authentication-related mutation paths, currently with a threshold of ten attempts in a sixty-second window. This is not a distributed rate limiter, a durable abuse ledger, or a general API quota. Multiple processes/containers have separate memory. Do not advertise broader coverage than the code provides; before changing it, add tests for keying, reset, process multiplication and response semantics.

## Security Findings Requiring Immediate Remediation

Source inspection found credential-like fallback values in Node API startup and auth/mobile session signing code, a hard-coded API authentication header in the main web billing client, and a hard-coded request header in the Android client. Exact values are intentionally excluded from all handbook content. Treat these as potentially compromised credentials, not harmless documentation examples.

Required release gate:

1. Security owner inventories the affected credentials and every consumer through an approved secret-scanning process.
2. Revoke and rotate affected credentials at their issuers; do not wait for a code-only fix if they may have been used.
3. Remove embedded JWT/recovery fallbacks from auth services and require approved environment/secret-manager configuration with fail-closed startup behavior.
4. Remove the static main-web and Android header credentials or replace them with reviewed, scoped, rotatable designs. Client-embedded values are extractable and cannot be treated as private server secrets.
5. Review repository history, build artifacts, logs and deployed versions for exposure; preserve incident evidence without pasting values into tickets or docs.
6. Add automated secret scanning and tests that fail if known credential-shaped defaults return.
7. Verify production uses newly rotated values and that missing configuration fails safely. Confirm release signing separately for Android.

Do not run ad hoc commands that print these values. Do not put them in screenshots, generated PDFs, examples, test fixtures, commit messages or support transcripts. This chapter is a warning and remediation gate, not a replacement for the organization's incident-response process.

## Safe Handling and Review

- Refer to variable names and approved secret-store paths, never resolved values.
- Keep `.env` files, database backups, signing material and private production configuration out of Git and documentation artifacts.
- Use synthetic identities and amounts for tests and screenshot captures.
- Treat remote deploy, auth/config migration, token revocation, password reset, backup restore and release publication as privileged operations requiring target confirmation and explicit authorization.
- Before changing auth middleware, create a route/method matrix covering public, browser-session, bearer/mobile, worker and owner-only cases; test positive and negative access.
- When a claim depends on reverse-proxy headers, TLS termination, origins, hostname dispatch or filesystem permissions, verify the active deployment configuration and environment rather than inferring from local source.

## Incident-Ready Evidence

For an authentication incident, preserve the timestamp, request ID, endpoint, app revision, environment category, status and relevant sanitized event. Use approved restricted systems for IP/identity correlation and secret values. The public handbook should contain the response procedure and ownership link, not customer data, raw logs, tokens, or private host identifiers.