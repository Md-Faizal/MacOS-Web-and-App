# Rust Compute Core

## Crate Boundary

The shared Rust crate lives at `shared/suite_core/`. Its manifest identifies the crate as `suite_core`, edition 2021, with `cdylib` and `rlib` outputs. Serde and Serde JSON are declared dependencies. JNI is conditional on non-WASM targets; `jni-export` and `wasm-export` are declared features.

These declarations establish build intent, not that every operation is currently called by every client. Verify a claimed integration by following the bridge/export and its call site before documenting it as active behavior.

The Node Product List press-asset route calls `SuiteCoreBridge.renderCatalogQrLabelPdf`, which invokes the `suite_render_catalog_qr_label_pdf` WebAssembly export. Rebuild `shared/suite_core/target/wasm32-unknown-unknown/release/suite_core.wasm` and publish the matching `frontend/shared/suite_core.wasm` asset when changing this Rust renderer; the Node bridge prefers the checked-in frontend asset. This renderer creates an A4 vector label sheet, while the Product List ZIP packages per-label SVGs and CSV metadata.

## Build and Test

```powershell
cargo test --manifest-path shared/suite_core/Cargo.toml
cargo check --manifest-path shared/suite_core/Cargo.toml
cargo tree --manifest-path shared/suite_core/Cargo.toml
cargo metadata --manifest-path shared/suite_core/Cargo.toml --locked --format-version 1
```

The test and dependency graph are defined by `shared/suite_core/tests/`, `Cargo.toml`, and `Cargo.lock`. For a specific target, install that target using rustup and follow the bridge's build configuration; do not assume a host `cargo test` proves a WASM or Android build.

## Integration Surfaces

| Consumer | Evidence to inspect |
| --- | --- |
| Node.js | Native bridge/FFI source and the server call site |
| Browser | WASM build output, JS bridge, and frontend import/call site |
| Android | JNI exports, NDK configuration, Kotlin declaration, and caller |

Document payload schemas at the shared boundary first, then link the consumers. A Rust type or parity test alone does not prove that the production server currently invokes that code path.