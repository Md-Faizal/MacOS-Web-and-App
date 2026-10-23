# AI Documentation Index

## Purpose and Retrieval Budget

This is the compact routing layer for coding agents, maintainers, and incident responders working in this repository. Read the row matching the task, then load only its handbook chapter and the smallest relevant source/config/test slice. Do not load all architecture diaries or all frontend modules at the start of a task. The aim is to preserve enough system context to route correctly, while leaving detailed explanation in subsystem chapters and implementation in code.

Repository-relative paths below are intended to be opened from the workspace root. Generated artifacts may be absent until `npm run docs:build` has run. When source and prose disagree, report the conflict and use the current implementation/configuration as the provisional authority; do not silently rewrite production facts based on an old document.

The expanded line-oriented maps live in `docs/ai-reference/`. Start with its `README.md`; then use only the component, backend, data, client, runtime, dependency, or generated source-catalog file relevant to the task. The build counts nonblank lines across this entrypoint and the maps, targeting 1,000–2,000 total lines.

## Authority and Evidence

Use this precedence when deciding what is true:

1. Current executable source, route registration, schema/migration, and actual call site establish implemented behavior.
2. Lockfiles and build/runtime configuration establish resolved package versions, toolchain settings, ports, and build targets.
3. Tests establish the behavior they exercise. A passing unit test does not prove an untested production integration or deployed environment.
4. Active CI workflows and deployment scripts establish automated procedures. Confirm the selected workflow and branch before describing a procedure as current.
5. API catalogs and subsystem handbooks explain intent and known contracts, but must be checked against source when a task changes behavior.
6. Dated diaries, progress reports, and benchmarks are historical evidence unless reproduced against the current revision with a documented method.

Classify important findings as `source-verified`, `test-verified`, `historical`, or `needs-owner-confirmation`. A capability described in a roadmap is not necessarily implemented. A Rust export does not prove that Node, the browser, or Android currently calls it. A workflow build does not prove production deployment succeeded. State which evidence was actually inspected.

## Component Ownership

| Component | Owns | Start at |
| --- | --- | --- |
| Main browser suite | Vanilla HTML, CSS, JavaScript, app windows, module UI | `frontend/`, `vite.config.js` |
| Zentra | Separate React/TypeScript analytics UI and its own Vite/dependency graph | `zentra-analytics-dashboard/src/`, its `package.json` and `vite.config.ts` |
| Shared API | Express startup, middleware, route wiring and backend domains | `backend/main/macos-api-server.js`, then the exact route/department |
| Data | SQLite schema, migrations, database access and domain persistence | `backend/core/db/`, schema/migrations, owning domain module |
| Rust compute | Crate API, native/WASM build features, parity tests | `shared/suite_core/Cargo.toml`, `src/`, `tests/` |
| Android POS | Kotlin UI, Compose/Material 3, networking, native platform capabilities | `android/app/src/main/`, Gradle files and version catalog |
| Operations | Local tasks, build/deployment automation, health checks | `.vscode/tasks.json`, `package.json`, active `.github/workflows/`, exact `deploy/` script |

These are repository ownership boundaries, not a claim that every app shares one runtime, build graph, database connection, or release process. The root and Zentra npm projects have independent manifests and lockfiles. Android uses Gradle; Rust uses Cargo. Verify cross-platform integrations from both ends of the boundary.

## Task Routing

| Task/question | Read first | Then inspect |
| --- | --- | --- |
| Understand repository topology or a cross-app feature | `docs/handbook/chapters/00-system-map.md` | Each participant's source and the actual request/event path |
| Browse component ownership or find source paths | `docs/ai-reference/00-components.md`, `docs/ai-reference/05-source-catalog.md` | Verify active imports/callers before inferring runtime behavior |
| Find code ownership or trace a change across the repository | `docs/handbook/chapters/08-repository-map.md` | Owning package, imported entry point, exact caller, test and workflow |
| Diagnose a local/prod request path or app not reaching the API | `docs/handbook/chapters/09-runtime-paths.md` | `vite.config.js`, `server-prod.js`, API startup, Docker/PM2 configuration, browser network target |
| Change middleware, auth policy, route ownership, or persistence | `docs/handbook/chapters/10-department-boundaries.md` | Exact route mount, middleware order, department contract, schema/migration and test |
| Trace browser, Zentra, Android or Rust-client behavior | `docs/ai-reference/03-client-platforms.md` | Client request/bridge and matching server/export call site |
| Set up a workstation or start a local app | `docs/handbook/chapters/01-setup.md` | Root and Zentra scripts, `.vscode/tasks.json`, environment examples, active Vite config |
| Change an API endpoint or backend behavior | `docs/handbook/chapters/02-node-api.md` | Route registration, handler, authorization/middleware, DB call, contract test |
| Change schema, migration, or persistent data behavior | `docs/handbook/chapters/11-persistence.md` | `backend/core/db/`, migrations, transaction boundaries, callers and tests; treat old schema prose as a map to verify |
| Change billing, ledger, inventory, orders, contacts, or analytics data | `docs/DATABASE_SCHEMA.md`, `docs/BILLING_DB_SCHEMA.md`, then owning backend module | `backend/core/db/`, domain writer, callers, and contract tests |
| Change contact ownership, worker sharing, or deletion/retention | `docs/handbook/chapters/25-contacts-scope.md` | Contact routes, `user_contact_access`, worker scope, linked records and migration/retention policy |
| Review product/batch stock, deletion, or search behavior | `docs/handbook/chapters/18-inventory-lifecycle.md` | Product UI, department route/handler, invoice-item joins and mutation transaction |
| Change analytics reports or explain a KPI | `docs/handbook/chapters/19-analytics-contracts.md` | UI request, access-scope query, calculator and exact metric definition |
| Change auth/session policy, request middleware, or sensitive routes | `docs/handbook/chapters/12-security-boundaries.md` | Exact middleware order, route mount, auth service, client call and negative/positive tests |
| Trace browser/mobile login, refresh, device revocation, or WebAuthn | `docs/handbook/chapters/26-auth-sessions.md` | Auth route, session service, cookies/bearer client and audit/revocation paths |
| Change Rust behavior or cross-language payload | `docs/handbook/chapters/03-rust-core.md` | Rust implementation/test, export/bridge, exact caller, target build configuration |
| Trace Rust module ownership, FFI, or platform build support | `docs/handbook/chapters/21-rust-module-map.md` | `lib.rs`, feature/target config, FFI wrapper, actual caller and target test |
| Benchmark PDF renderer resources on primary/backup VMs | `docs/operations/pdf-rendering-vm-benchmark-handoff.md` | Confirm SSH alias targets and production status; inspect current renderer call paths and get approval before load tests or deployment |
| Manage multi-VM HA architecture, failover, VM distribution, and role-based cluster ops | `docs/MULTI_VM_HA_ARCHITECTURE_DIARY.md` | Inspect SSH alias `my-mac` & `cos`, Docker compose topologies, Brevo/Stalwart mail pathways, and cluster role configs |
| Change MacOS browser UI | `docs/handbook/chapters/04-web-frontends.md` | `frontend/` component/module, styles, event/state source, API client and browser entry page |
| Trace billing cache/events or invoice UI lifecycle | `docs/handbook/chapters/13-macos-workflows.md` | `BillingAPI`, view activation, API route, invalidation and subscriber |
| Plan or build automated email summaries or WhatsApp reminders | `docs/AUTOMATED_EMAIL_AND_WHATSAPP_REMINDERS_SPEC.md` | Local VM Postfix loopback (127.0.0.1:25), Supervised 1-click wa.me dispatcher, reminder cooldown |
| Review invoice creation, numbering, or partial-write behavior | `docs/handbook/chapters/16-invoice-lifecycle.md` | Browser submit, billing route/handler, calculator, SQL writes, broadcasts and failure tests |
| Change estimate persistence, history, or conversion | `docs/handbook/chapters/16-invoice-lifecycle.md` | Estimate editor/history, estimate API/schema, PDF endpoints and bill/order conversion |
| Trace payment allocation, credit-note splitting, or ledger refresh | `docs/handbook/chapters/23-payment-lifecycle.md` | UI payload, nested invoice payment handler, unified payments table, ledger sync and SSE event |
| Trace order stages or convert an order to invoice | `docs/handbook/chapters/24-order-lifecycle.md` | Main/Android order UI, order handler, server calculation, invoice write and stage update |
| Trace SSE/BroadcastChannel refresh or review event-stream access | `docs/handbook/chapters/17-realtime-sync.md` | Mutation publisher, `/api/events` route policy, client bus, subscriber and refetch |
| Trace Notes, Calendar, or Cloud Storage behavior | `docs/handbook/chapters/27-workspace-modules.md` | Feature owner, route handler, storage/auth exceptions and per-module sync path |
| Change Zentra | `docs/handbook/chapters/04-web-frontends.md` | Zentra component, data client, access control, Vite config and independent scripts |
| Trace Notes SSE, Calendar CRUD, or Cloud Storage sharing/uploads | `docs/handbook/chapters/27-workspace-modules.md` | Owning department routes, auth exceptions, data/file storage and client sync state |
| Trace Zentra navigation/auth/data state | `docs/handbook/chapters/14-zentra-architecture.md` | `App.tsx`, view/data client, event producer and backend access check |
| Change native Android feature | `docs/handbook/chapters/05-android.md` | Kotlin screen/view-model/repository, API contract, version catalog, Gradle task and test |
| Trace Android tabs, session, or configurable API URL | `docs/handbook/chapters/15-android-architecture.md` | Navigation, `MainViewModel`, `SessionManager`, `NetworkClient` and route |
| Trace Android billing, local cache, or mutation refresh | `docs/handbook/chapters/22-android-billing.md` | `BillingViewModel`, scoped cache, Retrofit response and billing route |
| Find a package, version, build tool or command | `docs/handbook/chapters/06-dependencies.md` | Matching lockfile/catalog and script definition; never infer from a transitive package name |
| Deploy, diagnose a VM, or plan recovery | `docs/handbook/chapters/07-operations.md` | Active workflow/script and owner-approved target inventory; do not run mutating steps to learn what they do |
| Change or inspect deployment/release automation | `docs/handbook/chapters/20-release-workflows.md` | Exact active workflow, inputs/secrets names, artifact and smoke-test steps |
| Choose safe build/test commands or check package authority | `docs/ai-reference/04-runtime-operations.md`, `docs/ai-reference/06-dependencies-and-validation.md` | Exact manifest, wrapper, workflow and configured target |
| Follow a diagnostic task checklist | `docs/ai-reference/07-task-playbooks.md` | Verify every step against the specific failing code path |
| Understand historical design rationale | Search dated docs/diaries after checking the current owner code | Label conclusions historical until verified at current `HEAD` |

For user-interface screenshots and diagram practices, read `docs/handbook/FIGURE-CAPTURE-GUIDE.md`. It specifies how to label placeholders and capture reviewable images without production records.

For every cross-app change, identify the contract owner first. Trace one operation from UI action through client serialization, HTTP/event/FFI boundary, validation and persistence, then trace the result back to rendering. Record loading, empty, validation, failure, retry, and authorization behavior where the code defines them. Do not infer event guarantees, transaction atomicity, caching, tenant isolation, or offline semantics from names alone.

## Safe Commands and Validation

Commands below are run from the repository root unless a working directory is stated. They build, inspect, or test local code; they are not production deployment approvals.

| Purpose | Command | Scope/effect |
| --- | --- | --- |
| Install root JS graph | `npm ci` | Replaces root `node_modules` from root lockfile |
| Start MacOS web plus API | `npm run dev:local` | Long-running local processes; root scripts configure Vite 5173 and API 3002 |
| Start Zentra plus API | `npm run dev:zentra` | Long-running local processes; check Zentra API URL configuration independently |
| Build main web UI | `npm run build` | Root Vite frontend build; not a build of every app |
| Build Zentra | `npm --prefix zentra-analytics-dashboard run build` | Independent dashboard build |
| Type-check Zentra | `npm --prefix zentra-analytics-dashboard run lint` | Executes `tsc --noEmit`; it is not ESLint |
| Run named root contract tests | `npm run test:account-flow`, `npm run test:departments`, `npm run test:calendar`, `npm run test:notes` | These named scripts exist; root has no generic `npm test` script |
| Test Rust host target | `cargo test --manifest-path shared/suite_core/Cargo.toml` | Does not alone verify WASM or Android/JNI target builds |
| Inspect Rust dependencies | `cargo tree --manifest-path shared/suite_core/Cargo.toml` | Reads the Rust dependency graph |
| Android unit test (Windows) | From `android/`, `./gradlew.bat testDebugUnitTest` | Requires JDK 17 and Android toolchain; instrumented/device coverage is separate |
| Android dependency graph (Windows) | From `android/`, `./gradlew.bat app:dependencies` | Resolves Gradle app dependencies |
| Check development health | `npm run check:dev` | Calls configured local service endpoints |
| Generate docs | `npm run docs:build` | Writes ignored HTML/PDF/inventory outputs; uses Puppeteer browser |

Before claiming success, run the narrowest test for the touched behavior, then relevant build/type checks. Report the exact command and result; do not say a whole stack is tested when only compilation ran. For commands that may contact a configured server, inspect target URL/environment first. Keep long-running dev servers separate from one-shot validation.

The following operations can mutate a remote service, publish an artifact, or change production state and require explicit user authorization plus target verification: `npm run deploy:ubuntu`, `npm run deploy:windows`, `npm run deploy:android:test`, `npm run deploy:android:prod`, PM2 start/stop commands, manual workflow dispatches, migrations without preview, version bumps, and Git pushes. A dry-run flag is useful evidence but is not interchangeable with live-operation approval.

## Dependencies and Runtime Notes

Use the root `package.json` and `package-lock.json` for the main app/API graph and `zentra-analytics-dashboard/package.json` plus its lockfile for Zentra. Use `android/gradle/libs.versions.toml`, Gradle files, and wrapper properties for Android. Use `shared/suite_core/Cargo.toml` and `Cargo.lock` for Rust. The generated `docs/handbook/site/inventory.json` contains locked npm package versions and root/Zentra scripts; regenerate before treating it as current. `docs/handbook/site/schema-catalog.json` contains the master SQLite declaration introspected in memory; it is not the deployed/migrated schema. `artifacts/documentation/handbook-metrics.json` records actual master/volume pages, chapter words, AI-reference lines, cataloged paths, schema table/column counts and screenshot placeholders. These generated files do not replace the Gradle or Cargo dependency graphs.

Known compatibility issue: the root manifest permits Node `>=20`, while locked root Vite 8 requires `^20.19.0` or `>=22.12.0`. Select a compatible patch version rather than interpreting the broad engine range literally. Root and Zentra use different Vite majors. Verify exact versions in lockfiles because manifest ranges are not resolved versions.

## Conflict and Safety Rules

Existing docs such as `docs/COMMANDS.md`, `docs/HOSTING_SETUP.md`, and `docs/GITHUB_1_CLICK_DEPLOY_GUIDE.md` may describe older paths, process names, ports, or VM topology. Compare their instructions to `.vscode/tasks.json`, package scripts, `ecosystem.config.js`, deployment scripts, and active workflows before reuse. If sources disagree, preserve the disagreement in the task response and identify the verification still needed.

Never read, quote, or commit real `.env` values, credentials, tokens, signing keys, customer data, or private host identifiers. Environment templates provide variable names and placeholders only. Do not copy credential-like fallback values from scripts into docs or terminal transcripts. For VM identity/role, OS, sizing, firewall, data volumes, backups, restore tests, monitoring, RPO/RTO, rollback, or escalation, require an owner-approved source. Mark missing values `needs-owner-confirmation`; do not make up a plausible value.

**Current security gate:** inspection found hard-coded credential-like fallback/authentication values in Node API startup, auth/mobile session services, the main web billing client, and the Android network client. Their values are intentionally omitted here. Treat them as potentially compromised: security owners should revoke/rotate affected credentials, remove embedded fallbacks, and validate release configuration before production use. Do not quote, copy, or build examples from those values.

Use synthetic data in examples and screenshots. Before publishing a capture, inspect visible browser URLs, account labels, customer/invoice details, balances, notifications, logs, debug overlays, and environment names. A screenshot should say which app/build, platform/device, viewport, and synthetic scenario it depicts. An obvious `SCREENSHOT PLACEHOLDER` is acceptable during authoring; do not present it as a real capture.

## Maintaining This Index

Keep the combined nonblank line count of this file and `docs/ai-reference/` between 1,000 and 2,000. This file remains the short routing and policy front door; put subsystem context in the smallest relevant map, not in one monolithic index. Add a map only when it improves retrieval, and keep the generated source catalog as one concise row per text source. Let manifests, lockfiles, scripts, Gradle/Cargo metadata, and generated inventories supply exact lists. After changes, run `npm run docs:build`, verify the line-count report and generated site/PDFs, and review changed commands against their definitions.