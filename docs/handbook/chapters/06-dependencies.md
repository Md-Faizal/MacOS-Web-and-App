# Dependencies and Toolchains

## Generated JavaScript Inventory

The handbook build creates `docs/handbook/site/inventory.json` from both npm manifests and lockfiles. It records each declared script and dependency along with locked package paths, versions, and available license metadata. The package manifests and lockfiles remain authoritative.

Useful commands for a live install:

```powershell
npm ls --all
npm --prefix zentra-analytics-dashboard ls --all
```

The root and Zentra dependency graphs are independent. Install and update them separately; do not run one lockfile operation from the wrong project root.

## Android and Rust Inventories

Use the native package tools to resolve their full graphs:

```powershell
Set-Location android
.\gradlew.bat app:dependencies
Set-Location ..
cargo tree --manifest-path shared/suite_core/Cargo.toml
cargo metadata --manifest-path shared/suite_core/Cargo.toml --locked --format-version 1
```

Android version constraints are maintained in `android/gradle/libs.versions.toml` and Gradle build files. Rust package versions are pinned by `shared/suite_core/Cargo.lock`. The handbook does not attempt to translate these ecosystems into a manually maintained second lockfile.

## Runtime Compatibility

The root manifest's `node >=20` engine range is broader than the locked root Vite 8 runtime requirement (`^20.19.0 || >=22.12.0`). Select and pin a compatible Node patch/runtime in local setup and CI. The Zentra project uses Vite 6, so do not assume version parity between its manifest and the root project.

For reproducible installs, use `npm ci` at the root and in Zentra's project context. For Gradle, use the checked-in wrapper; for Rust, use Cargo with the checked-in lockfile and `--locked` where supported.

## Dependency Change Record

When upgrading a direct dependency, record its purpose, compatibility floor, security/support status, and affected build/test commands in the change description. Generated inventory changes are evidence of the new lockfile state, not a substitute for reviewing breaking changes or licenses.