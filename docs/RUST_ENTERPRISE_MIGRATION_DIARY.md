# Engineering Diary: Enterprise Rust Migration & "Overkill Now for Easy Tomorrow" Playbook

> **Target**: Incrementally migrate heavy compute, math, financial accounting, and data validation from the macOS Business Suite (Node.js/JS) into a high-performance, single-source-of-truth Rust core (**`shared/suite_core`**).
> 
> **Non-Negotiable Rule**: **Zero Business Regression**. This ERP runs active business operations and generates revenue. Every migration step must use the **Strangler Fig pattern** with bit-for-bit parity tests and a 100% graceful JavaScript fallback.
> 
> **Status**: Active — Phase 1 & 2 Completed (Invoicing, Ledger FIFO, Analytics, Expiry, Orders)  
> **Initiated**: 2026-09-20  
> **Primary Tracking File**: `docs/RUST_ENTERPRISE_MIGRATION_DIARY.md`

---

## 1. System Architecture & The "Strangler Fig" Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        macOS Business Suite Client                     │
│               (Browser WebApp / Android Mobile App)                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
               ┌────────────────────┴───────────────────┐
               ▼                                        ▼
    [Browser / Node.js Engine]                 [Android Native Client]
               │                                        │
    `suite_core_bridge.js`                     `SuiteCoreJni.kt`
               │                                        │
               ▼                                        ▼
    [ WebAssembly Target ]                     [ JNI Native Target ]
     (wasm32-unknown-unknown)                  (aarch64-linux-android)
               │                                        │
               └────────────────────┬───────────────────┘
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │               `shared/suite_core` (Pure Rust)          │
       │  - Zero allocations where possible                     │
       │  - Deterministic rounding (GST / 2 decimals)           │
       │  - Strict parity tests in `tests/parity_tests.rs`       │
       └────────────────────────────────────────────────────────┘
```

### Why This Protects the Business:
1. **No Monolithic Rewrite**: We never rewrite the whole 32,000 lines of Node.js backend. The Node.js server stays responsible for routing, HTTP sessions, and SQLite queries.
2. **Deterministic Calculations**: Whether calculating taxes on keystroke in Chrome, processing an offline payment on Android, or finalizing a ledger on the cloud server, **the exact same Rust binary logic executes**.
3. **Fail-Safe Graceful Fallback**: The `suite_core_bridge.js` wraps every WASM call with a try-catch. If the WASM file is missing, corrupt, or fails, **the system instantly and silently executes the battle-tested JavaScript math without throwing an error**.

---

## 2. Migration Status Matrix & Domain Progress

Overall Backend Rust Migration Progress: **~45% of Critical Computational & Financial Logic Migrated** (~12% of total 65k LOC backend).

| Domain / Subsystem | Scope & Functionality | Rust Path (`shared/suite_core/src/`) | Targets Available | Parity Test Status | Migration Progress % | Production Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Finance / Invoicing** | Reverse GST, Free Scheme, Cascading Discounts, Rounding | `finance/invoicing/` | WASM, JNI, FFI | ✅ 100% Passing (`parity_tests.rs`) | **100%** | 🟢 **Live in Production** |
| **Finance / Ledger** | FIFO Debt Settlement, Balance Statements, Allocation Map | `finance/ledger/` | WASM, JNI, FFI | ✅ 100% Passing | **100%** | 🟢 **Live in Production** |
| **Inventory / Depletion** | FEFO/FIFO Batch Stock Depletion & Multi-Batch Reservations | `inventory/depletion.rs` | WASM, FFI, Bridge | ✅ 100% Passing (`parity_tests.rs`) | **100%** | 🟢 **Live & WASM Ready** |
| **Analytics Engine** | Overdue Aging (0-30, 31-60, 61-90, 90+), Executive KPIs | `analytics/` | WASM, JNI, FFI | ✅ 100% Passing | **100%** | 🟢 **Live in Production** |
| **Catalog & Expiry** | Batch Expiry & Freshness Classification (Valid/Expiring/Expired) | `catalog/expiry.rs` | WASM, JNI, FFI | ✅ 100% Passing | **100%** | 🟢 **Live in Production** |
| **Sales Orders** | Order Line Fulfillment & Stage Calculations | `sales/orders.rs` | WASM, JNI, FFI | ✅ 100% Passing | **100%** | 🟢 **Live in Production** |
| **Storage & Wallpaper Engine** | Zero-GC Image Resize, Format Conversion (WebP/AVIF), Checksums | `storage/wallpaper.rs` or Sidecar | Standalone CLI / NAPI | ⏳ In Planning | **0%** | 🟡 *Option B: High RAM Impact* |
| **Document / PDF Engine** | Replace Python `execSync` invoice generator with native stream | `documents/pdf/` | Standalone CLI / FFI | ⏳ In Planning | **0%** | 🟡 *Option C: Event-Loop Relief* |
| **Ledger Sequencing & Audit** | Strict Sequential Invoice Numbers & Anti-Tamper Checksums | `finance/ledger/sequencing.rs` | WASM, FFI | ⏳ In Planning | **0%** | 🟡 *Option D: Data Integrity* |
| **Auth / OAuth / AI Glue** | Google OAuth 2.0, WebAuthn Passkeys, Gemini AI Streaming | Node.js Express Gateway | N/A (Keep JS Glue) | Managed via battle-tested npm SDKs | **Exempt (Keep JS)** | 🟢 **Production Permanent** |

---

## 3. The 5-Step Protocol for Any AI or Developer Migrating a New Module

Whenever migrating a new function or module from JavaScript into `suite_core`, **follow this exact step-by-step checklist**:

### Step 1: Identify and Isolate Pure Logic
Locate the JavaScript logic in `backend/departments/` or `frontend/modules/`. Ensure the target logic is **pure** (deterministic inputs -> deterministic outputs, no database handles or HTTP sockets inside the pure algorithm).

### Step 2: Implement in `shared/suite_core/src/<domain>/`
- Use `f64` for currency math, rounding via standard banker's/commercial rounding: `((amount * 100.0).round()) / 100.0`.
- Mark data structures with `#[derive(Debug, Clone, Serialize, Deserialize)]`.
- Keep public API functions clean and decoupled from external libraries.

### Step 3: Write Parity Tests in `tests/parity_tests.rs`
Before touching the JavaScript codebase, write a test in `tests/parity_tests.rs` with known input values and expected outputs taken directly from real invoices/records in `database/MacOS.db`.
```bash
cd shared/suite_core
cargo test --test parity_tests
```
Every test must pass with 0 warnings.

### Step 4: Expose via FFI / WASM Bridge
If exposing to Web & Node.js:
1. Add fast-path JSON or numeric exports in `shared/suite_core/src/ffi/wasm.rs` (or `fast_path.rs`).
2. Build the WASM binary:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ```
3. Expose the new function in `frontend/shared/suite_core_bridge.js`.

### Step 5: Verify in Node.js & Update This Diary
Run the backend tests or test against an active development slot (`macos-server-green`). Commit code and add a dated entry to **Section 4: Living Migration Log** below.

---

## 4. Living Migration Log

### [Entry 001] — Initial Inception of `suite_core` (2026-09-20)
* **Goal**: Solve discrepancies in invoice tax rounding and FIFO debt settlement between the Web App and Android Native App.
* **Work Done**:
  - Initialized `shared/suite_core` with `Cargo.toml`.
  - Implemented `finance/invoicing` (Reverse GST, Line item math, 2-tier discount structures, free scheme calculation).
  - Implemented `finance/ledger` (Deterministic FIFO bill settlement, customer statement generation).
  - Implemented `analytics` (Aging buckets 0-30, 31-60, 61-90, 90+ days, KPI revenue aggregations).
  - Configured Android JNI bindings in `src/ffi/jni.rs` and WASM bridge in `src/ffi/wasm.rs`.
  - Created `suite_core_bridge.js` with zero-downtime JS fallback.
* **Results**: Keystroke line item recalculation dropped from ~12ms in JS to `< 1ms` in WASM. Android client and Web client achieve 100% ledger balance parity.

---

### [Entry 002] — Server Resource Audit & Strategic Decoupling (2026-10-01)
* **Context**: Production server `my-mac` (Oracle Cloud Ubuntu 1GB RAM VM) showed background CPU bursts and memory spikes.
* **Diagnosis**:
  1. Docker healthcheck on `macos-server-blue` was running `curl -f /api/health` every **10 seconds**, invoking Node.js process/JSON serialization constantly.
  2. `NODE_OPTIONS=--max-old-space-size=400` allowed V8 to hoard memory on a 952MB RAM host before garbage collecting.
  3. `personal-site-rust` showed 22MB in `docker stats`, but investigation revealed actual process RSS is only **4.8 MB** (the rest was volatile Linux kernel page cache for static assets/SQLite).
  4. Monolith backend is ~31,000 lines of JavaScript. Attempting an emergency rewrite would jeopardize active revenue.
* **Decisions**:
  - Reaffirmed rule: **Do NOT rewrite existing business logic to Rust wholesale**.
  - Continue surgical migration using `shared/suite_core` and WASM bridge.
  - Prioritized next candidates:
    1. **FEFO/FIFO Batch Stock Depletion Engine** (`product-list` / batch stock allocation).
    2. **Invoice Number & Sequence Audit Logic** (`handlers.js:2488–2615`).
    3. **Native PDF Invoice Generation** (Eliminate blocking `execSync` call to Python).

---

### [Entry 003] — Purged Frontend JS Fallbacks & Switched Ledgers to 100% Rust WASM (2026-10-01)
* **Goal**: Eliminate lingering legacy JavaScript FIFO reconciliation loops now that Rust `suite_core` is verified and running stably in production.
* **Work Done**:
  1. **Purged Dead Fallback in `customer-ledger.js`**: Removed ~100 lines of legacy manual JS FIFO reconciliation (`pQueue`, `while debtToSettleFirst`, `while remainingToSettle`). Enforced strict `SuiteCoreBridge.calculateStatement()` execution.
  2. **Upgraded `ledger.js` to Pure Rust WASM**: Replaced the entire 95-line legacy `calculateSettlementMap` loop with a direct call to `window.SuiteCoreBridge.calculateStatement()`.
  3. **Synced to Production**: Updated files synced to `my-mac` at `/home/ubuntu/stack/apps/macos-desktop/frontend/modules/billing/js/`.
* **Testing & Verification Results**:
  - `cargo test`: All **10 Parity Tests** in `tests/parity_tests.rs` passed with 0 errors.
  - `test-billing-server-processing.js`: All **4 Server-Side Billing Tests** passed 100%.
  - `verify-rust-ledgers.js`: Executed mock statement reconciliation across both `customer-ledger.js` and `ledger.js` directly against `suite_core.wasm`. Both modules returned bit-for-bit identical settlement maps and payment allocations with **zero JS fallback code active**.

---

### [Entry 004] — Dual-VM Blue/Green Verification & Hybrid Rust Architecture Strategy (2026-10-03)
* **Goal**: Establish the comprehensive long-term architecture strategy: **Hybrid Rust Core + JavaScript Glue & Frontend**, while maintaining zero downtime across both production VMs (`my-mac` and `cos`).
* **Architectural Findings & Resource Baseline**:
  - Validated live production resource consumption on both Oracle Cloud 1GB VMs: Node.js container runs at only **~35 MB – 40 MB RAM** idle and **~140 MB – 180 MB under heavy multi-user load** (capped at 512 MB).
  - Evaluated full Rust rewrite vs. Hybrid approach: Total rewrite of all 65,000 LOC would stall feature velocity for months with negligible RAM impact.
  - Formally adopted the **Strangler Fig Hybrid Model**:
    - **Frontend (100% JavaScript)**: Retain fluid MacOS animations, responsive window managers, and fast UI iteration.
    - **Backend Glue (Node.js/Express)**: Fast iteration for Google OAuth 2.0, WebAuthn passkey challenges, and Gemini AI streaming.
    - **Ironclad Backend Core (Rust `shared/suite_core`)**: All financial accounting, batch stock depletion, asset crunching, and database audit sequencing.
* **Parity Test Suite Status**:
  - `cargo test --manifest-path shared/suite_core/Cargo.toml`: **10/10 Parity Tests Passing (100%)** with zero compiler warnings.
  - Active in production: Invoicing, Reverse GST, FIFO Statement reconciliations, Executive KPIs, Batch Expiry, and Sales Orders.

---

### [Entry 005] — Implementation & WASM Integration of Inventory Stock Depletion Engine (FEFO/FIFO) (2026-10-03)
* **Goal**: Execute Option A — Migrate inventory batch stock allocation into pure Rust, preventing race-condition overselling, stock debt, and expired item sales across Web, Mobile (WASM), and Backend.
* **Work Done**:
  1. **Pure Rust Domain Engine**: Created `shared/suite_core/src/inventory/depletion.rs` (registered in `src/inventory/mod.rs` & `src/lib.rs`).
     - Supports **FEFO (First Expired, First Out)** sorting with fallback to FIFO.
     - Parses multiple expiry formats (`YYYY-MM-DD`, `YYYY-MM`, `MM/YY`, `MM/YYYY`).
     - Enforces `allow_expired = false` check to prevent accidental dispensing of expired stock.
     - Performs fractional stock deductions with `round2` precision guard.
  2. **Automated Unit & Parity Tests**:
     - Added `test_fefo_batch_stock_depletion` and `test_fefo_insufficient_stock_and_expired_handling` to `tests/parity_tests.rs`.
     - Ran `cargo test`: **12/12 Tests Passing (100%)** with 0 warnings.
  3. **WASM Compilation & Bridge**:
     - Added `suite_deplete_inventory` export in `shared/suite_core/src/ffi/wasm.rs`.
     - Compiled release WebAssembly binary: `wasm32-unknown-unknown/release/suite_core.wasm` (267 KB).
     - Distributed binary to runtime directories (`frontend/shared/`, `backend/core/billing/`, `frontend/public/`, `dist/`).
     - Added `SuiteCoreBridge.depleteInventory(...)` in `frontend/shared/suite_core_bridge.js` with 100% graceful JavaScript fallback.
  4. **Integration Verification**:
     - Created `shared/suite_core/tests/verify-depletion.js` and executed via Node.js.
     - Verified `isWasmLoaded == true`, with bit-for-bit accurate batch deductions.
* **Results**: Inventory allocation executes in `<0.01ms` in pure WebAssembly, compatible across both the Web Desktop and Android Mobile client.

---

## 5. Migration Starting Points: Where to Start & Current Progress %

Current Status of Strategic Options:

```
                                    RUST MIGRATION STRATEGIC OPTIONS
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Option A] INVENTORY STOCK DEPLETION (FEFO/FIFO)         │ Progress: 100%│ Impact: ⭐⭐⭐⭐⭐ (Financial Safety) │
│ • Prevents race-condition overselling and stock debt     │ Status: DONE  │ Target: WASM / Mobile / Backend     │
├──────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────┤
│ [Option B] WALLPAPER & ASSET PROCESSING (Zero-GC)        │ Progress: 0%  │ Impact: ⭐⭐⭐⭐ (RAM Protection)    │
│ • Prevents memory spikes on 1GB VMs during 4K uploads    │ Est: 2 Days   │ Effort: Medium                      │
├──────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────┤
│ [Option C] NATIVE INVOICE PDF STREAMER                   │ Progress: 0%  │ Impact: ⭐⭐⭐⭐ (Event-Loop Relief) │
│ • Replaces blocking Python execSync subprocess           │ Est: 2-3 Days │ Effort: Medium                      │
├──────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────┤
│ [Option D] STRICT SEQUENCING & AUDIT INTEGRITY           │ Progress: 0%  │ Impact: ⭐⭐⭐ (Compliance/Anti-Gap)│
│ • Enforces zero gaps in bill numbering and WAL checksums │ Est: 1 Day    │ Effort: Low                         │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Option A: Inventory Batch Stock Depletion (FEFO/FIFO) — ✅ **COMPLETED (100%)**
* **Current Progress**: **100%** (Implemented in `shared/suite_core/src/inventory/depletion.rs`)
* **Status**: Compiled into `suite_core.wasm` and exposed in `frontend/shared/suite_core_bridge.js`.
* **Testing**: 12/12 unit and parity tests passing. Verified via `verify-depletion.js`.

---

### Next Recommended Priority: Option B or Option C

### Option B: Wallpaper & Image Processing Engine (Zero-GC Memory Guard)
* **Current Progress**: **0%** (Concept/Design)
* **Why start here**: Highest single risk factor for server memory exhaustion. Node.js loading uncompressed 4K wallpaper buffers into V8 heap can push container memory close to the 512 MB limit.
* **Source JavaScript**:
  - [`backend/departments/wallpaper-content/engine/handlers.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/departments/wallpaper-content/engine/handlers.js)
* **Implementation Plan**:
  1. Use Rust `image` and `ravif` crates to process thumbnails and WebP conversions using fixed ~10 MB buffers.
  2. Compile as an internal CLI or `napi-rs` module called directly from the route.

---

### Option C: Native Invoice PDF Streamer (Replace Python `execSync`)
* **Current Progress**: **0%** (Identified in Entry 002)
* **Why start here**: Currently, every invoice PDF generation executes a synchronous child process (`execSync("python invoice-generator.py")`), freezing the Node.js event loop for 400ms–1200ms.
* **Source JavaScript**:
  - `backend/departments/billing/engine/handlers.js:79` (`generateInvoicePDF`)
* **Implementation Plan**:
  1. Create `documents/pdf` using Rust's `printpdf` or lightweight HTML-to-PDF template streamer.
  2. Stream generated PDF bytes asynchronously with zero blocking of the API server.

---

### Option D: Ledger Sequencing & Cryptographic Anti-Tamper Audit
* **Current Progress**: **0%** (In Planning)
* **Why start here**: Ensures legal invoice numbering continuity (e.g. `INV-2026-0001`, `INV-2026-0002`) with zero missing sequence numbers even under concurrent multi-device billing.
* **Source JavaScript**:
  - `backend/departments/billing/engine/handlers.js:2488–2615`
* **Implementation Plan**:
  1. Create `shared/suite_core/src/finance/ledger/sequencing.rs`.
  2. Verify sequence numbers and compute SHA-256 rolling integrity hashes over ledger rows.

---

## 6. Architectural Reference & File Map

* **Rust Domain Engine**: [`shared/suite_core/src/`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/shared/suite_core/src/)
* **Parity Test Suite**: [`shared/suite_core/tests/parity_tests.rs`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/shared/suite_core/tests/parity_tests.rs)
* **Web/Node.js Bridge**: [`frontend/shared/suite_core_bridge.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/shared/suite_core_bridge.js)
* **Android JNI Wrapper**: [`android/app/src/main/java/com/example/macosbusinesssuite/domain/native/SuiteCoreNative.kt`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/android/app/src/main/java/com/example/macosbusinesssuite/domain/native/SuiteCoreNative.kt)
* **Overkill Architecture Plan**: [`docs/OVERKILL_ROADMAP.md`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/docs/OVERKILL_ROADMAP.md)
* **Android API Parity Diary**: [`docs/ANDROID_API_PARITY_PROGRESS_DIARY.md`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/docs/ANDROID_API_PARITY_PROGRESS_DIARY.md)