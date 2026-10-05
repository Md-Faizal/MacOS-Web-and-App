# Workspace Components

## Root and Package Routing

| Area | Source root | Build/config authority | First task-specific lookup |
| --- | --- | --- | --- |
| Main API and web app package | Repository root | `package.json`, `package-lock.json` | Root script and implementation entry |
| Main web pages | `frontend/` | `vite.config.js` | Relevant HTML entry, then imported module |
| Shared API | `backend/` | Root package plus API server | Route registration, then handler |
| Department APIs | `backend/departments/` | Department metadata and contracts | Owning department `index.js` |
| Shared backend core | `backend/core/` | Root package and core module | Core implementation plus callers |
| Zentra app | `zentra-analytics-dashboard/` | Its package and lockfiles, `vite.config.ts`, `tsconfig.json` | Component/page and API client |
| Android app | `android/` | Gradle wrapper/build files/version catalog | Navigation, ViewModel/repository, screen |
| Rust crate | `shared/suite_core/` | Cargo manifest and lockfile | Domain module, export, caller, test |
| Deployment automation | `deploy/`, `.github/workflows/` | Exact script and workflow | Workflow triggers and deployment step |
| Health/support tools | `tools/` | Root package or workflow command | Invoking script and expected target |
| Handbook | `docs/handbook/`, `docs/AI-INDEX.md` | Manifest and docs build script | The task-specific chapter |

## Main Web Roots

- `frontend/index.html` is one configured Vite HTML entry; inspect imports to identify its runtime modules.
- `frontend/home.html` is another configured entry and carries the desktop shell/application bootstrap.
- `frontend/customer-ledger.html` is a separate configured page entry for ledger-facing routes.
- `frontend/public-product.html` is a separate configured public product page entry.
- `frontend/offline.html` is a standalone offline page entry.
- `frontend/modules/` contains feature-specific browser apps and domain UI.
- `frontend/scripts/` contains desktop shell, window, app-bar, and shared orchestration code.
- `frontend/shared/` contains browser-wide state, logging, notifications, sync, and bridge helpers.
- `frontend/styles/` contains app-level styling; inspect HTML imports and module-local styles as well.
- `frontend/public/` is served as public frontend assets; verify how each asset is referenced.

## Backend Roots

- `backend/main/macos-api-server.js` is the central Express startup and route composition file.
- `backend/departments/README.md` defines intended department conventions and migration boundaries.
- `backend/departments/index.js` is the department registry; follow its `create` factory for concrete wiring.
- `backend/core/db/database-manager.js` owns database open/startup/repair/migration lifecycle.
- `backend/core/db/schema-master.js` contains the current master schema SQL.
- `backend/shared/api/response.js` contains shared JSON response helper behavior.
- `backend/core/sync/` contains synchronization services; verify every route/event consumer.
- `backend/core/billing/`, `orders/`, `payments/`, `products/`, `variants/`, and `creditnotes/` contain cross-cutting domain modules.
- `backend/storage/`, `backend/uploads/`, and top-level runtime data folders are not documentation assets; inspect ignore and mount rules before touching.

## Zentra Roots

- `zentra-analytics-dashboard/src/` owns the React/TypeScript application source.
- `zentra-analytics-dashboard/src/components/` contains reusable UI and feature components where present.
- `zentra-analytics-dashboard/src/` data/client modules define actual network request shapes; search by API path for the owner.
- `zentra-analytics-dashboard/public/` holds static files copied/served by its Vite build.
- `zentra-analytics-dashboard/assets/` contains app assets; avoid confusing logos/media with UI screenshots.
- `zentra-analytics-dashboard/package.json` owns its scripts and dependency ranges, not the root manifest.
- `zentra-analytics-dashboard/.env.example` is a template; its URL defaults may differ from root backend defaults.

## Android Roots

- `android/app/src/main/java/` contains the Kotlin app source.
- `android/app/src/main/java/.../data/api/` contains API service/network/session boundaries; trace the `SessionManager.serverUrl` value.
- `android/app/src/main/java/.../ui/` contains Compose screens and UI components.
- `android/app/src/main/java/.../ui/viewmodels/` contains screen/application state owners.
- `android/app/src/main/res/` contains Android resources; not all resources are app screenshots.
- `android/app/build.gradle.kts` defines app SDK levels, Java/Kotlin toolchain, features and dependencies.
- `android/gradle/libs.versions.toml` owns catalog versions and plugin aliases.
- `android/gradle/wrapper/gradle-wrapper.properties` and `gradlew.bat` define the checked-in wrapper entry.

## Rust Roots

- `shared/suite_core/src/lib.rs` declares public module structure; follow it before browsing every Rust source.
- `shared/suite_core/src/` contains domain implementation; check `cfg` and feature gates before claiming target availability.
- `shared/suite_core/tests/` contains parity/integration test code; see which APIs it actually calls.
- `shared/suite_core/Cargo.toml` describes crate types, features and direct dependencies.
- `shared/suite_core/Cargo.lock` records resolved crate versions.
- `shared/suite_core/suite_core_bridge.js` may be a consumer bridge; verify path/caller exists in current checkout before relying on historical docs.

## Evidence Rule

When a map names a directory, search for the exact symbol/API/event in that directory and read the caller before editing. Folder names are navigation hints, not runtime guarantees. Cross-app ownership requires evidence from both producer and consumer.