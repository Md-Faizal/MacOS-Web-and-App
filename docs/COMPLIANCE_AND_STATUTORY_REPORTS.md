# Ayurvedic Medicine Manufacturing Compliance & Statutory Reports Guide
**Enterprise Context:** Sole Proprietorship Ayurvedic Medicine Manufacturing Unit (Govt. of India / Dept. of AYUSH & GST CBIC)  
**Technical Core:** Pure Rust Vector PDF Engine (`shared/suite_core`) compiled to WebAssembly (`suite_core.wasm`) + SQLite (`database/MacOS.db`) + MacOS Desktop Analytics UI.

---

## 1. System Data Spectrum & Inventory

The repository splits data into three operational categories: **Active Commercial Data**, **Underused Database Fields**, and **Missing Manufacturing (Back-Half) Data**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   DATA SPECTRUM                                        │
├────────────────────────────────┬───────────────────────────┬───────────────────────────┤
│    ACTIVE (We Have & Use)      │  UNDERUSED (Have in DB)   │ MISSING (Back-Mfg Half)   │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ • Invoices (No, Date, Totals)  │ • Customer Drug Lic No    │ • Raw Herbs / Ingredients │
│ • Invoice Items (Qty, Tax, MRP)│ • Customer PAN            │ • Herb Quality Testing/CoA│
│ • Batches (Batch No, Mfg, Exp) │ • Product Classification  │ • Master Formula Record   │
│ • Contacts (Name, GSTIN, Addr) │ • Batch Initial Size      │ • Batch Mfg Record (BMR)  │
│ • Payments (Receipts, Credit)  │ • Delivery Order Stages   │ • Actual vs Theory Yield  │
│ • Customer Ledger (Dues)       │ • Exclude from stats flag │ • Retention Sample Locker │
│ • Enterprise License Settings  │ • Scheme/Free bonus field │ • Supplier Purchase Bills │
└────────────────────────────────┴───────────────────────────┴───────────────────────────┘
```

### A. Active Data (Currently Powering the Commercial Half)
* **`invoices`**: `invoice_no`, `invoice_date`, `created_at`, `total_amount`, `total_discount`, `total_gst`, `grand_total`. Forms the legally binding tax and financial baseline.
* **`invoice_items`**: `product_id`, `variant_id`, `batch_id`, `batch_no`, `pack_value`, `pack_type`, `qty`, `rate`, `mrp`, `gst_percent`, `cgst_amount`, `sgst_amount`, `final_amount`. Itemized breakdown for GST Table 12 and drug dispatch.
* **`batches`**: `batch_no`, `mfg_date`, `exp_date`, `mrp`, `units_sold`. Crucial for shelf-life, batch expiry, and drug recall traceability.
* **`contacts`**: `name`, `address`, `gstin`, `phone`, `type`. Establishes buyer identity (Wholesale Stockist vs. Retail Chemist vs. Clinic).
* **`payments`**: `payment_date`, `type` (`PAYMENT`, `CREDIT_NOTE`), `amount`, `credit_amount`, `reference_number`. Reconciles cash flow, bank transfers, and commercial returns/breakage credit notes.
* **`ledger`**: `current_due`, `total_debit`, `total_credit`. Real-time customer outstanding balances.
* **`app_settings`**: Enterprise company details, factory address, registered office, AYUSH Drug Manufacturing License No (`Form 25D/26D`), GSTIN, PAN, and contact numbers.

### B. Underused Data (Present in SQLite Schema, Needs Operational Discipline)
1. **`contacts.licence_no` (Retail/Wholesale Drug License Number)**:
   * *Status*: Often left blank when onboarding new clients.
   * *Compliance Value*: Schedule T GMP mandates recording buyer drug license numbers for all wholesale dispatches to guarantee drugs are supplied exclusively to authorized vendors.
2. **`products.classification`**:
   * *Status*: Inconsistently formatted.
   * *Compliance Value*: Must systematically differentiate **Classical Ayurvedic Medicines** (HSN `30039011`, e.g., Asavas, Arishtas, Churnas, Tailas) from **Patent/Proprietary Ayurvedic Medicines** (HSN `30049011`, e.g., proprietary syrups, capsules, liniments).
3. **`batches.units_sold` vs Initial Batch Production Size**:
   * *Status*: Database stores units sold, but lacks `batch_size_units` (how many total bottles/packs were packaged in that batch run).
   * *Compliance Value*: Needed to automatically compute remaining factory floor stock (`batch_size - units_sold`).

### C. Missing Data (The "Back-Half" Manufacturing Gap)
1. **Raw Herb & Raw Drug Inward Register**: Botanical herb arrivals, part used (root, bark, seed), batch numbers, moisture content, identity testing, and Supplier Certificate of Analysis (CoA) (Drugs & Cosmetics Act Schedule T Part I).
2. **Master Formula Records (MFR) & Batch Manufacturing Records (BMR)**: Standard batch formulation recipes, herb boiling/kwatha times, sandhana (fermentation) durations, heating logs, and filtration signatures (Schedule T Part II).
3. **Theoretical vs. Actual Yield & Wastage**: Raw material input weight vs. finished extracted liquid volume or churna powder yield percentage.
4. **Finished Product QC Release Register**: Physicochemical testing logs (Specific Gravity, Alcohol content % v/v for asavas, Total Solids, Heavy Metal safety limits).
5. **Retention Samples Locker**: Physical sample storage logs for batches retained until 1 year post-expiry (Rule 161B).
6. **Inward Supplies / Purchase Register**: Supplier bills for raw herbs, glass bottles, caps, and packaging to calculate Input Tax Credit (ITC) offset against outward GST liabilities.

---

## 2. Regulatory Alignment & Mapping

```
┌─────────────────────────────────┬───────────────────────────────┬──────────────────────────────────┐
│ REPORT NAME                     │ PRIMARY DATA CONSUMED         │ STATUTORY & BUSINESS PURPOSE     │
├─────────────────────────────────┼───────────────────────────────┼──────────────────────────────────┤
│ 1. AYUSH Distribution Register  │ invoices, items, batches,     │ Guarantees drug recall           │
│                                 │ contacts (license & town)     │ traceability under Schedule T    │
├─────────────────────────────────┼───────────────────────────────┼──────────────────────────────────┤
│ 2. GST Table 12 HSN Summary     │ invoice_items, products,      │ Formats outward supplies into    │
│                                 │ pack sizes, tax amounts       │ GSTR-1 Table 12 filing format    │
├─────────────────────────────────┼───────────────────────────────┼──────────────────────────────────┤
│ 3. GSTR-1 Outward Summary       │ invoices, contacts (GSTINs),  │ Reconciles B2B, B2C, and Credit  │
│                                 │ payments (credit notes)       │ Notes for monthly GST filing     │
├─────────────────────────────────┼───────────────────────────────┼──────────────────────────────────┤
│ 4. Batch Expiry Audit Register  │ batches, products, items      │ Enforces Rule 161B shelf-life    │
│                                 │ (sold quantities, exp dates)  │ and FEFO dispatch discipline     │
├─────────────────────────────────┼───────────────────────────────┼──────────────────────────────────┤
│ 5. Customer Ledger & Aging      │ invoices, payments, contacts, │ Manages sole prop cash flow and  │
│                                 │ ledger balances (Rust aging)  │ prevents distributor bad debts   │
└─────────────────────────────────┴───────────────────────────────┴──────────────────────────────────┘
```

---

## 3. Duration, Intervals & Legal Deadlines Calendar

| Report Name | Compliance Authority | Preparation Interval | Official Legal Due Date / Trigger | Consequences / Penalty of Non-Compliance |
|---|---|---|---|---|
| **1. Finished Goods Distribution Register** | **Dept. of AYUSH** (Drugs & Cosmetics Act 1940, Schedule T GMP) | **Monthly / Real-Time** per dispatch | **Inspection-Ready at all times**. Must be produced immediately during State Drug Inspector audits, Form 25D license renewal, or within **24 hours** in case of a product recall. | Suspension or cancellation of Drug Manufacturing License under Rule 85/159; notice of non-compliance under GMP. |
| **2. Table 12 HSN-Wise Summary** | **GST Council / CBIC** (CGST Rule 59) | **Monthly / Quarterly** | Part of GSTR-1. **11th of every month** (for monthly filers) or **13th of the month following the quarter** (under QRMP scheme). | GSTR-1 submission blocked; late fee of ₹50/day (₹20/day for nil return); portal mismatch notices. |
| **3. GSTR-1 Outward Supplies Summary** | **GST Council / CBIC** (CGST Section 37) | **Monthly / Quarterly** | **11th of subsequent month** (Monthly) or **13th post-quarter** (QRMP). Reconciles B2B GSTIN sales and Credit Notes. | Buyer's Input Tax Credit (ITC) blocked in GSTR-2B; buyer relationship strain; late fees up to ₹5,000/return. |
| **4. GSTR-3B Tax Liability Statement** | **GST Council / CBIC** (CGST Section 39) | **Monthly** | **20th of the following month** (e.g. May 20th for April sales). Determines net cash tax payable in Electronic Cash Ledger. | 18% per annum interest on unpaid tax; e-way bill generation blocked; bank account attachment under Sec 79. |
| **5. Batch Expiry & Retention Sample Register** | **Dept. of AYUSH** (Rule 161B & GMP) | **Quarterly / Annual** | **Quarterly Audit** for sales dispatch (FEFO); **Annual Audit** on March 31st for destruction of control samples retained past 1 year of expiry. | Selling near-expiry/expired medicines is a criminal offense under Sec 27 of Drugs & Cosmetics Act (imprisonment & heavy fines). |
| **6. Customer Outstanding Ledger & Dues Aging** | **Sole Proprietor Management** | **Weekly / Monthly** | Run before dispatching large wholesale distributor orders or approving new credit limits. | Working capital stagnation; unpaid debts; distributor insolvency risk. |
| **7. Daily Sales & Collection Register** | **Internal Cash Flow / Accounts** | **Daily Close** | Prepared every evening at counter closing (Bills cut vs. Cash / UPI / Cheques collected). | Cash leakage; unrecorded counter deficits; bank reconciliation mismatches. |

---

## 4. Real-World Operational Effort & Data Entry Frequency

To assess the additional effort required on the shop floor and billing counter:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        DATA ENTRY OPERATIONAL EFFORT PYRAMID                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  DAILY COUNTER / REAL-TIME   │ Invoicing, Qty, Rate, Payments  │ ~1-2 min per invoice  │
│  (High Frequency - Auto)     │ (Already standard billing)      │ Effort: Zero Addtl    │
├──────────────────────────────┼─────────────────────────────────┼───────────────────────┤
│  PERIODIC / BATCH RUNS       │ New Batches (Mfg, Exp, MRP)     │ ~2 min per batch      │
│  (Low Frequency - 2-4x/mo)   │ New Wholesale Contacts (Lic No) │ ~2 min per customer   │
├──────────────────────────────┼─────────────────────────────────┼───────────────────────┤
│  ONE-TIME SET & FORGET       │ Enterprise Settings (AYUSH, GST)│ ~15-20 min once       │
│  (Initial Setup / Annual)    │ Product Master, HSN, Base Packs │ Effort: One-time      │
└──────────────────────────────┴─────────────────────────────────┴───────────────────────┘
```

### Tier 1: One-Time Data (Set-and-Forget)
* **What to Enter**:
  * Enterprise Settings (`company_name`, factory address, AYUSH license number `Form 25D/26D`, GSTIN, PAN, Bank account, UPI ID).
  * Master Products Catalog (Product Name, Classical vs Proprietary classification, HSN Code `30039011` / `30049011`, Pack Sizes e.g. 450ml, 100g, Base MRP).
* **Interval**: Once during system onboarding. Updated only when a new formulation is licensed or every 5 years on license renewal.
* **Effort**: ~2 hours initial setup. **Zero daily effort**.

### Tier 2: Low-Frequency Recurring (Batch-by-Batch / Customer Onboarding)
* **What to Enter**:
  * **New Batch Record**: Whenever a production vessel completes bottling (e.g. 2 to 4 batches per month). Enter: Batch No (e.g., `DK-2026-04`), Manufacturing Date, Expiration Date (3-5 years as per Rule 161B), Pack MRP, and Batch Size.
  * **New Wholesale Customer**: Name, Delivery Address / Town, GSTIN, and Drug License Number (entered once per customer).
* **Interval**: 2 to 6 times per month.
* **Effort**: **~2 minutes per batch / customer**.

### Tier 3: High-Frequency Recurring (Daily Transactional Billing)
* **What to Enter**:
  * Selecting Customer from dropdown.
  * Selecting Product and Batch No.
  * Entering Quantity sold and payment medium (Cash, UPI, Credit).
* **Interval**: Daily counter activity.
* **Effort**: **Zero additional effort** — this is the existing billing flow. The system automatically extracts AYUSH traceability and GST Table 12 records behind the scenes.

---

## 5. Technical Implementation Blueprint

1. **Rust Core Vector Engine**:
   * Layout engine: [`shared/suite_core/src/documents/pdf/report_table.rs`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/shared/suite_core/src/documents/pdf/report_table.rs)
   * Compliance models: [`shared/suite_core/src/documents/pdf/compliance.rs`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/shared/suite_core/src/documents/pdf/compliance.rs)
   * Unit tests: [`shared/suite_core/tests/compliance_reports_test.rs`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/shared/suite_core/tests/compliance_reports_test.rs)
2. **WebAssembly Bridge**:
   * WASM exports in [`shared/suite_core/src/ffi/wasm.rs`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/shared/suite_core/src/ffi/wasm.rs)
   * Client bridge: [`frontend/shared/suite_core_bridge.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/shared/suite_core_bridge.js)
   * Deployed WASM assets: `frontend/public/suite_core.wasm`, `frontend/shared/suite_core.wasm`, `backend/core/billing/suite_core.wasm`.
3. **Backend API Endpoints**:
   * Express router: [`backend/departments/analytics/engine/routes.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/departments/analytics/engine/routes.js)
   * SQLite handlers: [`backend/departments/analytics/engine/handlers.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/departments/analytics/engine/handlers.js)
4. **MacOS Desktop UI**:
   * View engine: [`frontend/modules/analytics/js/compliance-reports.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/analytics/js/compliance-reports.js)
   * Styles: [`frontend/modules/analytics/css/compliance-reports.css`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/analytics/css/compliance-reports.css)
