# CORE 4 SYSTEM POLISH, REACTIVE EVOLUTION & ENTERPRISE ARCHITECTURE DIARY

**Repository**: `Md-Faizal/MacOS-Web-and-App`  
**Initiative**: System Cleanliness, Cross-App Instant Reactivity, Device Notifications & Enterprise Polish  
**Operating Principle**: *"Tackle one problem at a time until 100% satisfied, verify against live benchmarks, then advance to the next."*

---

## 1. Executive Master Roadmap (The 8 Pillars)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 THE 8 PILLARS OF ENTERPRISE EVOLUTION                                 │
├────┬──────────────────────────────────────────────────────────┬──────────────┬────────────────────────┤
│ #  │ Pillar / Problem Focus                                   │ Status       │ Target Phase           │
├────┼──────────────────────────────────────────────────────────┼──────────────┼────────────────────────┤
│ 01 │ Console Log Spam Suppression & Production Gating         │ 🟡 IN PROGRESS│ Phase 1: Cleanliness   │
│ 02 │ Background API Throttling & Deduplication Caching        │ ⚪ PENDING    │ Phase 2: Performance   │
│ 03 │ Reactive Cross-App UI Synchronization (Zero-Refresh)     │ ⚪ PENDING    │ Phase 3: Reactivity    │
│ 04 │ Uniform On-Screen Glass & Native Device Notifications    │ ⚪ PENDING    │ Phase 4: Notifications │
│ 05 │ Billion-Dollar Grade API & Architectural Documentation   │ ⚪ PENDING    │ Phase 5: Documentation │
│ 06 │ AI Camera OCR & Prescription Auto-Matching (Lazy DB)     │ ⚪ PENDING    │ Phase 6: AI Vision     │
│ 07 │ Pure Rust Vector PDF Engine for Product List Catalog     │ ⚪ PENDING    │ Phase 7: Rust PDF V2   │
│ 08 │ Deep QR Code & Barcode Hardware Scanning Integration     │ ⚪ PENDING    │ Phase 8: Hardware/Ops  │
└────┴──────────────────────────────────────────────────────────┴──────────────┴────────────────────────┘
```

---

## 2. SITREP: Exact Total Backend & System LOC (Before vs After with %)

### A. Backend & Core Compute Transformation Table

| Layer / Technology | Before Rust (`4e7b54b`) | % of Backend | Current State (`HEAD`) | % of Backend | Net Change |
|---|---|---|---|---|---|
| **Backend JavaScript (`backend/**/*.js`)** | **20,613 lines** | 91.9% | **31,237 lines** | 81.2% | +10,624 lines (+51.5%) *(Enterprise handlers, audit, DB migrations, WASM hooks)* |
| **Shared Pure Rust Engine (`shared/suite_core`)** | **0 lines** | 0.0% | **5,357 lines** | 13.9% | **+5,357 lines (New)** *(4,545 src + 812 parity tests)* |
| **Python Tools (`tools/python`)** | **1,825 lines** | 8.1% | **1,850 lines** | 4.8% | Bypassed *(Invoice generation replaced by Rust WASM)* |
| **Total Active Backend Compute LOC** | **22,438 lines** | **100.0%** | **38,444 lines** | **100.0%** | **+16,006 lines (+71.3%)** |
| *Backend Seed & Schema JSON* | *0 lines (untracked)* | *—* | *27,594 lines* | *—* | *Production seed data & snapshots* |

### B. Whole System Repository Breakdown (Current State)

```
                            SYSTEM CODEBASE DISTRIBUTION (HEAD)
┌───────────────────────────────────────┬──────────────┬───────────────┬────────────────────────────────┐
│ Component / Platform                  │ Lines of Code│ % of Codebase │ Primary Technology             │
├───────────────────────────────────────┼──────────────┼───────────────┼────────────────────────────────┤
│ Frontend Web App (UI & Logic)         │ 114,264 lines│ 58.7%         │ Vanilla JS (70.9k), HTML/CSS   │
│ Android Native Mobile App             │  38,827 lines│ 20.0%         │ Kotlin, XML, JNI               │
│ Backend Server (API & Core Engine)    │  31,237 lines│ 16.0%         │ Node.js, Express, SQLite       │
│ Shared Suite Core (Native WASM/NDK)   │   5,357 lines│  2.8%         │ Pure Rust (no_std compatible)  │
│ Python Background Tools               │   1,850 lines│  1.0%         │ Python 3                       │
│ Technical Documentation & Diaries     │   7,040 lines│  3.6%         │ Markdown, Architecture Diaries │
├───────────────────────────────────────┼──────────────┼───────────────┼────────────────────────────────┤
│ TOTAL SYSTEM CODE (excl. seed/media)  │ 198,575 lines│ 100.0%        │ Full-Stack Enterprise Platform │
└───────────────────────────────────────┴──────────────┴───────────────┴────────────────────────────────┘
```

### C. What Was Shifted to Rust (% of Critical Heavy Operations)

* **GST Invoice PDF Generation**: **100% offloaded to Rust** (down from ~800ms Python child processes $\rightarrow$ **6.75ms WASM**).
* **Pharmaceutical Fuzzy Search**: **100% offloaded to Rust** (Damerau-Levenshtein, multi-token bag, abbreviation $\rightarrow$ **<0.5ms**).
* **Inventory Stock Depletion**: **100% offloaded to Rust** (FEFO batch stock allocation).
* **Cryptographic Ledger Integrity**: **100% offloaded to Rust** (Paise-quantized FIPS 180-4 SHA-256 rolling hash chain).
* **Upload Image RAM Guard**: **100% offloaded to Rust** (zero-GC dimensions and header validation protecting 1GB VMs).

### B. Tangible Capabilities & Performance Gained

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

## 3. Active Problem: Pillar 01 — Console Log Spam Suppression & Production Gating

### Symptom Analysis
The browser DevTools console is currently overwhelmed by:
1. `desktop.js:264 📐 Grid Size Calculation` fired 6–10 times on every resize or window focus.
2. `service-worker.js` logging `[SW] API Request: CACHE HIT` and `[SW] API cache updated` for every single resource.
3. `billing-app.js` logging repeated dependency checks and background focus checks.
4. `home.html` logging uncaught `ERR_CONNECTION_CLOSED` from absolute `https://mac.faizal.uk/api/auth/verify` background intervals.

### Target State
* Clean, silent, production-grade console.
* Only deliberate system lifecycle announcements and genuine application errors allowed.
* Configurable debug flag (`window.DEBUG_VERBOSE = false` by default).
