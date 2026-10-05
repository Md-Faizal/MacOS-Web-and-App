# CORE 4 SYSTEM POLISH, REACTIVE EVOLUTION & ENTERPRISE ARCHITECTURE DIARY

**Repository**: `Md-Faizal/MacOS-Web-and-App`  
**Initiative**: System Cleanliness, Cross-App Instant Reactivity, Device Notifications & Enterprise Polish  
**Operating Principle**: *"Tackle one problem at a time until 100% satisfied, verify against live benchmarks, then advance to the next."*

---

## 1. Executive Master Roadmap (The 10 Pillars)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 THE 10 PILLARS OF ENTERPRISE EVOLUTION                                │
├────┬──────────────────────────────────────────────────────────┬──────────────┬────────────────────────┤
│ #  │ Pillar / Problem Focus                                   │ Status       │ Target Phase           │
├────┼──────────────────────────────────────────────────────────┼──────────────┼────────────────────────┤
│ 01 │ Console Log Spam Suppression & Production Gating         │ 🟢 COMPLETED │ Phase 1: Cleanliness   │
│ 02 │ Background API Throttling & Deduplication Caching        │ 🟢 COMPLETED │ Phase 2: Performance   │
│ 03 │ Reactive Cross-App UI Synchronization (Zero-Refresh)     │ 🟢 COMPLETED │ Phase 3: Reactivity    │
│ 04 │ Uniform On-Screen Glass & Native Device Notifications    │ 🟢 COMPLETED │ Phase 4: Notifications │
│ 05 │ Billion-Dollar Grade API & Architectural Documentation   │ 🟡 NEXT UP    │ Phase 5: Documentation │
│ 06 │ AI Camera OCR & Prescription Auto-Matching (Lazy DB)     │ ⚪ PENDING    │ Phase 6: AI Vision     │
│ 07 │ Pure Rust Vector PDF: Catalog, Payments & Credit Notes    │ ⚪ PENDING    │ Phase 7: Rust PDF V2   │
│ 08 │ Deep QR Code & Barcode Hardware Scanning Integration     │ ⚪ PENDING    │ Phase 8: Hardware/Ops  │
│ 09 │ Standard Compliance, GST & Business Intelligence Reports │ ⚪ PENDING    │ Phase 9: Reports & BI  │
│ 10 │ PayPal-Style Passkey & Biometric Touch ID Security       │ ⚪ PENDING    │ Phase 10: Passkey/Auth │
└────┴──────────────────────────────────────────────────────────┴──────────────┴────────────────────────┘
```

---

## 2. SITREP: Exact Total Backend & System LOC (Before vs After with %)

### A. GitHub Linguist Whole Repository Language Distribution

According to GitHub repository analysis, the active multi-platform codebase distribution is:

```
                         GITHUB REPOSITORY LANGUAGE COMPOSITION
┌───────────────────────────────────────┬──────────────┬─────────────────────────────────────────────────┐
│ Language                              │ Percentage   │ Scope & Primary Modules                         │
├───────────────────────────────────────┼──────────────┼─────────────────────────────────────────────────┤
│ JavaScript                            │ 54.7%        │ Backend Express API, Frontend WebApp, Core 4 UI │
│ Kotlin                                │ 20.2%        │ Native Android App (Tablet/Mobile POS)          │
│ CSS                                   │ 11.6%        │ macOS Liquid Glassmorphism & Responsive Themes  │
│ TypeScript                            │  6.9%        │ Zentra Analytics Dashboard & Shared Types       │
│ Rust                                  │  2.4%        │ Pure Native suite_core Engine (WASM + NDK JNI)  │
│ HTML                                  │  1.8%        │ Markup & Layout Templates                       │
│ Other                                 │  2.4%        │ Shell scripts, Docker, Python tools             │
├───────────────────────────────────────┼──────────────┼─────────────────────────────────────────────────┤
│ TOTAL REPOSITORY FOOTPRINT            │ 100.0%       │ Full-Stack Multi-Platform Enterprise Ecosystem  │
└───────────────────────────────────────┴──────────────┴─────────────────────────────────────────────────┘
```

### B. Backend & Core Compute Transformation Table

| Layer / Technology | Before Rust (`4e7b54b`) | % of Backend | Current State (`HEAD`) | % of Backend | Net Change & Rationale |
|---|---|---|---|---|---|
| **Backend JavaScript (`backend/**/*.js`)** | **20,613 lines** | 91.9% | **31,237 lines** | 81.2% | +10,624 lines (+51.5%) *(Enterprise handlers, audit, DB migrations, WASM hooks)* |
| **Shared Pure Rust Engine (`shared/suite_core`)** | **0 lines** | 0.0% | **5,357 lines** | 13.9% | **+5,357 lines (New)** *(4,545 src + 812 parity tests)* |
| **Python Tools (`tools/python`)** | **1,825 lines** | 8.1% | **1,850 lines** | 4.8% | Bypassed *(Invoice generation replaced by Rust WASM)* |
| **Total Active Backend Compute LOC** | **22,438 lines** | **100.0%** | **38,444 lines** | **100.0%** | **+16,006 lines (+71.3%)** |
| *Backend Seed & Schema JSON* | *0 lines (untracked)* | *—* | *27,594 lines* | *—* | *Production seed data & snapshots* |

### C. What Was Shifted to Rust (% of Critical Heavy Operations)

* **GST Invoice PDF Generation**: **100% offloaded to Rust** (down from ~800ms Python child processes $\rightarrow$ **6.75ms WASM**).
* **Pharmaceutical Fuzzy Search**: **100% offloaded to Rust** (Damerau-Levenshtein, multi-token bag, abbreviation $\rightarrow$ **<0.5ms**).
* **Inventory Stock Depletion**: **100% offloaded to Rust** (FEFO batch stock allocation).
* **Cryptographic Ledger Integrity**: **100% offloaded to Rust** (Paise-quantized FIPS 180-4 SHA-256 rolling hash chain).
* **Upload Image RAM Guard**: **100% offloaded to Rust** (zero-GC dimensions and header validation protecting 1GB VMs).

### D. Tangible Capabilities & Performance Gained

1. **GST Invoice PDF Generation Speed**:
   * *Before*: Python `reportlab` subprocess spawned via `execSync` $\rightarrow$ **~800ms** latency, freezing Node.js event-loop.
   * *After*: Pure Rust WASM vector PDF 1.4 canvas $\rightarrow$ **6.75ms** (verified on live invoice `GST-260021`). **120x speedup with zero event-loop lag**.
2. **Pharmaceutical Typo-Tolerant Search**:
   * *Before*: Fragile `.includes()` and SQL `LIKE '%term%'` $\rightarrow$ ~80-85% success; typos, omitted vowels, or inverted terms returned 0 results.
   * *After*: Damerau-Levenshtein, token bag, and consonant abbreviation matching in WASM $\rightarrow$ **100% typo tolerance in <0.5ms** in browser and ~5ms on server.
3. **RAM Guard for 1GB Oracle Cloud VMs (Wallpaper & Image Uploads)**:
   * *Before*: Node.js decoded full 4K bitmaps into V8 heap buffers, causing Out-Of-Memory (OOM) crashes.
   * *After*: Pure Rust zero-allocation header scanner extracts dimensions and SHA-256 in **<8ms with 0 MB bitmap allocation**.
4. **FEFO Inventory Depletion & Tamper-Proof Cryptographic Ledger**:
   * *Before*: Manual batch assignment in JavaScript with potential race conditions and no historical sequence verification.
   * *After*: Deterministic Paise-quantized FIFO debt settlement, FEFO stock depletion, and SHA-256 rolling ledger hash-chain audit.

---

## 3. MASTER EXECUTION BLUEPRINT FOR THE 10 PILLARS

---

### 🟢 PILLAR 01: Console Log Spam Suppression & Production Gating (COMPLETED)

#### Audit & Total Footprint:
* **Initial State**: ~380 un-gated `console.log` statements across 32 frontend modules and pages (`index.html`, `home.html`, `desktop.js`, `billing-app.js`, `new-bill.js`, `ledger.js`, `service-worker.js`, etc.).
* **Result**: **100% clean visual console** in production mode across all 380+ call sites, with zero console noise on login, boot, window dragging/resizing, or app switching.

#### Industrial Architecture Implemented:
1. **Enterprise Telemetry Engine (`frontend/shared/logger.js`)**:
   * **Circular In-Memory Ring Buffer (Flight Recorder)**: Stores the last 250 log breadcrumbs in memory with microsecond timestamps, subsystem scopes, and sanitized arguments.
   * **Production Console Gating**: Intercepts `console.log`, `console.info`, and `console.debug`. Silent by default in production.
   * **Zero Leakage of Real Issues**: `console.warn` and `console.error` are never muted. Uncaught exceptions and promise rejections automatically link to the flight recorder.
   * **Developer Ergonomics & Diagnostics Suite**:
     - `MacOS.enableDebug(['Scope'])`: Enables styled branded debug logging globally or by subsystem. Persists via `localStorage.macos_debug` or `?debug=true`.
     - `MacOS.disableDebug()`: Silences the console back to production quiet.
     - `MacOS.dumpLogs('scope')`: Renders an interactive DevTools table of recent breadcrumbs.
     - `MacOS.exportDiagnostics()`: Generates a complete system health snapshot (OS, platform, viewport, memory heap, user session, and last 100 breadcrumbs).
2. **Dual-Entry Bootstrap**:
   * Injected at the top of `<head>` in `frontend/index.html` and `frontend/home.html` before any other module or library executes.
3. **Decoupled Service Worker Telemetry (`frontend/public/service-worker.js`)**:
   * Scoped `swLog` gate (`DEBUG_SW = false`) preventing routine `CACHE HIT / MISS` logs from flooding the network console during regular asset caching.
   * Supports runtime telemetry toggle via `MACOS_SET_DEBUG` message bus.
4. **Hot-Loop Pruning**:
   * Removed hardcoded `|| true` in `desktop.js` (line 263) so 60 FPS window dragging and resizing avoids string allocations entirely.
   * Silenced startup loop listener attachments in `app-bar.js` and `launchpad.js`.
   * Gated raw customer data dumps in `ledger.js` and dependency checks in `home.html`.

5. **Complete Per-App & Per-Module Source-Level Refactor (31 Files)**:
   * Refactored all raw `console.log` statements directly in source files across all Core 4 apps (Desktop, Billing Suite [NewBill, EditBills, Ledger, Payments, Orders, History], Notes, Launchpad, Contacts, ProductList, Settings, Wallpaper, Screensaver, Dock).
   * Each module now uses its own scoped domain logger (`MacOSLogger.createScope('...')`), keeping the production console completely quiet while preserving microsecond breadcrumbs in the flight recorder.
   * Tahoe Portrait 4K 60fps H.264 FastStart transcoded, Rust video watchdog operational, and commands master cheat sheet persisted in `commands.txt`.

---

### 🟢 PILLAR 02: Background API Throttling & Deduplication Caching (COMPLETED)

#### Audit & Problem Definition:
* In `frontend/modules/billing/js/billing-app.js`, `ensureDataUpToDate()` was hooked into both `window.focus` and `document.visibilitychange` without debouncing or throttling.
* Whenever the user switched browser tabs or clicked in and out of the window, both events triggered back-to-back, firing bursts of 6 parallel requests (`/api/billing`, `/api/billing/invoices/payments`, `/api/contacts`, `/api/billing/orders`, `/api/products`, `/api/billing/ledger/customers`) without any in-flight request deduplication or read caching.

#### Architecture Implemented:
1. **In-Flight Request Deduplication Engine (`BillingAPI._inFlightRequests`)**:
   - Maintains an active Map of pending GET promises keyed by URL.
   - When multiple components or views (e.g. Ledger, Dashboard, search dropdown) request the same endpoint concurrently, only 1 network fetch is dispatched; all callers share the identical Promise.
   - Verified via unit test: 10 concurrent requests to `/billing` collapse into 1 single network fetch.
2. **Smart TTL Caching & SWR (`BillingAPI._cache`)**:
   - In-memory 15-second configurable cache (`DEFAULT_CACHE_TTL = 15000`) for all read endpoints.
   - Immediate cache hits prevent DOM flicker and eliminate redundant round-trips.
   - Supports explicit `{ forceRefresh: true }` when fresh data is strictly required.
3. **Automatic Cache Invalidation on Mutation**:
   - Any state-altering request (`POST`, `PUT`, `DELETE`, `PATCH`) automatically purges related cache entries (`/billing`, `/products`, `/contacts`, `/orders`) so subsequent reads always receive fresh server state.
4. **60-Second Cooldown Gate & 300ms Event Debounce**:
   - `ensureDataUpToDate()` now enforces a minimum 60-second cooldown (`COOLDOWN_MS = 60_000`) before background focus refresh is permitted.
   - Window `focus` and `visibilitychange` listeners are collapsed via a 300ms debounce timer to prevent double-firing.
5. **Deduplicated Global Data Fetching (`BillingApp._loadBillingDataPromise`)**:
   - `loadBillingDataFromAPI()` guards itself with an internal in-flight promise, ensuring that multiple caller views (e.g. Ledger interval sync and tab focus) share a single execution.
6. **Ledger Integration**:
   - Updated `ledger.js` to route `/api/billing/ledger/customers` through `BillingAPI.getLedgerCustomers()` rather than un-cached raw `fetch()`.

---

### 🟢 PILLAR 03: Reactive Cross-App UI Synchronization - Zero Refresh (COMPLETED)

#### Audit & Problem Definition:
* Previously, when a user created an invoice in Billing, or updated batch product stock in Product List, other open apps and views (Ledger, Analytics, Product List, Contacts) remained stale unless the user manually refreshed the browser.
* In `ledger.js`, an active `setInterval` blindly polled the server every 8 seconds (`startPolling(8000)`), causing redundant un-cached network fetches and UI jitter.

#### Architecture Implemented:
1. **Pure Rust WASM State Fingerprinting & ETag Generator (`shared/suite_core/src/sync/fingerprint.rs`)**:
   - High-speed FNV-1a 64-bit hashing algorithm executing in WebAssembly.
   - Calculates deterministic collection fingerprints: `compute_collection_fingerprint(domain, count, max_id, max_updated_at, checksum)` $\rightarrow$ `"W/f-<hex_count>-<hash>"`.
   - Exposes WASM export `suite_compute_fingerprint` to both Node.js server and browser frontend via `suite_core_bridge.js`.
   - Verified with unit and parity test suites (31 tests passing).
2. **Unified Real-Time `CoreDataBus` Engine (`frontend/shared/core-databus.js`)**:
   - **Cross-Tab Synchronization**: Native `BroadcastChannel('macos_core_databus')` with tab echo suppression (`tab_id`).
   - **Intra-Window Reactivity**: High-performance in-memory `EventTarget` for zero-allocation cross-component events.
   - **Multi-Device Server Stream**: Auto-reconnecting Server-Sent Events (SSE) client connected to `/api/billing/events`.
   - **State Fingerprint Invalidation**: `checkFingerprint(domain, currentEtag)` queries server with `If-None-Match`, getting instant `304 Not Modified` or cache invalidation payload.
3. **Backend Real-Time SSE & State Sync Service (`backend/core/sync/data-bus.js`)**:
   - SSE connection manager with 25-second heartbeat pings (`/api/billing/events`).
   - Pure Rust state fingerprinting and HTTP 304 validation (`/api/billing/sync/fingerprint`).
   - Multi-cast broadcasting helper `dataBus.broadcast(domain, action, payload)` integrated into invoice (`createBill`, `updateBill`, `deleteBill`) and payment (`createPayment`, `createCreditNote`) handlers.
4. **Core 4 Integration & Zero-Delay Reactivity**:
   - **Billing Ledger (`ledger.js`)**: Eliminated the 8-second blind polling loop. Replaced with instant reactive subscription to `billing:` domain events via `CoreDataBus` (`billing:invoice:created`, `billing:payment:created`, `billing:ledger:updated`), with an ultra-slow 60-second background heartbeat fallback. Unblocked active view guards so background ledger recalculation and totals update dynamically in-place when payments occur.
   - **Payment & Credit Note View (`payment-credit-note.js`)**:
     - Upgraded `recordPayment()` with **0ms optimistic local store updates** (immediately prepends payment to local cache and updates customer outstanding balances).
     - Fixed mutation cache bypass: explicitly calls `this.billingApp.api.invalidateCache('/billing')` on all payment creates, edits, credit notes, and deletes.
     - Dispatches `CoreDataBus.publish('billing:payment', ...)` and `CoreDataBus.publish('billing:ledger', 'updated', ...)` for instant multi-window synchronization.
   - **Elimination of Container Wiping & Keep-Alive Persistent Subviews (Industrial Standard Across Apps)**:
     - **Root Cause Identified**: Previous apps relied on `this.viewContainer.innerHTML = ''` destroying and recreating views on every tab change (`switchView`), causing visual flashes, scroll resetting, losing draft form inputs, and requiring "soft refreshes".
     - **Architectural Solution**: Implemented **Keep-Alive View Panels** (`_subviewPanels = new Map()`). Each view is mounted into its own persistent subview container (`<div class="subview-panel">`) and toggled via CSS (`display: none` / `flex`). Switching tabs is now **0ms instantaneous**, zero network latency, zero DOM destruction, zero flickering, and preserves all scroll positions and draft input states.
     - **Billing App (`billing-app.js`)**: Applied persistent subview layer across `ledger`, `existing`, `payment-credit`, and `reports`. Added centralized `CoreDataBus` subscription listening to `billing:`, `contacts:`, and `inventory:` events to keep background views fresh without user intervention.
     - **Product List App (`product-list.js`)**:
       - Applied persistent subview layer across `all`, `create`, `edit`, `categories`, and `inventory`.
       - Non-disruptive background updates: `loadProducts()` updates the product list without kicking the user off their active tab or clearing draft new product forms.
       - Variant and batch API mutations invalidate `/products` cache and broadcast `inventory:variant` and `inventory:batch`.
       - Category create/rename/delete operations invalidate `/categories` cache and broadcast `inventory:category`.
     - **Contacts App (`contacts.js`)**:
       - In-place Contact Card updating: when customer metrics change via background billing events, `renderContactCard()` updates the open contact card in-place.
       - Preserved scroll position in `renderContactsList()`: eliminated list jump-to-top on every background sync or search debounce.
       - Full bidirectional synchronization with `billing:` domain events for live sales and ledger balances.
     - **Analytics App (`analytics.js`)**:
       - Persistent subview panels across `dashboard`, `sales`, `comparative`, `orders`, `aging`, `products`, and `customer-profile`.
       - Eliminates redundant "Computing executive KPIs..." re-fetching and DOM wiping when navigating between BI reports.
     - **Notes App (`notes.js`)**:
       - Preserved scroll position in `renderNotesList()`, eliminating scroll jumping during typing, delta syncs, and SSE broadcasts.
   - **Dual-Entry Head Injection**: `<script src="/shared/core-databus.js"></script>` loaded immediately in `frontend/home.html` and `frontend/index.html`.

---

### 🟢 PILLAR 04: Uniform On-Screen Glass & Native Device Notifications (COMPLETED)

#### Audit & Total Footprint:
* **Initial State**: Divergent and conflicting notification mechanisms (`alert()` modals blocking JavaScript execution, custom ad-hoc DOM elements across `contacts.js`, `notes.js`, `product-list.js`, and `billing-app.js`, inconsistent styling, and zero notification visibility when browser tabs were backgrounded or minimized).
* **Result**: **100% unified macOS Sequoia/Sonoma glassmorphic notification center** (`MacOSNotificationManager`), with Web Audio API chime synthesis, HTML5 native OS desktop notification dispatching, auto-dismiss pause on hover, interactive close buttons, and automatic `CoreDataBus` event integration across all modules.

#### Industrial Architecture Implemented:
1. **Glassmorphic On-Screen Toast Stack (`frontend/shared/notifications.css`)**:
   - Fixed `#macos-notification-center` in top-right corner (`top: 38px; right: 16px; width: 340px`).
   - Native macOS Sonoma backdrop blur (`backdrop-filter: blur(28px) saturate(190%)`), hairline border (`rgba(255, 255, 255, 0.45)` light / `0.14` dark), 14px rounded corners, and elevation shadow.
   - Smooth 0.35s cubic-bezier entering spring animation and exit fade.
   - Stack management: limits visible stack to 5 toasts, gracefully dismissing older notifications.
   - Dynamic hairline duration countdown bar with hover-pause support.
   - App icon badge, app name header, relative timestamp (`now`), and interactive close button (`✕`).
2. **Crystal Web Audio API Acoustic Chimes (`frontend/shared/notifications.js`)**:
   - Synthesizes clean, pleasant dual-tone harmonic bells (`AudioContext` sine + triangle overtone shimmer) with zero network requests or audio file lag:
     - `info`: D5 (587.33 Hz) $\rightarrow$ A5 (880.00 Hz) classic macOS acoustic chime.
     - `success`: G5 (783.99 Hz) $\rightarrow$ C6 (1046.50 Hz) celebratory harmonic chime.
     - `warning`: E5 (659.25 Hz) $\rightarrow$ G5 (783.99 Hz).
     - `error`: A4 (440.00 Hz) $\rightarrow$ F4 (349.23 Hz) low gentle caution tone.
   - Audio preference toggle persisted in `localStorage` (`macos_notifications_sound`).
3. **HTML5 Native Device OS Notifications**:
   - Automatically detects when document is backgrounded (`document.hidden || !document.hasFocus()`).
   - Dispatches native Windows / macOS system desktop notifications via `new Notification(title, { body, icon, tag })`.
   - Clicking native OS notification focuses browser window (`window.focus()`) and triggers notification action callback.
4. **Automatic `CoreDataBus` Reactive Stream Listener**:
   - Subscribes to `window.CoreDataBus`:
     - `billing:invoice:created`: Dispatches "Bill Created" toast with invoice number and total amount.
     - `billing:payment:created`: Dispatches "Payment Received" toast with customer name and amount.
     - `inventory:product:created`: Dispatches "Product Added" toast with item name.
     - `contacts:customer:created`: Dispatches "Contact Saved" toast with customer profile name.
5. **Universal Global Facade (`window.showNotification`)**:
   - Backward-compatible wrapper normalizing all existing app calls:
     - `showNotification('Message', 'success')`
     - `showNotification('Title', 'Message', 'info')`
     - `showNotification({ title, message, type, app, icon, duration, actions, onClick })`
   - Fully integrated into `ProductListApp`, `ContactsApp`, `NotesApp`, and `BillingApp`.

#### Forensic Hardening & Reactivity Evolution (P0 Patches Applied):
* **BUG-01 & BUG-09 (`subscribeDomain` Signature & EventTarget Normalization)**:
  - Fixed API contract mismatch where `subscribeDomain` delivered `(type, payload, detail)` but subscribers expected `(data)` with `data.domain`, `data.action`.
  - Unified EventTarget dispatch with `core-data-domain` events matching BroadcastChannel and SSE ingress streams.
* **BUG-02, BUG-03 & Double Toast Elimination**:
  - Made `saveProductToAPI` a silent persistence helper; eliminated double toasts across batch creation, batch removal, product creation, and product editing.
  - Added origin deduplication in `notifications.js`: initiating tab displays immediate local feedback; secondary tabs/devices receive real-time glass toasts without duplicate rendering.
* **BUG-04 & BUG-05 (Silent Contacts CRUD & Semantic Titles)**:
  - Restored missing success notifications on contact create, update, and delete with full entity names (`"${name}" added to directory`, `"${name}" profile saved`).
  - Upgraded `showNotification` in `contacts.js` to support title, message, and type arguments.
* **BUG-07 & BUG-08 (Variant & Batch Notifications)**:
  - Added direct success feedback on standalone variant creation (`"${packSize} variant added"`), variant deletion, and batch operations.
* **BUG-10 & BUG-11 (Multi-Domain SSE Broadcast & Backend Invalidation)**:
  - Mounted unified `/api/events` SSE stream in `backend/main/macos-api-server.js`.
  - Added `dataBus.broadcast` to `products.js` and `contacts.js` handlers, delivering cross-tab/cross-device live synchronization without page reload.
* **BUG-12 (`MacOSReactiveStore` State Architecture)**:
  - Engineered proxy-based reactive singleton store (`frontend/shared/macos-store.js`) enabling sub-50ms optimistic state updates with automatic server reconciliation.

---

### ⚪ PILLAR 05: Billion-Dollar Grade API & Architecture Documentation

* Complete OpenAPI/TypeScript schemas, interactive sequence diagrams, and architecture maps covering:
  - MacOS WebApp frontend architecture & WASM bridge.
  - Zentra analytics multi-tenant dashboard.
  - Android Kotlin Native POS architecture & JNI boundaries.
  - Express backend departments, database schemas, and cryptographic ledger verification.

---

### ⚪ PILLAR 06: AI Camera OCR & Prescription Auto-Matching (Lazy DB)

* WebCam / Mobile camera prescription and invoice scanner.
* Pipe OCR text into pure-Rust `SuiteCoreBridge.searchCatalog` for closest DB product matching with confidence scoring and one-click cashier review.

---

### ⚪ PILLAR 07: Pure Rust Vector PDF Engine (Product Catalog, Payment Receipts & Credit Notes)

#### Executive Objective & Problem Definition:
* **Initial State**:
  - Invoices are generated at 6.75ms via pure Rust WASM (`suite_core/src/documents/pdf/invoice.rs`). However, **Wholesale Product Catalogs**, **Payment Receipts/Vouchers**, and **GST Credit Notes** still rely on inconsistent client-side HTML print dialogs, external PDF libs, or unstandardized layout templates.
  - Browser print stylesheets suffer from print dialog clipping, missing fonts, unpredictable page breaks, and zero thermal roll ESC/POS optimization.
  - Generating batch receipts or large catalogs via DOM canvas or Python microservices causes memory spikes and UI latency (300ms–1500ms).
* **Target Architecture**:
  - Unify **all** financial and inventory document generation under the zero-allocation, sub-10ms **Pure Rust Vector PDF 1.4 Engine** (`shared/suite_core/src/documents/pdf/`).
  - Native compilation to WebAssembly (browser frontend execution with instant client-side blob download) and native binary C ABI (Android NDK JNI + Node.js backend FFI).
  - Guaranteed sub-10ms compilation, vector font typography, deterministic millimeter-accurate layouts, and dual form factors (Standard A4 Corporate vs 80mm/58mm High-Density Thermal Receipt Roll).

---

#### 1. Payment Receipts & Multi-Invoice Reconciliation Vouchers

##### A. Purpose & Operational Scope:
* Provide instantaneous vector PDF generation for customer payment settlements, cash desk receipts, and formal bank transfer vouchers directly from the Billing App, Ledger, and Customer Profile screens.
* Eliminate paper receipt delays by allowing cashiers to trigger 80mm thermal roll printouts or multi-copy A4 official vouchers in `<8ms` with zero event-loop blockage.

##### B. Document Layouts & Form Factors:
1. **Thermal ESC/POS Roll (80mm / 72mm Printable Canvas Width)**:
   - **Target**: Point-of-Sale thermal receipt printers (Epson TM-T82, Star Micronics TSP100, Munbyn, TVS RP-3200).
   - **Layout Mechanics**: Dynamic vertical canvas sizing based on settled invoice count, 0mm horizontal margins, high-contrast monochrome vector glyphs, clear dashed divider lines (`----------------`), bold payment total banner, and centered FIPS 180-4 verification QR code at the footer.
2. **Corporate Standard A4 Formal Voucher**:
   - **Target**: Office laser/inkjet printers, WhatsApp/email digital statements, and corporate accounting archives.
   - **Layout Mechanics**: Dual-voucher layout option (Perforated split: "Original for Customer" top half, "Duplicate for Accounts" bottom half) or full A4 detailed statement featuring company letterhead, tax registry badges, multi-invoice FIFO settlement table, customer signature block, and authorized cashier seal.

##### C. Data Schema & Rust Structs (`shared/suite_core/src/documents/pdf/payment.rs`):
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentReceiptPayload {
    pub receipt_number: String,             // e.g., "REC-20261004-0042"
    pub payment_date: String,               // "DD-MM-YYYY" or ISO string
    pub payment_mode: String,               // "CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "NEFT_RTGS"
    pub reference_number: Option<String>,   // UTR, Cheque #, or Bank Transaction ID
    pub clearing_date: Option<String>,
    pub company: CompanyProfile,            // Name, GSTIN, Address, DL, Contact
    pub customer: CustomerProfile,          // ID, Name, Phone, Address, GSTIN, State Code
    pub amount_paid: f64,                   // Primary settlement figure
    pub opening_balance: f64,               // Customer outstanding before this receipt
    pub closing_balance: f64,               // Remaining customer outstanding after receipt
    pub invoice_allocations: Vec<InvoiceAllocationItem>, // Multi-invoice breakdown
    pub cashier_name: String,               // Authenticated operator
    pub notes: Option<String>,              // Custom voucher remarks
    pub ledger_hash: Option<String>,        // Cryptographic rolling chain SHA-256
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceAllocationItem {
    pub invoice_number: String,             // e.g., "GST-260021"
    pub invoice_date: String,               // Original bill date
    pub invoice_total: f64,                 // Grand total of the invoice
    pub previously_paid: f64,               // Sum paid prior to this transaction
    pub amount_applied: f64,                // Portion of current payment applied to this bill
    pub balance_remaining: f64,             // Due remaining on this specific invoice
}
```

##### D. Visual & Structural Architecture:
* **Header & Company Branding**: Top banner containing company trade name, registered pharmaceutical drug license numbers (20B/21B), GSTIN, corporate address, and receipt metadata block (Receipt No, Date, Time, Payment Channel).
* **Payment Mode & Settlement Summary**: Prominent styled pill/badge highlighting payment channel (e.g. `[ UPI / UTR: 4291880291 ]` or `[ CASH DESK ]`).
* **Multi-Invoice Settlement Matrix**: Tabular breakdown showing exactly how the cash/cheque was applied across open invoices (supporting partial settlements and credit offsets).
* **Indian Currency Words & Ledger Footprint**: Automated rendering of `amount_in_indian_words(amount_paid)` (e.g. *"Rupees Twelve Thousand Four Hundred Fifty Only"*).
* **Opening vs Closing Due Snapshot**: Visual delta callout:
  $$\text{Closing Balance} = \text{Opening Balance} - \text{Amount Paid}$$
* **Tamper-Proof Verification QR Code**: Vector QR code encoding:
  `MACOS-PAY|{receipt_number}|{customer_id}|{amount_paid}|{payment_date}|{ledger_hash}`
  Scannable via handheld camera to instantly locate and audit the record in Ledger.

---

#### 2. GST-Compliant Credit Notes & Balance Adjustment Vouchers

##### A. Legal & Regulatory Compliance (CGST Act Section 34):
* Under Indian GST law, credit notes issued to registered or unregistered buyers must strictly reference the original tax invoice, specify the statutory reason for issue, and separately detail taxable value and tax heads (CGST, SGST, IGST).
* The Rust Vector Engine guarantees full statutory compliance with zero schema divergence between the Node.js database, Kotlin Android POS, and Web UI.

##### B. Document Layouts & Form Factors:
1. **Standard A4 GST Tax Credit Memo**:
   - Formal border layout with high-contrast header: `CREDIT NOTE (Issued Under Section 34 of CGST Act)`.
   - Distinctive Crimson/Rose accent theme (`#991B1B` header banner) to immediately distinguish from regular Invoices (Navy) and Payment Receipts (Emerald).
   - Side-by-side Supplier and Recipient tax identification cards with state jurisdiction codes.
   - Original invoice linkage box prominently displayed directly beneath metadata.
2. **Thermal 80mm POS Return Receipt**:
   - Compact counter slip for customer returns, overcharge adjustments, or instant retail refunds.

##### C. Data Schema & Rust Structs (`shared/suite_core/src/documents/pdf/credit_note.rs`):
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditNotePayload {
    pub credit_note_number: String,         // e.g., "CN-2026-0012"
    pub credit_note_date: String,           // "DD-MM-YYYY"
    pub original_invoice_number: String,    // Linked Tax Bill: "GST-260018"
    pub original_invoice_date: String,      // Linked Bill Date
    pub reason_code: CreditReasonCode,      // Statutory reason enum
    pub reason_description: String,         // Detailed text explanation
    pub company: CompanyProfile,
    pub customer: CustomerProfile,
    pub items: Vec<CreditNoteItem>,          // Returned or discounted line items
    pub subtotal_taxable: f64,
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub igst_amount: f64,
    pub round_off: f64,
    pub total_credit_amount: f64,           // Final credit given to customer
    pub pre_credit_balance: f64,            // Customer ledger due before CN
    pub post_credit_balance: f64,           // Revised balance after credit credit adjustment
    pub cashier_name: String,
    pub digital_signature_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CreditReasonCode {
    SalesReturn,             // Goods returned due to damage, expiry, or excess order
    PostSaleDiscount,        // Volume rebate, rate revision, or festive concession
    DeficiencyInService,     // Short delivery or transit discrepancy
    InvoiceCorrection,       // Billing rate error or incorrect tax calculation
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditNoteItem {
    pub item_name: String,
    pub hsn_code: String,
    pub batch_no: String,
    pub exp_date: Option<String>,
    pub return_qty: f64,
    pub unit_rate: f64,
    pub discount_pct: f64,
    pub taxable_value: f64,
    pub gst_rate: f64,                      // e.g., 12.0 or 18.0
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub total_item_credit: f64,
}
```

##### D. Visual & Structural Architecture:
* **Statutory Heading & Reason Badge**: High-prominence header specifying original tax invoice reference (`Original Invoice: GST-260018 dated 28-09-2026`) and statutory reason badge (`[ Reason: 01 - Sales Return / Expiry ]`).
* **Returned Line-Item Grid**: Comprehensive table detailing batch number, expiry date, returned quantity, original invoice rate, and recalculated GST components.
* **GST Breakdown Box**: Itemized tax distribution table separating CGST, SGST, and IGST for seamless GSTR-1 credit matching.
* **Customer Account Adjustment Box**: Clear ledger accounting breakdown:
  - Outstanding Balance Before Credit Note
  - Total Credit Note Amount Applied (Credit to Customer Ledger)
  - Net Outstanding Balance Payable After Credit Note
* **Legal Declarations & Authorized Signatory**: Prescribed tax declaration certifying that output tax liability has been appropriately reversed in accordance with GST regulations.

---

#### 3. Wholesale Product Catalog & Inventory Valuation PDF

##### A. Operational Scope:
* Generate high-density, multi-page product lists, categorized wholesale price sheets, and real-time inventory valuation reports in `<10ms` from cached catalog data.
* Instant generation of distributor rate-cards for field sales representatives and warehouse pickers without server roundtrips.

##### B. Architecture & Rust Engine Features:
* **Multi-Page Pagination Engine**: Pure Rust vector pagination calculating precise row heights, orphan row prevention, running column headers across pages, and `"Page X of Y"` footers.
* **Categorized Groupings**: Dynamic sorting and header grouping by Category (e.g. Antibiotics, Analgesics, Cardiac, Pediatric) or Manufacturer.
* **Dual Export Modes**:
  1. **Customer Wholesale Catalog**: Displays Product Name, Salt Composition, Packing, HSN, MRP, and Wholesale Rate (excluding batch and stock quantities).
  2. **Internal Warehouse Valuation Report**: Includes FEFO Batches, Expiry status (color-coded flags for near-expiry), Available Stock Units, Purchase Cost, Total Inventory Valuation, and Potential Margin.

---

#### 4. Frontend & Backend Integration Architecture

##### A. WASM Bridge API (`shared/suite_core/suite_core_bridge.js`):
```javascript
// Instant client-side Vector PDF generation in WebAssembly:
const pdfBytes = await SuiteCoreBridge.generatePaymentReceiptPdf(paymentPayload, 'a4'); // or 'thermal_80mm'
const blobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));

// Open instant preview window or trigger silent thermal ESC/POS print
window.open(blobUrl, '_blank');
```

##### B. Seamless UI Integration in Core 4 Apps:
1. **Ledger App (`ledger.js`)**:
   - Each payment transaction card displays an instant `[ Print Receipt ]` and `[ Download PDF ]` action button.
   - Clicking immediately compiles the vector PDF in WASM (<8ms) without contacting the server, opening the macOS preview glass modal.
2. **Payment & Credit Note Screen (`payment-credit-note.js`)**:
   - On submitting a new Payment or Credit Note, a confirmation dialog appears with 1-click options: `[ Print 80mm Thermal ]` and `[ A4 Tax Voucher ]`.
3. **Product List App (`product-list.js`)**:
   - Export dropdown menu equipped with `[ Export Wholesale Catalog (PDF) ]` and `[ Export Inventory Valuation (PDF) ]`.

##### C. Performance & Reliability Benchmarks:
* **Generation Latency**: `< 8.5ms` for single-page Payment Receipts and Credit Notes; `< 25ms` for 20-page wholesale catalogs.
* **Payload Footprint**: Output PDF files are pure vector 1.4 streams averaging `~18 KB – 45 KB` (10x smaller than HTML-canvas or rasterized PDFs), rendering crisply at any zoom level.
* **Zero Dependencies**: 100% Rust WASM with zero headless Chromium/Puppeteer processes, zero Python `reportlab` subprocesses, and zero external binary dependencies.

---

### ⚪ PILLAR 08: Deep QR Code & Barcode Hardware Scanning Integration

* Instant USB/Bluetooth hardware barcode scanner capture + device camera video stream listener for instantaneous batch scanning in New Bill, New Order, and Stock Check.

---

### ⚪ PILLAR 09: Standard Compliance, GST & Business Intelligence Reports Engine (Analytics App)

#### Executive Objective & Problem Definition:
* **Initial State**:
  - The Analytics App (`frontend/modules/analytics/`) provides high-level executive sales charts, comparative revenue trends, product velocity KPIs, and customer aging. However, it lacks dedicated statutory **GST Tax Compliance Reports (GSTR-1, GSTR-3B, HSN Summaries)**, **Pharmaceutical Drug Regulatory Registers (Schedule H/H1, Expiry Risk Audits)**, and **Commercial Day-End Accounting Books (Daily Cash Drawer Reconciliation, Profit Margin Audits)**.
  - Businesses are currently forced to manually reconcile invoices or calculate tax liabilities in external spreadsheets, exposing them to GST audit penalties, miscalculated tax filings, drug licensing non-compliance, and inventory expiry write-off losses.
* **Target Architecture**:
  - Implement a dedicated **Compliance & Standard Reports Suite** mounted directly into the Analytics App (`modules/analytics/js/compliance-reports.js`) with persistent subview navigation (`_subviewPanels.get('compliance')`).
  - Offload heavy multi-thousand invoice aggregations, tax head distributions, and statutory registers to the pure Rust WASM engine (`shared/suite_core/src/analytics/compliance.rs`) for guaranteed `<15ms` execution.
  - Provide 1-click statutory export pipelines: **Official GST Offline Tool JSON Schema** (direct portal upload), **Vector PDF 1.4 Formal Landscape Audit Sheets**, and **Multi-Sheet Excel / CSV Workbooks**.

---

#### 1. Statutory GST Compliance & Tax Reporting Engine

##### A. GSTR-1 Outward Supplies Matrix (Statutory Filing Sheets):
* **B2B Registered Supplies (Table 4A, 4B, 4C, 6B, 6C)**:
  - Generates comprehensive registered invoice schedules: Recipient GSTIN, Trade Name, Invoice No, Invoice Date, Invoice Value, Place of Supply (POS with 2-digit state code), Reverse Charge indicator (`N`), Applicable Tax Rate %, Taxable Value, and Integrated/Central/State Tax amounts.
* **B2C Large Invoices (Table 5A, 5B)**:
  - Inter-state outward supplies to unregistered buyers where invoice value exceeds ₹2.5 Lakhs.
* **B2C Small Consolidated (Table 7)**:
  - Consolidated intra-state and inter-state supplies to unregistered customers, grouped automatically by Place of Supply (POS) and Tax Rate (0%, 5%, 12%, 18%, 28%).
* **CDNR Credit / Debit Notes Registered (Table 9B)**:
  - Schedule of registered credit notes and debit adjustments with mandatory original invoice linkage, statutory reason codes (`Sales Return`, `Post-Sale Discount`, etc.), and tax head adjustments.
* **HSN/SAC Summary of Outward Supplies (Table 12)**:
  - Deterministic aggregation of sold merchandise grouped by HSN Code: Description, Unit Quantity Code (UQC / e.g., `BOX`, `STRIP`, `BTL`), Total Quantity, Total Value, Total Taxable Value, CGST, SGST, IGST, and Cess.
* **Document Series Issued Register (Table 13)**:
  - Statutory accounting of serial numbering ranges: Invoices from `GST-260001` to `GST-260450` (Total count, cancelled count, net issued count).

##### B. GSTR-3B Monthly Tax Return & ITC Reconciliation:
* **Section 3.1 (Outward Taxable Supplies)**:
  - Total Taxable Turnover, Total Integrated Tax (IGST), Total Central Tax (CGST), Total State Tax (SGST), and Cess.
* **Section 4 (Eligible Input Tax Credit)**:
  - Input tax credit breakdown derived from purchase vouchers and distributor inward invoices.
* **Net Cash Tax Liability Calculator**:
  - Live computation of net tax payable after offsetting eligible ITC balance against output liability.

##### C. Government GST Portal Direct Export:
* Export compliant `.json` payload strictly formatted to the GSTN Offline Tool Schema v1.4, allowing accountants to upload reports directly to `gst.gov.in` without manual data entry.

---

#### 2. Pharmaceutical Drug Regulatory Compliance Registers

##### A. Schedule H & H1 Prescription Drug Sales Register:
* **Statutory Requirement**: Drugs and Cosmetics Act (Rule 65) mandates that wholesale distributors and retail pharmacies maintain an auditable register of all Schedule H and Schedule H1 drugs (antibiotics, anti-TB, psychotropics).
* **Data Fields Captured & Formatted**:
  - Transaction Date & Time
  - Patient / Customer Full Name and Contact Address
  - Registered Medical Practitioner (RMP / Doctor) Name, Clinic, and Medical Council Reg No
  - Drug Brand Name, Generic / Salt Composition, Pack Size
  - Manufacturer Name
  - Batch Number & Expiry Date (MM/YYYY)
  - Quantity Dispensed
  - Linked Tax Invoice Number (`GST-XXXXXX`)
* **Inspection-Ready Vector PDF**: Formatted in A4 landscape with formal legal certification text and signature slots for Chief Pharmacist and Drug Inspector audit.

##### B. Batch Expiry & Capital Risk Audit Register:
* **Real-Time Expiry Aging Buckets**:
  - `Expired (Immediate Quarantine)`: Stock past expiration date requiring instant removal from active bins.
  - `Critical (0 – 30 Days)`: Near-expiry inventory requiring emergency distributor return or price liquidation.
  - `Watchlist (31 – 60 Days)` & `Advance Notice (61 – 90 Days)`.
* **Capital Exposure Metrics**:
  - Total capital locked in near-expiry stock (valued at purchase cost vs realizable value).
  - Supplier/Distributor breakdown for batch return claims (credit note debit memos).

---

#### 3. Commercial Accounting, Day-End Books & Financial Audits

##### A. Daily Cash Drawer & Day-End Book Reconciliation (Z-Report):
* **Opening vs Closing Cash Balance**:
  - Cash brought forward + Cash collected from Invoices + Cash collected from Ledger settlements $-$ Cash paid out for expenses/refunds.
* **Physical Cash Variance Tracker**:
  - Counter cashier physical cash count input vs system calculated balance, highlighting surpluses or shortages (`+/- Variance`).
* **Digital Channel Breakdown**:
  - Split totals for UPI (PhonePe, GooglePay, Paytm, QR), Credit/Debit Cards, Bank IMPS/NEFT, and Cheques in clearing.
* **One-Click End-of-Day PDF Voucher**: Comprehensive closing summary for store management and bank cash deposit slips.

##### B. Customer Ledger Debt Aging Analysis (30 / 60 / 90 / 120+ Days):
* Multi-bucket debtor aging matrix classifying overdue receivables.
* Days Sales Outstanding (DSO) KPI calculation.
* High-risk customer flags based on payment velocity and overdue balance.

##### C. Gross Margin & Net Profitability BI Engine:
* Item-level, category-level, and manufacturer-level gross margin analysis:
  $$\text{Gross Margin \%} = \frac{\text{Taxable Sales Price} - \text{FEFO Batch Purchase Cost}}{\text{Taxable Sales Price}} \times 100$$
* Top 20 profit contributors vs high-volume low-margin loss-leaders (Pareto 80/20 analysis).

---

#### 4. Analytics App UI & Export Architecture (`frontend/modules/analytics/`)

##### A. Subview Integration & Ergonomics:
* New sidebar item: `[ 📋 Compliance & Reports ]` loaded into persistent subview map (`modules/analytics/js/compliance-reports.js`).
* Interactive Filter Toolbar:
  - **Date Range Presets**: `Today`, `Yesterday`, `This Month`, `Last Month`, `FY Q1`, `FY Q2`, `FY Q3`, `FY Q4`, and `Custom Range`.
  - **Category / HSN Filter**: Narrow down by therapeutic category or specific HSN code.
  - **Customer / GSTIN Search**: Instant filter by debtor or GST status.
* Live Stat Cards:
  - `Total Taxable Value`
  - `Total GST Output (CGST + SGST + IGST)`
  - `Schedule H1 Units Dispensed`
  - `Near-Expiry Risk Capital`
  - `Cash Drawer Net Balance`

##### B. Export Pipelines:
1. `[ 📥 Export GST JSON ]`: Government portal-ready JSON.
2. `[ 📄 Export Vector PDF ]`: High-density A4 Landscape vector PDF compiled in pure Rust WASM (<15ms).
3. `[ 📊 Export Excel / CSV ]`: Tabular CSV/XLSX download for CA and audit review.

---

### ⚪ PILLAR 10: PayPal-Style WebAuthn Passkeys & Biometric Touch ID Security

#### Executive Objective & Problem Definition:
* **Initial State**:
  - User authentication across the macOS WebApp, Zentra Dashboard, and Android POS currently relies on master passwords or shared PINs.
  - In fast-paced retail counter and pharmacy operations, cashiers either keep the terminal unlocked (security and audit vulnerability) or spend 5–10 seconds repeatedly retyping credentials during shift changes, high-value invoice approvals, and screen un-blanking.
  - Vulnerability to shoulder surfing, credential leakage, session hijacking, and inability to enforce biometric non-repudiation on high-risk commercial actions (large cash refunds, credit limit overrides, ledger balance adjustments, tax export downloads).
* **Target Architecture**:
  - Implement a **PayPal-grade WebAuthn / FIDO2 Passkey & Biometric Touch ID Architecture** delivering instant (<250ms), zero-password, phishing-resistant cryptographic authentication.
  - Native integration with platform authenticators: Apple Touch ID / Face ID (macOS Safari & Chrome on MacBook / Magic Keyboard), Windows Hello (fingerprint/facial biometric), and Android BiometricPrompt.
  - Seamless dual-mode UX inspired by PayPal:
    1. **Frictionless Biometric Login & Conditional Autofill UI**: Instant sign-in via platform passkey without typing passwords or usernames.
    2. **In-Flight Step-Up Biometric Authorization (Touch ID Glass Modal)**: Instant cryptographic touch verification for high-risk actions (credit notes, deletions, cash drawer opening, and financial reports).
  - Offload cryptographic attestation validation, clientDataJSON verification, and signature counter verification to the **Pure Rust WASM Engine** (`shared/suite_core/src/auth/passkey.rs`) for sub-millisecond, zero-allocation verification.

---

#### 1. W3C WebAuthn / FIDO2 Passkey Protocol & Cryptographic Architecture

##### A. Registration Flow (Credential Creation / Touch ID Enrollment):
1. **Server Challenge Generation (`POST /api/auth/webauthn/register/options`)**:
   - Backend generates a cryptographically secure 32-byte challenge (CSPRNG), scoped to Relying Party (`RP ID: window.location.hostname`, `RP Name: "MacOS Enterprise Suite"`).
   - Specifies `authenticatorSelection`:
     ```json
     {
       "authenticatorAttachment": "platform",
       "residentKey": "required",
       "requireResidentKey": true,
       "userVerification": "required"
     }
     ```
   - Specifies supported cryptographic public key algorithms: ES256 (ECDSA with P-256 curve, COSE `-7`), Ed25519 (EdDSA, COSE `-8`), and RS256 (COSE `-257`).
2. **Client Platform Biometric Invocation (`navigator.credentials.create`)**:
   - The browser invokes Apple Touch ID / Windows Hello securely at the OS hardware secure enclave level.
   - The device creates an asymmetric public-private keypair inside the hardware Secure Enclave / TPM chip; the private key never leaves the secure hardware element.
3. **Rust WASM Verification & Vault Storage (`POST /api/auth/webauthn/register/verify`)**:
   - Client returns `AuthenticatorAttestationResponse` (`attestationObject` and `clientDataJSON`).
   - Server or Pure Rust WASM validates challenge match, RP ID hash, user verification flags, and parses COSE public key.
   - Stores credential tuple: `(credentialId, publicKeyCOSE, signCount: 0, transports, aaguid, deviceName, createdAt)`.

##### B. Authentication Flow (Frictionless Touch ID Login):
1. **Challenge Request (`POST /api/auth/webauthn/login/options`)**:
   - Backend issues random 32-byte challenge and allowed credential IDs for the cashier/user.
2. **Biometric Assertion (`navigator.credentials.get`)**:
   - Browser prompts native macOS Touch ID sensor dialog: *"Touch ID to sign in to MacOS Enterprise Suite"*.
   - Platform authenticator signs the challenge and client data with the private key inside the Secure Enclave.
3. **Pure Rust Signature Verification (`shared/suite_core/src/auth/passkey.rs`)**:
   - Decodes clientDataJSON and authenticatorData (authenticator flags: UP [User Present] = 1, UV [User Verified] = 1).
   - Validates SHA-256 hash of client data matches original challenge.
   - Verifies digital signature against the stored COSE public key using Rust `ring` / `p256`.
   - **Replay & Clone Defense**: Enforces strict `new_sign_count > stored_sign_count`. If `sign_count` does not increment or rolls backwards, flags immediate authenticator clone attack and revokes session.

---

#### 2. PayPal-Style Frictionless UX & Conditional UI (Autofill)

##### A. WebAuthn Conditional Mediation (Autofill Passkeys):
* Following PayPal's signature UX pattern, the login page initializes `navigator.credentials.get({ mediation: 'conditional', ... })` on page mount.
* When the user clicks the username input field, the browser's native autocomplete dropdown displays their saved Touch ID Passkey alongside username suggestions.
* Selecting the passkey immediately prompts the native Touch ID fingerprint sensor, authenticating the user in a single tap without submitting any password form.

##### B. Native macOS Sonoma Glassmorphic Biometric Modal (`frontend/shared/biometrics.js`):
* For step-up actions or in-app cashier switching, a dedicated macOS glassmorphic biometric modal appears:
  - Frosted glass backdrop blur (`backdrop-filter: blur(32px) saturate(200%)`).
  - Fluid SVG Touch ID fingerprint icon with pulsating radiant glow rings.
  - State animations: Idle (subtle pulse) $\rightarrow$ Active Reading (radial scan sweep) $\rightarrow$ Verified (emerald green burst + harmonic chime) $\rightarrow$ Rejected (crimson shake + low caution tone).
  - Built-in fallback button: `[ Use Master Password / PIN ]` ensuring operators are never locked out if hardware biometrics are unavailable.

---

#### 3. Core 4 & Enterprise POS Operational Workflows

##### A. Sub-Second Cashier Shift Handover:
* In multi-operator environments (pharmacy cash counters, wholesale dispatch desks), cashiers switch active operators in `<250ms` simply by tapping the Touch ID sensor on the shared MacBook or terminal.
* The system instantly updates the active operator badge in Dock, App Bar, and Billing receipts without resetting ongoing customer carts or open tabs.

##### B. Step-Up Biometric Authorization for High-Risk Actions:
* Any operator triggering critical business mutations must verify identity via biometric touch:
  1. **Invoice Cancellation & Deletion**: Deleting or voiding an existing tax invoice (`billing:deleteBill`).
  2. **High-Value Credit Note Issuance**: Issuing credit notes exceeding authorized cashier limits.
  3. **Customer Credit Limit Overrides**: Overriding credit caps for delinquent debtors in Ledger.
  4. **Cash Drawer Physical Release**: Firing the 24V drawer kick pulse on POS thermal printers.
  5. **Tax & Financial Data Export**: Downloading GSTR-1 JSON or full customer audit databases.

##### C. macOS Lock Screen & Screensaver Instant Resume:
* Tight integration with `screensaver.js` and `home.html` lock screen:
  - When the screen locks after idle timeout, tapping the Touch ID sensor instantly restores the active workspace without requiring password re-entry.

---

#### 4. Data Schemas & Rust Implementation Architecture

##### A. Rust Data Structs (`shared/suite_core/src/auth/passkey.rs`):
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasskeyRegistrationOptions {
    pub challenge: String,                  // Base64URL-encoded 32-byte random challenge
    pub rp_id: String,                      // e.g., "macos-enterprise.internal"
    pub rp_name: String,                    // "MacOS Enterprise Suite"
    pub user_id: String,                    // Opaque internal UUID
    pub user_name: String,                  // Cashier / Operator username
    pub user_display_name: String,          // Full Employee Name
    pub timeout_ms: u32,                    // Standard 60,000ms
    pub attestation: String,                // "none" for privacy
    pub authenticator_attachment: String,   // "platform" (Touch ID / Windows Hello)
    pub user_verification: String,          // "required"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasskeyCredentialRecord {
    pub credential_id: String,              // Base64URL credential ID
    pub public_key_cose: Vec<u8>,           // Raw COSE public key bytes (P-256)
    pub sign_count: u32,                    // Replay protection counter
    pub aaguid: String,                     // Authenticator Attestation GUID
    pub device_name: String,                // e.g. "MacBook Pro Touch ID", "Windows Hello"
    pub created_at: String,
    pub last_used_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiometricStepUpRequest {
    pub operator_id: String,
    pub action_type: StepUpActionType,      // VoidInvoice, IssueCreditNote, ExportTaxData, OpenDrawer
    pub action_reference_id: String,        // e.g. "GST-260021"
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StepUpActionType {
    VoidInvoice,
    IssueCreditNote,
    OverrideCreditLimit,
    OpenCashDrawer,
    ExportStatutoryReports,
}
```

##### B. Frontend Client Facade (`frontend/shared/biometrics.js`):
```javascript
// Universal Biometric Touch ID Facade
window.MacOSBiometrics = {
  isAvailable: async () => {
    return window.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  },
  
  authenticate: async ({ reason, actionType, fallbackToPin = true }) => {
    // 1. Fetch challenge from /api/auth/webauthn/login/options
    // 2. Invoke navigator.credentials.get() with Touch ID prompt
    // 3. Verify assertion signature via Rust WASM / backend API
    // 4. Return { success: true, operatorId, timestamp }
  },
  
  registerPasskey: async ({ operatorId, deviceName }) => {
    // 1. Fetch registration options from /api/auth/webauthn/register/options
    // 2. Invoke navigator.credentials.create()
    // 3. Verify & store credential in database
  }
};
```

##### C. Cross-Platform Parity:
* **MacOS WebApp**: WebAuthn W3C API with native Touch ID sensor prompts in Safari, Chrome, and Edge on Apple Silicon / macOS.
* **Android POS App**: Kotlin Native `BiometricPrompt` with `CryptoObject` hardware key store integration.
* **Zentra Analytics Dashboard**: Multi-tenant admin passkeys ensuring zero-phishing access to executive financial metrics.

---

## 3.4 Core 4 Enterprise Reactivity & Lifecycle Hotfix (v1.36.1)

### A. Problem Statement & Root Cause Diagnosis
1. **Window Manager App ID Collision**: `app-bar.js` registered the Product List app as `'products'`, but `ProductListApp` constructor registered itself under `'product-list'`. On closing the window, the cleanup routine failed to match the registered key, leaving stale DOM state that required a double-click on subsequent launches.
2. **Premature Initial Empty State**: `ProductListApp.renderAllProducts()` executed synchronously in the constructor before the initial asynchronous API call completed, displaying a misleading *"No products yet"* message to the user.
3. **Deaf Event Domain Subscriptions**: `ProductListApp` was only listening for `inventory:` events, missing `products:variant`, `products:batch`, and `products:category` broadcasts from backend mutations.
4. **Billing Subview Activation Freezing**: `BillingApp.switchView()` kept subview panels alive to avoid DOM destruction, but only provided refresh hooks for `ledger` and `payment-credit`. Switching to `edit` (Edit Bills & Payments), `orders`, or `dashboard` left those panels permanently frozen.
5. **Dangling Memory Reference in Payments**: `payment-credit-note.js` copied `billingApp.billingData` during initialization. When `billingApp` replaced `this.billingData` with a fresh object after an API fetch, the payment module remained bound to the obsolete object.
6. **Ledger Disconnect on Tab Switch**: `LedgerView.stopPolling()` called `this._dataBusUnsub()`, completely severing the Ledger from real-time events whenever the user navigated to another tab. When returning to the Ledger, in-memory API caching caused diff engines to discard updates.
7. **Race Condition in Payment Deletion**: `deletePayment` initiated an optimistic fade animation and triggered an unawaited background fetch. Concurrently, `syncWithServer(true)` ran while the server was still processing the deletion, querying the old state and resurrecting the deleted card.

### B. Enterprise Engineering Solution
* **Synchronized Window Identifiers**: Standardized `appId: 'products'` across `app-bar.js`, `AppWindow.launchApp`, `ProductListApp`, and `close()` cleanup handlers. Added automatic live-window validation in `AppWindow.launchApp` to guarantee instant single-click launch.
* **Loading State Lifecycle**: Introduced `this.isLoading = true` in `ProductListApp`, presenting an Apple-style progress spinner until the catalog is fully hydrated from the API.
* **Shared Static API Cache Registry**: Upgraded `BillingAPI` with `static _sharedCache` and `static _sharedInFlightRequests`, reducing read TTL to 3000ms and ensuring that cache invalidations propagate across every domain and instance simultaneously.
* **Omnipresent Real-Time Subscriptions**: Retained `CoreDataBus` subscriptions permanently across the lifecycle of `LedgerView` and `PaymentCreditNote`.
* **Dynamic Property Bindings**: Converted `billingData` in `PaymentCreditNote` into dynamic getters and setters, ensuring live access to `billingApp.billingData`.
* **Awaited Optimistic Pipeline**: Restructured `deletePayment` and `recordPayment` into sequential, awaited operations that verify server execution before triggering full view synchronization.

---

## 3.5 The Master Problem Registry: Exhaustive Forensic Record of All Core 4 & System Polish Bugs (For Future Resolution)

This master registry serves as the definitive, immutable record of every observed, diagnosed, and latent problem across the **Core 4 Business Suite** (Product List, Billing App, Ledger, Payments & Credit Notes), the **Window Management Layer**, and the **Production Deployment & Asset Delivery Pipeline**.

Each problem is assigned a permanent identifier (`PRB-XXX`), full root-cause analysis, affected modules, reproduction conditions, and future resolution requirements.

---

### Category A: Product List & Window Management Subsystem

#### [PRB-001] Window Launch ID Mismatch Requiring Double-Click to Open
* **System Component**: [app-window.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/scripts/app-bar/modules/app-window.js), [app-bar.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/scripts/app-bar/app-bar.js), [product-list.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/product-list/js/product-list.js)
* **Observed Symptom**: Clicking the Product List icon in the Dock or App Bar does nothing on the first click; only the second click successfully mounts and opens the window.
* **Technical Root Cause**:
  1. `app-bar.js` registered the launch trigger with `appId: 'products'`.
  2. Inside `product-list.js`, the constructor initialized the window with `appId: 'product-list'`.
  3. When the user closed the window, `AppWindow.prototype.close()` looked for active instances under `'product-list'`, leaving the global instance map key `'products'` pointing to an orphaned, closed DOM node.
  4. The first subsequent click detected the lingering reference and executed cleanup; only the second click launched a new `AppWindow`.
* **Resolution Blueprint**: Enforce strict bidirectional key synchronization (`appId: 'products'` globally), ensure `AppWindow.launchApp` validates DOM presence before assuming an instance is active, and purge dangling window manager handles on teardown.

---

#### [PRB-002] Premature Catalog Hydration & Flickering "No products yet" Empty State
* **System Component**: [product-list.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/product-list/js/product-list.js)
* **Observed Symptom**: When the Product List app is opened, it immediately displays a giant "No products yet" placeholder screen for 0.5–2 seconds before products pop in, or it remains permanently stuck on the empty placeholder if network latency occurs.
* **Technical Root Cause**:
  1. The constructor called `this.switchView('all')` synchronously during instantiation.
  2. `this.renderAllProducts()` executed immediately against `this.products = []` before the asynchronous `this.api.getProducts()` network fetch completed.
  3. No loading indicator or skeleton was presented during the hydration window.
* **Resolution Blueprint**: Introduce `this.isLoading = true` with a macOS glassmorphic loading spinner or skeleton placeholder in `renderAllProducts()`, suppressing the "No products yet" state until `this.api.getProducts()` resolves.

---

#### [PRB-003] Product Catalog Stagnation without Complete App Closure & Reopening
* **System Component**: [product-list.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/product-list/js/product-list.js), [core-databus.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/shared/core-databus.js)
* **Observed Symptom**: Adding a new product, editing variants, or adding inventory batches does not update the open Product List table in real-time. The user is forced to quit the app entirely and relaunch it to see updated inventory.
* **Technical Root Cause**:
  1. `ProductListApp` initialized its internal catalog once during boot and did not trigger view re-renders upon mutation completion.
  2. The view container lacked dynamic diffing or store hydration hooks for in-place table updates.
* **Resolution Blueprint**: Connect the catalog table directly to `MacOSReactiveStore` and `CoreDataBus`, updating the in-memory array and issuing targeted DOM row insertions or selective re-renders without destroying view state.

---

#### [PRB-004] Duplicate Notification Toasts on Batch Creation
* **System Component**: [product-list.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/product-list/js/product-list.js), [notifications.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/shared/notifications.js)
* **Observed Symptom**: Whenever the user submits a new batch in Product List, two identical toast notifications appear in the top-right corner back-to-back.
* **Technical Root Cause**:
  1. The batch submission callback explicitly invoked `this.showNotification('Batch added successfully', 'success')`.
  2. Simultaneously, `saveProductToAPI()` or the background `CoreDataBus` event listener received the mutation broadcast and triggered a second `showNotification` call.
* **Resolution Blueprint**: Silence notifications inside lower-level data persistence utilities (`saveProductToAPI`), and implement tab/action origin deduplication in `notifications.js` using monotonic event transaction IDs (`txId`).

---

#### [PRB-005] Deaf Domain Event Subscriptions in Product List
* **System Component**: [product-list.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/product-list/js/product-list.js), [macos-api-server.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/main/macos-api-server.js)
* **Observed Symptom**: Mutations made in Billing (e.g. stock depletion on invoice creation) or multi-tab instances fail to reflect in Product List.
* **Technical Root Cause**:
  1. `ProductListApp` only subscribed to the `inventory:` domain (`CoreDataBus.subscribeDomain('inventory', ...)`).
  2. The backend Express API and Billing suite broadcast product changes under `products:product`, `products:variant`, `products:batch`, and `billing:invoice`.
  3. Because the domain strings differed, `ProductListApp` completely ignored all backend events.
* **Resolution Blueprint**: Register broad multi-domain subscriptions across `products:`, `inventory:`, and `billing:invoice`, and normalize event naming across frontend and backend.

---

#### [PRB-006] Destructive Subview Wiping (`innerHTML = ''`) Resetting Scroll & Inputs
* **System Component**: [product-list.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/product-list/js/product-list.js), [billing-app.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/billing-app.js)
* **Observed Symptom**: Switching tabs in Product List or Billing wipes all form inputs in progress, causes visual white/black flashes, and resets list scroll positions to the top.
* **Technical Root Cause**:
  1. `switchView()` implemented navigation by clearing the master container via `this.viewContainer.innerHTML = ''` and instantiating entire HTML trees from scratch.
* **Resolution Blueprint**: Implement **Keep-Alive View Panels** (`_subviewPanels = new Map()`). Mount each subview into a dedicated persistent panel (`<div class="subview-panel">`) and toggle visibility via CSS `display: none` / `flex`.

---

### Category B: Billing App Subviews & Tab Navigation Subsystem

#### [PRB-007] Subview Stagnation on Tab Switching (Requires App Reopen)
* **System Component**: [billing-app.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/billing-app.js)
* **Observed Symptom**: Navigating between Billing tabs (Ledger, Payment & Credit Note, Edit Bills & Payments, Orders, Dashboard) displays stale data from the initial app load. Recent transactions never appear until the app is closed and reopened.
* **Technical Root Cause**:
  1. Once a subview panel was mounted into `_subviewPanels`, subsequent clicks on navigation tabs only toggled `panel.style.display = 'block'`.
  2. No activation or hydration lifecycle hook (`onActivated()`, `refresh()`) was invoked on the subview instance.
* **Resolution Blueprint**: Implement a standardized `IActivatedView` interface. When `BillingApp.switchView(viewName)` activates a panel, automatically call `subviewInstance.onActivated()` or `subviewInstance.syncWithServer(true)` to re-hydrate the view.

---

#### [PRB-008] Frozen Subview Panels in Keep-Alive Mode (`edit`, `orders`, `dashboard`)
* **System Component**: [billing-app.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/billing-app.js)
* **Observed Symptom**: Changes to invoices or payments do not reflect in the "Edit Bills & Payments" or "Orders" screens when navigating back to them.
* **Technical Root Cause**:
  1. Previous refresh attempts only called `syncWithServer()` on `ledgerInstance` and `paymentCreditInstance`.
  2. The `edit`, `orders`, and `dashboard` views were excluded from lifecycle synchronization.
* **Resolution Blueprint**: Dispatch synchronization calls to all mounted subviews (`this._editBillsApp?.loadBills()`, `this._ordersApp?.loadOrders()`, `this._dashboardApp?.render()`) upon tab activation.

---

#### [PRB-009] Inconsistent Notification Wording & Missing Action Feedback
* **System Component**: [billing-app.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/billing-app.js), [new-bill.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/new-bill.js)
* **Observed Symptom**: Certain critical financial operations (e.g. credit note creation, bill deletion, background sync) finish with zero user feedback or display generic "Success" messages without identifiers.
* **Technical Root Cause**:
  1. Ad-hoc legacy calls mixed `alert()`, `console.log()`, and inline DOM text without standard notification dispatchers.
* **Resolution Blueprint**: Route 100% of feedback through `MacOSNotificationManager.showNotification()` with explicit entity titles, transaction amounts, and invoice IDs.

---

### Category C: Ledger Synchronization & Latency Subsystem

#### [PRB-010] 1–2 Minute Delay or Multiple Clicks Required for Payments to Reflect in Ledger
* **System Component**: [ledger.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/ledger.js), [billing-app.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/billing-app.js)
* **Observed Symptom**: When a payment is recorded in the Payments tab, navigating to the Ledger shows old balances. The new payment only appears after waiting 1–2 minutes or clicking the Ledger tab repeatedly.
* **Technical Root Cause**:
  1. Ledger was disconnected from real-time events while the user was on the Payments tab (see PRB-011).
  2. Returning to the Ledger ran `syncLedger()`, but `BillingAPI` served cached data from its 15-second cache.
  3. Ledger's diff algorithm compared the cached response with current state, found no changes, and discarded the render.
  4. The view only updated when the 60-second fallback polling interval finally made a fresh network request.
* **Resolution Blueprint**: Provide immediate optimistic transaction injection (`injectPaymentOptimistically`) on `billing:payment.created`, bypass the cache via `{ forceRefresh: true }` when switching to the Ledger tab, and keep the event listener alive permanently.

---

#### [PRB-011] Event Bus Severing on Tab Switch in Ledger
* **System Component**: [ledger.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/ledger.js)
* **Observed Symptom**: Ledger stops receiving all live financial updates the moment the user clicks another tab in the Billing suite.
* **Technical Root Cause**:
  1. In `ledger.js`, navigating away invoked `stopPolling()`.
  2. Inside `stopPolling()`, the code executed `if (this._dataBusUnsub) { this._dataBusUnsub(); this._dataBusUnsub = null; }`, killing the event subscription.
* **Resolution Blueprint**: Decouple interval timer polling from real-time event bus subscriptions. Move the `CoreDataBus` subscription into the constructor and never unsubscribe during routine tab switches.

---

#### [PRB-012] Blind Polling Overhead & Resource Drain
* **System Component**: [ledger.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/ledger.js)
* **Observed Symptom**: Background network tabs in browser DevTools showed high request frequency when Ledger was idle.
* **Technical Root Cause**:
  1. Ledger previously ran an unconditional 8-second polling timer (`setInterval(..., 8000)`) against `/api/billing/ledger/customers`.
* **Resolution Blueprint**: Replace high-frequency polling with event-driven reactive synchronization (`CoreDataBus` SSE / BroadcastChannel) and relax the heartbeat fallback to 60 seconds.

---

### Category D: Payment & Credit Note Lifecycle & Deletion Races

#### [PRB-013] Payment Deletion Ghost / Resurrection Bug
* **System Component**: [payment-credit-note.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/payment-credit-note.js), [edit-bills-payments.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/edit-bills-payments.js)
* **Observed Symptom**: When deleting a payment, it does not disappear immediately. It fades out and reappears, only truly disappearing after the app is closed and reopened.
* **Technical Root Cause**:
  1. `deletePayment()` applied an optimistic CSS fade-out and fired a `fetch(..., { method: 'DELETE' })` without awaiting its completion.
  2. Concurrently, it called `this.ledgerInstance.syncWithServer(true)`.
  3. The sync request reached the database before the DELETE query completed execution.
  4. The server returned the old payment record, which the sync logic re-rendered back into the DOM.
* **Resolution Blueprint**: Await the DELETE network request to completion, purge the local in-memory store immediately, invalidate all cache keys (`/billing`, `/ledger`), and only then invoke server synchronization.

---

#### [PRB-014] Dangling Memory Pointer to Stale `billingData`
* **System Component**: [payment-credit-note.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/payment-credit-note.js), [billing-app.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/billing/js/billing-app.js)
* **Observed Symptom**: Payments recorded or deleted in the payment subview fail to update customer balances displayed in the same view.
* **Technical Root Cause**:
  1. During initialization, `PaymentCreditNote` executed `this.billingData = billingApp.billingData`.
  2. When `BillingApp.loadBillingDataFromAPI()` fetched new data, it executed `this.billingData = { ...freshData }`.
  3. `PaymentCreditNote` remained bound to the original obsolete object in memory.
* **Resolution Blueprint**: Replace static property copying with a dynamic getter/setter:
  ```javascript
  get billingData() { return this.billingApp?.billingData || {}; }
  ```

---

### Category E: Cross-App Event Bus & Multi-Device Sync Subsystem

#### [PRB-015] Event Handler Signature Inconsistency in `subscribeDomain`
* **System Component**: [core-databus.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/shared/core-databus.js)
* **Observed Symptom**: Certain event subscribers threw runtime errors (`data is undefined`) or failed to react to incoming events.
* **Technical Root Cause**:
  1. `subscribeDomain` passed parameters as `callback(type, payload, detail)`.
  2. Other parts of the application passed a single payload object `callback(eventData)`.
* **Resolution Blueprint**: Standardize the event payload schema across all subscribers: `callback({ domain, action, payload, origin, txId })`.

---

#### [PRB-016] Backend SSE Multi-Cast Gaps
* **System Component**: [macos-api-server.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/main/macos-api-server.js), [data-bus.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/core/sync/data-bus.js)
* **Observed Symptom**: Changes made on one device (or the Android POS) do not update browser tabs on another computer.
* **Technical Root Cause**:
  1. Contact creation, category edits, and product stock adjustments updated SQLite directly without dispatching `dataBus.broadcast(...)`.
* **Resolution Blueprint**: Attach `dataBus.broadcast(domain, action, payload)` to all mutation routes in the backend Express API.

---

#### [PRB-017] Tab Echo Feedback Loops
* **System Component**: [core-databus.js](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/shared/core-databus.js)
* **Observed Symptom**: When an action occurs in Tab A, Tab A receives its own broadcasted event and re-fetches data it already holds.
* **Technical Root Cause**:
  1. `BroadcastChannel` messages were processed without verifying sender identity.
* **Resolution Blueprint**: Attach a unique `tabId = crypto.randomUUID()` to all outbound events; discard incoming events where `event.origin === this.tabId`.

---

### Category F: Production Asset Caching & Deployment Pipeline

#### [PRB-018] Hardcoded Stale Cache-Buster Parameters in `home.html`
* **System Component**: [home.html](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/home.html)
* **Observed Symptom**: User clears browser cache, yet the browser continues running outdated code.
* **Technical Root Cause**:
  1. Script tags in `home.html` contained static query parameters, e.g.:
     `<script type="module" src="/modules/product-list/js/product-list.js?v=20260904_v16"></script>`
  2. When source files changed, the query string remained `?v=20260904_v16`, causing Cloudflare and browser disk caches to serve stale bytecode.
* **Resolution Blueprint**: Automate cache-busting by injecting the active Git commit hash or `package.json` version dynamically during the deployment build process.

---

#### [PRB-019] Nginx Routing Configuration Bypass for `/modules/`
* **System Component**: `/etc/nginx/sites-enabled/*` on production server
* **Observed Symptom**: Static module files bypassed Nginx disk caching headers and were routed to Node.js with default cache policies.
* **Technical Root Cause**:
  1. Nginx had location rules for `/frontend/` and `/assets/`, but `/modules/` fell through to the catch-all proxy `location /`.
  2. Express served these files with `Cache-Control: public, max-age=0`, which permitted intermediary 304 caching based on stale ETags.
* **Resolution Blueprint**: Add explicit location blocks in Nginx for `/modules/` or enforce `Cache-Control: no-cache, no-store, must-revalidate` on all development and unbundled JavaScript modules.

---

#### [PRB-020] Docker Host Bind-Mount vs Container Build Version Drift
* **System Component**: [Dockerfile](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/Dockerfile), [docker-compose.yml](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/docker-compose.yml)
* **Observed Symptom**: Container metadata reported version `1.31.1` while host filesystem was running `1.36.1`.
* **Technical Root Cause**:
  1. Docker containers ran images built during earlier deploys, relying on host bind-mounts for `/app/frontend` and `/app/backend`.
  2. Any changes in dependencies, Node environment variables, or non-mounted paths remained frozen at the image build time.
* **Resolution Blueprint**: Rebuild production Docker containers with `--no-cache` upon minor and major releases, ensuring complete parity between image layer state and host volumes.

---

## 4. Continuity Instructions for the Next Step

> **Status & Current Focus**:
> 1. **Pillar 01 (Console Log Spam Suppression & Production Gating)** is **🟢 COMPLETED** (Full production gating, ring buffer flight recorder, and complete source-level refactor across all 31 modules).
> 2. **Pillar 02 (Background API Throttling & Deduplication Caching)** is **🟢 COMPLETED** (In-flight request deduplication, smart TTL read caching, automatic mutation cache invalidation, and 60-second focus cooldown gate).
> 3. **Pillar 03 (Reactive Cross-App UI Synchronization - Zero Refresh)** is **🟢 COMPLETED** (Pure Rust WASM state fingerprinting, tri-layer `CoreDataBus` [BroadcastChannel + EventTarget + SSE stream], keep-alive view panels, and ironclad zero-refresh synchronization across Billing, Ledger, Product List, Contacts, Notes, and Analytics - verified under v1.36.1).
> 4. **Pillar 04 (Uniform On-Screen Glass & Native Device Notifications)** is **🟢 COMPLETED** (Unified macOS Sonoma glassmorphic toast stack, Web Audio acoustic chimes, native OS desktop notifications when backgrounded, automatic `CoreDataBus` alerts, 100% notification consistency replacing all ad-hoc alerts/toasts across Billing, Orders, Payments, Ledger, Contacts, and Notes, with high-contrast light/dark mode optimization and mobile-responsive viewport scaling).
> 5. **Pillar 05 (Billion-Dollar Grade API & Architectural Documentation)** is **🟡 NEXT UP**.
> 6. Objective for Pillar 05: Construct complete OpenAPI/TypeScript interface contracts, interactive architectural sequence diagrams, and system blueprints across the WebApp, Native Android POS, and Rust compute layers.


