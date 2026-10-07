# PDF Rendering and VM Benchmark Handoff

**Prepared:** 2026-10-06  
**Purpose:** Continue this investigation in a new conversation, verify the active PDF renderers, and measure their resource use on the primary and backup OCI VMs.

## Start Here in the Next Conversation

Read this handoff first, then verify every implementation detail against the current source and deployment. The goal is to measure before recommending or switching renderers; this file contains no benchmark results and does not authorize a deployment or a load test against a live server.

The user refers to SSH aliases `my-mac` (primary) and `cos` (backup). Their actual hosts, roles, software versions, and whether either is production have **not** been verified. Use the user's existing SSH configuration; do not request, print, or record private keys, passwords, tokens, or `.env` contents.

## Current State: What Generates Each PDF

Source was inspected locally on 2026-10-06. These are source-verified current paths, not claims about what is currently deployed on either VM.

| Document | Active generation path | Rust status |
| --- | --- | --- |
| Styled product catalogue | Node.js calls Puppeteer, which starts/uses Chromium to render the submitted HTML and CSS. This is not the QR-label sheet. | Not Rust. |
| Product QR label sheet | The Product List API builds QR matrices and calls the SuiteCore Rust renderer through WebAssembly. | Rust/WASM is active for this separate monochrome label-sheet export. |
| Invoice | The billing handler invokes `SuiteCoreBridge.renderInvoicePdf` backed by compiled Rust `suite_core.wasm`. Supports multi-page continuation with cumulative calculations, duplex QR cards, and full vector background parity. | **Active in Rust/WASM**. Retired legacy `tools/python/invoice-generator.py`. |
| Payment | The billing handler invokes `SuiteCoreBridge.renderPaymentPdf` backed by compiled Rust `suite_core.wasm`. Minimalist, modern layout with real customer tax data and zero MARG ERP branding. | **Active in Rust/WASM**. Retired legacy `tools/python/payment-credit-note-generator.py`. |
| Credit note | The billing handler invokes `SuiteCoreBridge.renderPaymentPdf` backed by compiled Rust `suite_core.wasm`. Minimalist, modern layout with real customer tax data and zero MARG ERP branding. | **Active in Rust/WASM**. Retired legacy `tools/python/payment-credit-note-generator.py`. |

Payment, credit note, and opening balance voucher generation are fully migrated to native Rust WebAssembly (`SuiteCoreBridge.renderPaymentPdf`). All billing PDFs in the repository now run on pure Rust SuiteCore WASM with zero Python subprocesses.

Other entry points to verify:

- Styled catalogue route and HTML generation: [`product-list/engine/handlers.js`](../../backend/departments/product-list/engine/handlers.js), [`product-list/engine/routes.js`](../../backend/departments/product-list/engine/routes.js), and [`product-list.js`](../../frontend/modules/product-list/js/product-list.js).
- Puppeteer catalogue renderer: [`pdf-generator.js`](../../backend/core/products/pdf-generator.js).
- Invoice/payment/credit-note generation and PDF-to-image preview helpers: [`billing/engine/handlers.js`](../../backend/departments/billing/engine/handlers.js).
- Rust QR label renderer: [`catalog_labels.rs`](../../shared/suite_core/src/documents/pdf/catalog_labels.rs).

The styled catalogue relies on rich HTML/CSS and Odia-capable web fonts. Replacing Puppeteer with Rust could reduce browser-related memory overhead, but requires reproducing its layout and font behavior. It is not a safe drop-in renderer swap. ReportLab/Python is also a separate process today for billing PDFs; its actual resource cost must be measured rather than assumed.

## What to Measure

Measure each document type separately on each VM, comparing the existing renderer with a Rust candidate only after a candidate can produce that same document with correct content. Do not infer a performance win from the language or from a Rust unit test.

Record, for each run:

- Exact VM alias, hostname, date/time, application revision, Node/Python/Rust versions, and whether it is primary or backup (confirmed by the owner).
- Document scenario and input size: e.g. catalogue item count/pages; invoice line count and duplex mode; payment/credit-note type and page count.
- Wall-clock time per request (warm and first/cold run), then median and p95 over repeated sequential runs.
- Peak process RSS for the API and its renderer children, VM available memory before/during/after, CPU use, swap activity, and any OOM/restart symptoms.
- Result status, PDF byte size/page count, and content/layout checks. For invoices, verify both QR codes and duplex/non-duplex output. For catalogue, verify product/batch QR identity, Odia text, page breaks and visual appearance. For payment and credit notes, verify type, amounts, customer, and dates.
- Concurrency. Begin sequentially; only test concurrency with explicit approval and after single-request behavior is stable.

Report the measured time and memory separately. If useful, calculate percentage reduction as `(old - new) / old * 100`, separately for elapsed time and peak memory. A negative value means the candidate used more. Include raw values and sample counts; do not promise a single generalized “Rust improvement percentage.”

## Safe VM Test Procedure

1. **Confirm scope first.** Determine whether the aliases point to production, staging, or separate machines and which deployment/revision each runs. Check whether the user approves PDF generation and any repeated workload on those hosts. Do not deploy, restart services, change configuration, or run stress/concurrency tests as part of baseline collection.
2. **Take a read-only baseline on each host.** Example commands, run separately:

   ```sh
   ssh my-mac 'hostname; date -Is; uptime; free -h; vmstat 1 10; ps -eo pid,ppid,rss,%cpu,comm --sort=-rss | head -15'
   ssh cos 'hostname; date -Is; uptime; free -h; vmstat 1 10; ps -eo pid,ppid,rss,%cpu,comm --sort=-rss | head -15'
   ```

   These report basic system/process state; they do not by themselves measure a PDF request. Avoid commands that dump process environments, PM2 environment variables, config files, or secrets.
3. **Select representative, authorized records.** Prefer a staging VM or a safe test account/database copy. If only production data is available, obtain explicit approval and use normal authenticated UI/API flows without printing private details into logs or the handoff. Do not create or modify business records merely to benchmark.
4. **Measure one operation at a time.** Capture idle memory, trigger one normal PDF generation, sample the API and child-process RSS plus system available memory while it runs, and record latency/output. Repeat a small, fixed number of sequential runs after warm-up. Separate preview (which may also convert a PDF to JPG) from direct PDF export/print so conversion cost is not mistakenly attributed to PDF rendering.
5. **Repeat with comparable inputs.** Use the same app revision, VM, data, output mode, and document sizes for old-vs-candidate comparisons. Compare the primary and backup only after confirming their roles and configuration; do not assume they are identical.
6. **Validate correctness before calling a run successful.** Open/render PDFs and check page count, content, QR scanability, layout, and Unicode/Odia text as appropriate. A fast but incomplete PDF is a failed candidate.
7. **Stop if memory pressure appears.** On a 1 GB VM, do not begin parallel load tests. Stop the run and report if available memory collapses, swap rises sharply, the API restarts, or the kernel reports OOM. Do not install monitoring packages on a live host without approval.
8. **Only then decide whether to migrate.** Build and test each Rust renderer locally first, compare outputs against the existing PDF, then propose a canary/rollback plan. Keep the current generator available until correctness and resource tests pass. Any production rollout requires explicit user approval.

## Recommended Order of Work

1. Measure the current system and catalogue rendering first. Chromium/Puppeteer is the largest *suspected* memory opportunity, not a measured result.
2. Implement a Rust catalogue candidate only if the measured need justifies recreating the rich layout, page behavior, and Odia-capable typography. Compare visual output before switching.
3. Complete Rust invoice parity (including both QR panels, duplex and non-duplex, and all invoice content), then benchmark against the Python generator.
4. Treat payment and credit-note migration as a shared-generator task, but test both document types independently.
5. Keep server-side invoice numbering, tax/discount calculations, stock, and persistence authoritative. Browser WASM or Android-native Rust could technically render a PDF from supplied data, but the existing invoice Rust renderer is not an active offline invoice feature. The user currently does not want offline invoice generation because of data correctness; do not enable or implement it without a new explicit request. An offline document should not be treated as a finalized invoice unless the server validates and commits it.

## Local Validation References

Check current manifests/scripts before relying on commands. At this revision, relevant local checks include:

```powershell
npm run build
cargo test --manifest-path shared/suite_core/Cargo.toml --locked
node --check backend/departments/billing/engine/handlers.js
node --check backend/departments/product-list/engine/handlers.js
```

These do not measure VM resources or prove a deployed integration. Do not run a deploy or a production health check as a substitute for the benchmark.

## Handoff Result Template

For each of the four document types, report:

| Document/scenario | VM/revision | Renderer | Samples | Median / p95 time | Peak API+child RSS | Minimum available RAM | Output checks | Result |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Catalogue / ... | ... | ... | ... | ... | ... | ... | ... | ... |

End with measured percentage differences (time and peak memory separately), any correctness gaps, whether the primary/backup differed, and a recommendation. Clearly label missing measurements instead of estimating them.
