# Workstation Setup

## Prerequisites

| Work area | Required toolchain | Evidence / notes |
| --- | --- | --- |
| Main web app and API | Node.js and npm | Root manifest requires Node `>=20`; locked root Vite 8 requires Node `^20.19.0` or `>=22.12.0`. Use a compatible pinned runtime. |
| Zentra | Node.js and npm | Independent package manifest and lockfile; Vite major differs from the root app. |
| Rust core | Rust toolchain with Cargo | Use the crate manifest and lockfile. WASM/native targets may require target-specific setup. |
| Android | JDK 17, Android SDK, Gradle wrapper | The Android project targets SDK 36 and has a wrapper checked in. Use Android Studio for emulator/device workflows. |
| PDF handbook generation | Node.js and Puppeteer browser | The build uses the root Puppeteer dependency. On a new machine, install the Puppeteer-managed browser if unavailable. |

## Install and Start Locally

From the repository root, install the exact root dependency graph:

```powershell
npm ci
```

The root environment template is `.env.example`. Copy it only when local configuration is needed, then replace placeholders with local values; never commit `.env` files containing secrets.

```powershell
Copy-Item .env.example .env.development
npm run dev:local
```

`dev:local` starts the shared API and main Vite frontend. The root scripts configure the API on port `3002` and the main Vite server on `5173`. Open `http://localhost:5173`.

To start the API with the Zentra development server:

```powershell
npm run dev:zentra
```

The root script starts the API and invokes Zentra's Vite server on port `3000`. Check `zentra-analytics-dashboard/.env.example` and its Vite configuration before assuming the client API URL matches the root backend port; the checked-in example values are not identical.

## Build and Validate

```powershell
npm run build
npm --prefix zentra-analytics-dashboard run build
npm --prefix zentra-analytics-dashboard run lint
cargo test --manifest-path shared/suite_core/Cargo.toml
```

Zentra's `lint` script runs TypeScript's `tsc --noEmit`; it is a type check, not ESLint. The root project has named contract checks rather than a general `npm test` script:

```powershell
npm run test:account-flow
npm run test:departments
npm run test:calendar
npm run test:notes
```

For Android, run from the `android/` directory on Windows:

```powershell
.\gradlew.bat testDebugUnitTest
.\gradlew.bat assembleDebug
```

On macOS/Linux, use `./gradlew` with the same Gradle task names. Test and release tasks should be run with the Android SDK and JDK 17 configured.

## Handbook Build

```powershell
npm run docs:build
```

This generates the static HTML site under `docs/handbook/site/` and PDFs plus a JSON inventory under `artifacts/documentation/`. The documentation workflow uploads those outputs separately from product deployment.