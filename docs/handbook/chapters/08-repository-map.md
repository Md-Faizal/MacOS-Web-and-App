# Repository Map and Ownership

## Read the Repository by Responsibility

This repository is a multi-application workspace, not a single deployable package with one dependency graph. The root Node manifest supports the shared API and main Vite app; the Zentra dashboard has a second npm manifest and lockfile; Android is a Gradle project; Rust has a Cargo crate. Changes should start at the owning package boundary and then follow the integration to its caller.

| Path | Responsibility | First file to inspect |
| --- | --- | --- |
| `backend/main/` | HTTP server startup, middleware, route construction, server diagnostics | `backend/main/macos-api-server.js` |
| `backend/departments/` | Domain-owned API departments and contracts | `backend/departments/README.md` and the affected department's `index.js` |
| `backend/core/` | Shared backend infrastructure: DB, auth-adjacent services, synchronization, billing utilities | The owning `backend/core/` module and its call site |
| `backend/shared/` | Cross-domain server helpers | Search for the exact helper symbol and caller |
| `frontend/` | Main browser app pages, shared scripts/styles, and feature modules | `frontend/index.html`, `frontend/home.html`, then the feature module |
| `frontend/modules/` | Browser feature applications such as billing, products, contacts, analytics, notes, and widgets | Feature entry file under `frontend/modules/<feature>/` |
| `frontend/scripts/` | Desktop shell, app bar, windows, launch/navigation infrastructure | The script imported by the relevant HTML entry |
| `frontend/shared/` | Shared browser contracts, logger, store, event bus, notifications, and API bridges | Shared module plus all importers/callers |
| `zentra-analytics-dashboard/src/` | Independent React/TypeScript dashboard | Route/view component and its API/data access layer |
| `android/app/src/main/` | Kotlin native application and Compose screens | `MainActivity`, navigation, view-model, repository, or screen as relevant |
| `shared/suite_core/` | Rust domain and compute library with integration exports/tests | `Cargo.toml`, then implementation and tests for a domain |
| `.github/workflows/` | CI build and deployment automation | The workflow triggered by the changed paths |
| `deploy/` | Local/remote deployment scripts and publisher utilities | Exact OS and target-specific script |
| `tools/` | Health checks, conversion tools, local docs builder, supporting automation | The command definition in package/workflow plus the tool itself |
| `docs/` | API/schema references, guides, architecture history, generated handbook source | Start from `docs/AI-INDEX.md`; verify all technical claims |

## Runtime Data Is Not Source

Directories such as `database/`, `logs/`, `storage/`, `CloudStorage/`, `backend/uploads/`, and `Wallpapers/` may contain runtime state or large user-facing assets. Their presence in a development checkout does not mean their contents should ship in a source bundle, be copied to another environment, or be committed. Check `.gitignore`, `Dockerfile`, compose mounts, the selected deployment script, and backup policy before changing how these paths are handled.

Database migrations are not just another backend feature file: inspect existing schema, migration order, startup behavior, backup/restore requirements, and tests before altering persistent data. Do not run a migration against a production target as an exploratory step.

## Package Boundaries

| Package | Manifest/lock | Primary output |
| --- | --- | --- |
| Root | `package.json` / `package-lock.json` | API/runtime dependencies and Vite build under `dist/` |
| Zentra | `zentra-analytics-dashboard/package.json` and lockfile | Independent React dashboard build |
| Android | `android/` Gradle files, wrapper, version catalog | Debug/release APK or Android test outputs |
| Rust | `shared/suite_core/Cargo.toml` and `Cargo.lock` | Native/WASM-compatible library artifacts according to configured target/features |
| Handbook | Root npm script plus `tools/docs/build-handbook.mjs` | Static HTML under `docs/handbook/site/`, PDFs and npm inventory under `artifacts/documentation/` |

Installing, building, or publishing one package does not implicitly validate the others. Root `npm run build` builds the main frontend; it does not run the Rust, Zentra, or Android build. Use the package's own lockfile/wrapper and state which output was verified.

## Trace a Change Across Ownership

For a product behavior change, use this sequence:

1. Identify the user-facing entry point and its current feature owner.
2. Find the request, event, or native bridge used by that entry point.
3. Locate the server route and authorization/validation path, or the Rust/native boundary if no HTTP request is involved.
4. Follow the domain service into persistence or computation and identify transaction/ordering assumptions.
5. Find tests closest to the affected behavior, then search for other consumers of the same contract.
6. Update the owner chapter and relevant cross-platform chapters; leave unrelated diagrams alone.

This trace is intentionally explicit. Similar screen names do not prove that MacOS, Zentra, Android, and backend flows share the same implementation.

## Where to Expand the Map

Use targeted file discovery rather than pasting recursive listings into agent context. For example, locate a feature's entry file, inspect its imports, and then search only for the API path or event name it uses. The machine-readable routing map at `docs/handbook/ai/system-map.json` provides the first hop; `docs/AI-INDEX.md` names the authoritative package metadata.