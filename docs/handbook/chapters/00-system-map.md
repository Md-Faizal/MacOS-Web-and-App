# System Map

## Purpose

The repository contains a browser-based business suite, an analytics dashboard, a Node.js API, a shared Rust compute crate, and a native Android POS application. This handbook describes the checked-in implementation and its operational workflows. It does not certify a production topology or performance claim unless the claim is independently backed by current code, configuration, or an observed test.

## Logical Component Map

![Logical system component map](asset:system-context.svg)

The drawing is a logical ownership map, not a deployment diagram. Actual request routes, Rust integration, and server placement must be confirmed in the owning module and active environment configuration.

| Component | Implementation root | Primary responsibility |
| --- | --- | --- |
| MacOS web experience | `frontend/` | Multi-page HTML/CSS/JavaScript desktop interface |
| Zentra dashboard | `zentra-analytics-dashboard/src/` | React and TypeScript analytics interface |
| Shared API | `backend/main/macos-api-server.js` | Express HTTP API and backend service registration |
| Shared compute | `shared/suite_core/` | Rust library compiled for supported native/WASM integrations |
| Android POS | `android/app/src/main/` | Kotlin application using Jetpack Compose and Material 3 |
| Web build configuration | `vite.config.js` | Main frontend root, build, and development server configuration |

## Source-of-Truth Rules

1. Use package manifests and lockfiles for JavaScript package and runtime facts.
2. Use `android/gradle/libs.versions.toml`, Gradle build files, and the wrapper for Android versions and tasks.
3. Use `shared/suite_core/Cargo.toml`, `Cargo.lock`, source, and tests for Rust facts.
4. Use checked-in workflow and deployment scripts for automated operational behavior; confirm environment-specific settings with the owner.
5. Treat older architecture diaries as historical evidence, not proof that a feature remains active at `HEAD`.

## Change Boundaries

The MacOS web app and Zentra are separate frontend projects with separate package manifests and Vite versions. Android has its own Gradle build. The Rust crate has its own Cargo dependency graph. A change affecting an API contract, persistent data, or cross-platform payload should be documented at the owning boundary and linked from each affected client chapter.