# Rust Core Module and FFI Map

## Crate Surface

`shared/suite_core/src/lib.rs` declares analytics, catalog, documents, FFI, finance, inventory, sales, storage, synchronization, and shared types. It also re-exports selected modules from the crate root. A re-export is a public API convenience, not evidence that every consumer links the symbol.

| Module | Source directory | Navigation focus |
| --- | --- | --- |
| Analytics | `src/analytics/` | Aging, KPI and customer health calculations |
| Catalog | `src/catalog/` | Search and expiry logic |
| Documents | `src/documents/` | PDF submodules and currency words |
| FFI | `src/ffi/` | Native/JNI and WASM exported functions |
| Finance | `src/finance/` | Invoice calculations and ledger settlement |
| Inventory | `src/inventory/` | Batch depletion/stock rules |
| Sales | `src/sales/` | Order calculations/fulfillment |
| Storage | `src/storage/` | Image/wallpaper and file metadata operations |
| Sync | `src/sync/` | Collection fingerprinting and ETag support |
| Types | `src/types.rs` | Shared serializable input/output structures |

The actual public boundary is the combination of module visibility, exports, `cfg` and Cargo features. Use `cargo metadata` and inspect FFI wrappers/callers before documenting a symbol as supported by a target.

## Build Intent

The crate uses edition 2021, `cdylib` and `rlib` crate types, Serde/Serde JSON, and conditional JNI on non-WASM targets. It declares `jni-export` and `wasm-export` features; Cargo `default` is empty. The release profile enables optimization, LTO, one codegen unit, abort-on-panic and stripping.

This is not enough to infer an Android `.so` or browser `.wasm` is built and packaged in CI. Locate the NDK/rust target commands, generated artifact, bridge loader, and consumer. The deployment workflows reviewed so far do not establish that each client build packages every Rust target.

## FFI/Bridge Investigation

| Surface | Inspect in order |
| --- | --- |
| C ABI / JNI | `src/ffi/jni.rs` and module exports → build target/feature → Kotlin external declaration → caller → Android packaging config |
| Browser WASM | `src/ffi/wasm.rs` → WASM target/bindgen/build command → JS bridge loader → browser call site → fallback/error path |
| Node native | Native FFI/export layer → installed binary/runtime loader → Node wrapper → backend call site |
| Fast path | `src/ffi/fast_path.rs` → input/output ABI → consumer and parity test |

Do not rely on roadmap names such as "100% offloaded" without a live call-site trace. A fallback may be the common runtime path even if WASM/native code compiles.

## Verification Matrix

| Check | Command/evidence | What it proves |
| --- | --- | --- |
| Rust host suite | `cargo test --manifest-path shared/suite_core/Cargo.toml` | Host-target unit/parity test paths that ran |
| Crate graph | `cargo tree --manifest-path shared/suite_core/Cargo.toml` | Resolved host dependency tree |
| Locked metadata | `cargo metadata --manifest-path shared/suite_core/Cargo.toml --locked --format-version 1` | Cargo manifest/lock graph consistency |
| WASM target | Target-specific cargo command and generated artifact | Only the selected WASM build path; not browser invocation correctness |
| Android native target | NDK build task and packaged library inspection | Only the selected Android ABI; not every device ABI |
| Parity | Same fixtures through Rust and consumer implementations | Contract agreement for those fixtures only |

When result parity changes, record integer/float conversion, dates/time zone, null/default, ordering and error mapping at serialization boundaries. For finance/inventory code, include rounding, negative/insufficient cases and deterministic order in tests.

## Module-Level Ownership

- Invoice calculation should be traced from the server's `calculateBillItemsAndSummary` adapter to Rust only if the bridge call site is active for that build.
- Ledger settlement input types should be followed from SQL row mapping into Rust, including payment/credit-note flags and date normalization.
- Inventory depletion must be followed from invoice mutation into batch quantities and persisted state; a pure allocation result is not the same as a committed stock update.
- Search ranking should document thresholds and fallback behavior at its calling handler, not only in the Rust test name.
- Fingerprints summarize selected database fields; they do not imply cryptographic integrity of every row or cache payload.

Update this chapter when modules, features, FFI signatures or target build workflows change. Link to the owning parity test and consumer rather than copying implementation source into prose.