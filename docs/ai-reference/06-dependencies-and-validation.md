# Dependencies and Validation Map

## Version Authorities

| Runtime | Version authority | Graph command |
| --- | --- | --- |
| Root Node API/main web | `package.json`, `package-lock.json` | `npm ls --all` from repository root |
| Zentra Node web | `zentra-analytics-dashboard/package.json` and lock | `npm --prefix zentra-analytics-dashboard ls --all` |
| Android plugins/libraries | `android/gradle/libs.versions.toml`, app build | From `android/`, `./gradlew.bat app:dependencies` on Windows |
| Rust crate | `shared/suite_core/Cargo.toml` and `Cargo.lock` | `cargo tree --manifest-path shared/suite_core/Cargo.toml` |
| Handbook renderer | Root package and lock | `npm ls markdown-it puppeteer` |

The generated npm inventory is `docs/handbook/site/inventory.json`. It includes declared scripts/manifests and locked package entries for root and Zentra. Regenerate after lockfile changes. It does not resolve Gradle or Cargo metadata into npm's schema.

## Known Compatibility Notes

- Root `engines.node` starts at Node 20, but the locked root Vite release requires Node `^20.19.0` or `>=22.12.0`.
- Root Vite and Zentra Vite are independent and on different major versions.
- CI workflows may specify a broader Node major than the effective bundler minimum; validate clean `npm ci` and build on the exact runner version.
- Android uses Java/Kotlin toolchain 17 and compile/target SDK 36 in current checked-in app config.
- Host `cargo test` does not prove a WASM or Android JNI target can build or load.
- Root dependency install has reported npm audit findings; review the current report separately rather than applying a forced bulk upgrade during documentation work.

## Validation Commands by Scope

| Concern | Command | Proof boundary |
| --- | --- | --- |
| Main Vite web build | `npm run build` | Main web build only; inspect build warnings |
| Zentra typecheck | `npm --prefix zentra-analytics-dashboard run lint` | `tsc --noEmit`, not ESLint |
| Zentra bundle | `npm --prefix zentra-analytics-dashboard run build` | Dashboard production bundle |
| Root contract: account | `npm run test:account-flow` | Specific account-flow contract assertions |
| Root contract: departments | `npm run test:departments` | Department registry contract only |
| Root contract: calendar | `npm run test:calendar` | Calendar contract behavior only |
| Root contract: notes | `npm run test:notes` | Notes contract behavior only |
| Rust suite | `cargo test --manifest-path shared/suite_core/Cargo.toml` | Host tests/parity test executable |
| Android unit tests | `./gradlew.bat testDebugUnitTest` from `android/` on Windows | JVM unit-test slice; not device capabilities |
| Android debug package | `./gradlew.bat assembleDebug` from `android/` | Local debug build; not production signing proof |
| Handbook/PDF | `npm run docs:build` | AI-reference line progress, HTML and all manifest-listed PDFs |

## Reporting Results

- Quote the exact command and working directory.
- State whether it was typecheck, compile, unit test, instrumented test, build, dry run, or live operation.
- Report warnings and skipped components that materially limit the result.
- A root build is not a whole-repository build; list the untested app targets.
- Do not report a production deployment as tested based on a local preview or CI build artifact.