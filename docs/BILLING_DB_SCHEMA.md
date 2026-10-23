# MacOS Database Schema Documentation

**Database:** `MacOS.db`  
**Last Updated:** March 6, 2026  
**Type:** SQLite Database  
**Total Tables:** 14

---

## Table Directory

| # | Table Name | Purpose | Module |
|---|---|---|---|
| 1 | [contacts](#contacts) | Customer/Supplier information | Contacts App |
| 2 | [notes](#notes) | General notes and memos | Notes App |
| 3 | [status_checks](#status_checks) | System health monitoring | System Monitoring |
| 4 | [categories](#categories) | Product categorization | Products App |
| 5 | [products](#products) | Product master catalog | Products App |
| 6 | [variants](#variants) | Product variants (pack sizes) | Products App |
| 7 | [batches](#batches) | Batch tracking with inventory | Batches App |
| 8 | [invoices](#invoices) | Invoice records | Billing App |
| 9 | [invoice_items](#invoice_items) | Invoice line items | Billing App |
| 10 | [customer_item_memory](#customer_item_memory) | Customer product preferences | Billing App |
| 11 | [payments](#payments) | Payment & credit note records | Billing App |
| 12 | [ledger](#ledger) | Customer account tracking | Billing App |
| 13 | [orders](#orders) | 3-stage order management | Orders App |
| 14 | [order_items](#order_items) | Order line items | Orders App |

---

## Core Tables

### Contacts
**Purpose:** Stores customer and supplier information with contact details, identification numbers, sales metrics, and activity tracking  
**Module:** Contacts App  
**Relationships:** Referenced by orders, invoices, payments, ledger

```sql
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  gstin TEXT,
  licence_no TEXT,
  pan TEXT,
  total_sales REAL DEFAULT 0,
  avg_sales REAL DEFAULT 0,
  favorite_product_id INTEGER,
  opening_balance REAL DEFAULT 0,
  notes TEXT,
  transport_preference TEXT,
  type TEXT DEFAULT 'Customer',
  active TEXT DEFAULT 'INACTIVE',
  last_activity DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Key Fields:**
- `id` - Unique contact identifier
- `name` - Contact name (required)
- `email`, `phone`, `address` - Contact information
- `gstin`, `licence_no`, `pan` - Business identification
- `total_sales`, `avg_sales` - Sales metrics
- `favorite_product_id` - Reference to preferred product
- `opening_balance` - Starting ledger balance
- `type` - Customer or Supplier
- `active` - ACTIVE or INACTIVE status
- `last_activity` - Track engagement

**Indexes:**
- `idx_contacts_active` - Query by active status
- `idx_contacts_last_activity` - Sort by recent activity
- `idx_contacts_type` - Filter by contact type

---

### Notes
**Purpose:** Store general notes and memos for the application  
**Module:** Notes App  
**Relationships:** Standalone

```sql
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  images_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Key Fields:**
- `id` - Unique note identifier (UUID)
- `title` - Note title
- `content` - Note body text
- `images_json` - JSON array of attached images

---

### Status Checks
**Purpose:** Track system health monitoring and API/database check history  
**Module:** System Monitoring  
**Relationships:** Standalone

```sql
CREATE TABLE IF NOT EXISTS status_checks (
  id TEXT PRIMARY KEY,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  details TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Key Fields:**
- `id` - Unique check record identifier
- `check_type` - Type of check (database, api, service, etc.)
- `status` - Success/failure/warning result
- `response_time_ms` - Performance metric
- `details` - Error or additional information

**Indexes:**
- `idx_status_checks_type` - Query by check type
- `idx_status_checks_date` - Sort by check date

---

## Products & Inventory Tables

### Categories
**Purpose:** Store product categories for organization and classification  
**Module:** Products App  
**Relationships:** Referenced by products

```sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Key Fields:**
- `id` - Unique category identifier
- `name` - Category name (unique)

---

### Products
**Purpose:** Master product catalog with basic product information  
**Module:** Products App  
**Relationships:** References categories, referenced by variants, customer_item_memory

```sql
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  classification TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
)
```

**Key Fields:**
- `id` - Unique product identifier
- `name` - Product name
- `category_id` - Reference to category (required)
- `classification` - Product type/classification

**Indexes:**
- `idx_products_category` - Query by category

---

### Variants
**Purpose:** Store product variants with different pack sizes and types  
**Module:** Products App  
**Relationships:** References products, referenced by batches, invoice_items, order_items

```sql
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  pack_size_value TEXT NOT NULL,
  pack_size_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
)
```

**Key Fields:**
- `id` - Unique variant identifier
- `product_id` - Product reference (required)
- `pack_size_value` - Size value (e.g., "500")
- `pack_size_type` - Size unit (e.g., "g", "ml", "L")

**Indexes:**
- `idx_variants_product` - Query by product

---

### Batches
**Purpose:** Track product batches with manufacturing details, expiry dates, and pricing  
**Module:** Batches App  
**Relationships:** References variants, referenced by invoice_items, order_items

```sql
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL,
  batch_no TEXT NOT NULL,
  mrp REAL NOT NULL,
  mfg_date DATE,
  exp_date DATE,
  units_sold INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
  UNIQUE(variant_id, batch_no)
)
```

**Key Fields:**
- `id` - Unique batch identifier
- `variant_id` - Variant reference (required)
- `batch_no` - Batch number (unique per variant)
- `mrp` - Maximum Retail Price
- `mfg_date` - Manufacturing date
- `exp_date` - Expiration date
- `units_sold` - Inventory sold

**Indexes:**
- `idx_batches_variant` - Query by variant

---

## Billing Tables

### Invoices
**Purpose:** Store invoice records with billing information, totals, and payment tracking  
**Module:** Billing App  
**Relationships:** References contacts, referenced by invoice_items, ledger

```sql
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  invoice_no TEXT NOT NULL UNIQUE,
  due_date DATE,
  total_amount REAL DEFAULT 0,
  total_discount REAL DEFAULT 0,
  total_gst REAL DEFAULT 0,
  round_off REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  previous_due REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id)
)
```

**Key Fields:**
- `id` - Unique invoice identifier
- `customer_id` - Customer reference (required)
- `invoice_no` - Invoice number (unique)
- `due_date` - Payment due date
- `total_amount` - Sum of line items
- `total_discount` - Total discounts applied
- `total_gst` - Total GST amount
- `round_off` - Rounding adjustment
- `grand_total` - Final billing amount
- `previous_due` - Previous outstanding balance

**Indexes:**
- `idx_invoices_customer` - Query by customer

---

### Invoice Items
**Purpose:** Store line items for each invoice with complete discount and tax audit trail  
**Module:** Billing App  
**Relationships:** References invoices, products, variants, batches

```sql
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER,
  variant_id INTEGER,
  batch_id INTEGER,
  pack_value TEXT,
  pack_type TEXT,
  batch_no TEXT,
  exp_date DATE,
  qty INTEGER NOT NULL,
  scheme TEXT,
  free INTEGER DEFAULT 0,
  mrp REAL,
  rate REAL NOT NULL,
  amount REAL,
  discount_1_percent REAL DEFAULT 0,
  discount_1_amount REAL DEFAULT 0,
  discount_2_percent REAL DEFAULT 0,
  discount_2_amount REAL DEFAULT 0,
  gst_percent REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  sgst_amount REAL DEFAULT 0,
  cgst_amount REAL DEFAULT 0,
  final_amount REAL,
  gst_reverse INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
)
```

**Key Fields:**
- `invoice_id` - Invoice reference (required)
- `product_id`, `variant_id`, `batch_id` - Product detail references
- `qty`, `rate` - Quantity and unit price
- `discount_1_percent`, `discount_1_amount` - First discount level
- `discount_2_percent`, `discount_2_amount` - Second discount level
- `gst_percent`, `gst_amount` - GST/tax details
- `sgst_amount`, `cgst_amount` - State & Central GST (India)
- `final_amount` - Amount after discounts and tax
- `gst_reverse` - GST Reverse Charge indicator

**Indexes:**
- `idx_invoice_items_invoice` - Query by invoice
- `idx_invoice_items_batch` - Query by batch

---

### Estimates
**Purpose:** Persist quotations separately from invoices and accounting records
**Module:** Billing App
**Relationships:** Optional reference to contacts; product lines are stored as a JSON snapshot

Estimates can be listed, reopened, edited, exported, and deleted. Saving an estimate does not create invoice, ledger, inventory, or stock records. Conversion is explicit and goes through the existing bill or order workflow.

The authoritative schema is `backend/core/db/schema-master.js`. The table stores the estimate number, customer snapshot, dates, subject, product lines and terms, totals, and editor IDs. Registered customer IDs use `ON DELETE SET NULL` so deleting a contact does not delete the quotation.

Indexes:
- `idx_estimates_customer` - Query by registered customer
- `idx_estimates_date` - Sort/filter by estimate date

---

### Customer Item Memory
**Purpose:** Store customer product preferences and discount history for quick recall  
**Module:** Billing App  
**Relationships:** References contacts, products (unique combination)

```sql
CREATE TABLE IF NOT EXISTS customer_item_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  discount_1 REAL DEFAULT 0,
  discount_2 REAL DEFAULT 0,
  scheme TEXT,
  tax_percent REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE(customer_id, product_id)
)
```

**Key Fields:**
- `customer_id` - Customer reference
- `product_id` - Product reference
- `discount_1`, `discount_2` - Preferred discount levels
- `scheme` - Preferred pricing scheme
- `tax_percent` - Preferred tax rate
- **Unique Constraint:** Only one preference per customer-product pair

---

### Payments
**Purpose:** Record both payments received and credit notes issued  
**Module:** Billing App  
**Relationships:** References contacts

```sql
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('PAYMENT', 'CREDIT_NOTE')),
  amount REAL,
  credit_amount REAL,
  reason TEXT,
  payment_medium TEXT,
  reference_number TEXT,
  payment_date DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id)
)
```

**Key Fields:**
- `customer_id` - Customer reference
- `type` - PAYMENT or CREDIT_NOTE (checked)
- `amount` - Payment amount
- `credit_amount` - Credit note amount
- `payment_medium` - Cash/UPI/Cheque/Card/etc
- `reason` - Reason for payment or credit
- `reference_number` - Transaction reference

**Indexes:**
- `idx_payments_customer` - Query by customer

---

### Ledger
**Purpose:** Maintain customer account summary with aggregated totals and balance tracking  
**Module:** Billing App  
**Relationships:** References contacts

```sql
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  current_due REAL DEFAULT 0,
  total_debit REAL DEFAULT 0,
  total_credit REAL DEFAULT 0,
  current_status TEXT DEFAULT 'PENDING',
  total_bills INTEGER DEFAULT 0,
  total_payments INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id)
)
```

**Key Fields:**
- `customer_id` - Customer reference
- `current_due` - Current outstanding amount
- `total_debit` - Total debit amount
- `total_credit` - Total credit amount
- `current_status` - PENDING/SETTLED/OVERDUE
- `total_bills` - Count of invoices
- `total_payments` - Count of payments

**Indexes:**
- `idx_ledger_customer` - Query by customer

---

## Orders Management Tables

### Orders
**Purpose:** Store customer orders with 3-stage tracking (entry → QC → delivery)  
**Module:** Orders App  
**Relationships:** References contacts, referenced by order_items

```sql
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  current_stage TEXT DEFAULT 'stage1',
  order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  order_notes TEXT,
  qc_date DATETIME,
  qc_notes TEXT,
  checklist_items TEXT,
  delivery_date DATETIME,
  bill_reference TEXT,
  total_amount REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id)
)
```

**Key Fields:**
- `order_number` - Unique order reference (unique)
- `customer_id` - Customer reference
- `current_stage` - stage1 (entry) → stage2 (QC) → stage3 (delivery)
- `order_date` - When order was placed
- `order_notes` - Order creation comments
- `qc_date` - Quality check date
- `qc_notes` - QC findings
- `checklist_items` - QC checklist (JSON)
- `delivery_date` - Delivery date
- `bill_reference` - Linked invoice number
- `total_amount` - Order total value

**Indexes:**
- `idx_orders_customer` - Query by customer
- `idx_orders_stage` - Query by current stage

---

### Order Items
**Purpose:** Store line items for each order with fulfillment tracking  
**Module:** Orders App  
**Relationships:** References orders, products, variants, batches

```sql
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  variant_id INTEGER,
  batch_id INTEGER,
  quantity INTEGER NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
)
```

**Key Fields:**
- `order_id` - Order reference
- `product_id`, `variant_id`, `batch_id` - Product details
- `quantity` - Quantity ordered
- `received_quantity` - Quantity received/fulfilled
- `unit_price` - Price per unit
- `line_total` - quantity × unit_price

**Indexes:**
- `idx_order_items_order` - Query by order
- `idx_order_items_batch` - Query by batch

---

## Data Relationships

### Complete Relationship Map

```
CONTACTS (Customer Master)
├── favorite_product_id → PRODUCTS
├── invoices (1-to-many)
│   └── invoice_items
│       ├── product_id → PRODUCTS
│       ├── variant_id → VARIANTS
│       └── batch_id → BATCHES
├── orders (1-to-many)
│   └── order_items
│       ├── product_id → PRODUCTS
│       ├── variant_id → VARIANTS
│       └── batch_id → BATCHES
├── payments (1-to-many)
├── ledger (1-to-1)
└── customer_item_memory (1-to-many)
    └── product_id → PRODUCTS

CATEGORIES
└── products (1-to-many)

PRODUCTS
└── variants (1-to-many)

VARIANTS
└── batches (1-to-many)

NOTES (Standalone)
STATUS_CHECKS (Standalone)
```

---

## Data Flow

### Invoice Workflow
1. **Order Entry** → Order created with line items
2. **Order QC** → Quality check performed, marked as stage2
3. **Order Delivery** → Delivery confirmed, marked as stage3
4. **Invoice Creation** → Invoice generated from order/direct entry
5. **Payment** → Payment received or credit note issued
6. **Ledger Update** → Customer balance updated

### Batches Workflow
1. **Batch Creation** → New batch added to variant
2. **Batch Storage** → Track manufacturing & expiry dates
3. **Batch Usage** → Referenced in invoices/orders
4. **Batch Expiry** → Track units_sold vs batch quantity

---

## Key Constraints

### Foreign Key Constraints
- All relationships enforced with `ON DELETE CASCADE` for data integrity
- Child records automatically deleted when parent is deleted

### Unique Constraints
- `categories(name)` - One category name per row
- `invoices(invoice_no)` - One invoice number per row
- `orders(order_number)` - One order number per row
- `batches(variant_id, batch_no)` - One batch number per variant
- `customer_item_memory(customer_id, product_id)` - One preference per customer-product pair

### Check Constraints
- `contacts(active)` IN ('ACTIVE', 'INACTIVE')
- `payments(type)` IN ('PAYMENT', 'CREDIT_NOTE')

### Timestamps
- `created_at` - Record creation time (auto-set)
- `updated_at` - Last modification time (auto-set)

---

## Performance Indexes

**Total Indexes:** 17

| Index | Table | Purpose |
|---|---|---|
| idx_contacts_active | contacts | Filter by active status |
| idx_contacts_last_activity | contacts | Sort by recent activity |
| idx_contacts_type | contacts | Filter by customer/supplier type |
| idx_products_category | products | Query products by category |
| idx_variants_product | variants | Query variants by product |
| idx_batches_variant | batches | Query batches by variant |
| idx_invoices_customer | invoices | Query invoices by customer |
| idx_invoice_items_invoice | invoice_items | Query items by invoice |
| idx_invoice_items_batch | invoice_items | Query items by batch |
| idx_payments_customer | payments | Query payments by customer |
| idx_ledger_customer | ledger | Query ledger by customer |
| idx_orders_customer | orders | Query orders by customer |
| idx_orders_stage | orders | Filter orders by current stage |
| idx_order_items_order | order_items | Query items by order |
| idx_order_items_batch | order_items | Query items by batch |
| idx_status_checks_type | status_checks | Query checks by type |
| idx_status_checks_date | status_checks | Sort checks by date |

---

## Database Statistics

- **Total Tables:** 14
- **Total Columns:** 157
- **Total Indexes:** 17
- **Foreign Key Relationships:** 18
- **Unique Constraints:** 5
- **Check Constraints:** 2

---

## Notes

- Database uses SQLite3 with foreign key constraints enabled
- All timestamps in UTC format
- Decimal values use REAL type for financial calculations
- JSON fields use TEXT storage with application-level parsing
- Batch numbers must be unique within a variant
- Order stages progress: stage1 → stage2 → stage3

---
**Purpose:** Master product catalog with basic product information  
**Module:** Products App  
**Relationships:** Referenced by variants, batches, orders, billing_transactions

```sql
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  classification TEXT,
  quantity INTEGER DEFAULT 0,
  seller_price REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique product identifier
- `name` - Product name
- `category` - Product category for organization
- `classification` - Additional product classification
- `quantity` - Current stock quantity
- `seller_price` - Seller/cost price
- `created_at` - Record creation timestamp
- `updated_at` - Last modification timestamp

---

### Variants
**Purpose:** Store product variants with individual SKUs and pricing  
**Module:** Variants App  
**Relationships:** Links to products (product_id), referenced by batches and orders

```sql
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  variant_name TEXT NOT NULL,
  variant_type TEXT,
  variant_value TEXT,
  price REAL,
  cost REAL,
  quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  description TEXT,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique variant identifier
- `product_id` - Foreign key to products table
- `sku` - Unique Stock Keeping Unit
- `variant_name` - Name of the variant (e.g., color, size)
- `variant_type` - Type of variant (e.g., color, size)
- `variant_value` - Value of the variant (e.g., red, large)
- `price` - Selling price
- `cost` - Cost price
- `quantity` - Available inventory
- `reorder_level` - Minimum stock threshold for reordering
- `description` - Variant description
- `image_url` - Image URL for the variant
- `created_at` - Record creation timestamp

**Indexes:**
- Unique constraint on `sku`

---

### Batches
**Purpose:** Track product batches for inventory management and stock rotation  
**Module:** Batches App  
**Relationships:** Links to products and variants

```sql
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  batch_number TEXT NOT NULL UNIQUE,
  purchase_date DATETIME NOT NULL,
  expiry_date DATETIME,
  manufacturing_date DATETIME,
  quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  supplier TEXT,
  location TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique batch identifier
- `product_id` - Foreign key to products
- `variant_id` - Foreign key to variants (optional)
- `batch_number` - Unique batch identification number
- `purchase_date` - When batch was purchased
- `expiry_date` - Expiration date (if applicable)
- `manufacturing_date` - Manufacturing date
- `quantity` - Batch quantity received
- `unit_cost` - Cost per unit
- `supplier` - Supplier name
- `location` - Storage location
- `status` - Batch status (active, expired, sold, etc.)
- `notes` - Additional batch notes
- `created_at` - Record creation timestamp

---

### Orders
**Purpose:** Store customer orders with order-level information  
**Module:** Orders App  
**Relationships:** Referenced by order_items

```sql
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  total_amount REAL NOT NULL,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  shipping_address TEXT,
  delivery_date DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique order identifier
- `order_number` - Unique order number for reference
- `customer_id` - Foreign key to contacts
- `status` - Order status (pending, processing, delivered, cancelled, etc.)
- `total_amount` - Total order amount
- `discount` - Order-level discount
- `tax` - Order-level tax
- `shipping_address` - Delivery address
- `delivery_date` - Expected/actual delivery date
- `notes` - Order notes
- `created_at` - Order creation timestamp
- `updated_at` - Last modification timestamp

---

### Order Items
**Purpose:** Store line items for each order  
**Module:** Orders App  
**Relationships:** Links to orders, products, and variants

```sql
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL DEFAULT 0,
  line_total REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
)
```

**Fields:**
- `id` - Unique line item identifier
- `order_id` - Foreign key to orders
- `product_id` - Foreign key to products
- `variant_id` - Foreign key to variants (optional)
- `quantity` - Quantity ordered
- `unit_price` - Price per unit at time of order
- `discount` - Line-item discount
- `line_total` - Total for this line item

---

### Payments
**Purpose:** Track payment transactions  
**Module:** Payments App  
**Relationships:** Related to orders via transaction_id

```sql
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  reference_number TEXT UNIQUE,
  processed_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique payment identifier
- `transaction_id` - Associated transaction/order ID
- `amount` - Payment amount
- `payment_method` - Method of payment (cash, card, bank transfer, etc.)
- `status` - Payment status (pending, completed, failed, refunded)
- `reference_number` - Transaction/check reference
- `processed_at` - When payment was processed
- `notes` - Payment notes
- `created_at` - Record creation timestamp

---

### Credit Notes
**Purpose:** Track credit notes issued for refunds, returns, or adjustments  
**Module:** Credit Notes App  
**Relationships:** Related to transactions and customers

```sql
CREATE TABLE IF NOT EXISTS credit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_note_number TEXT UNIQUE NOT NULL,
  transaction_id INTEGER,
  customer_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  issued_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  reference_number TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique credit note identifier
- `credit_note_number` - Unique credit note reference number
- `transaction_id` - Associated transaction ID
- `customer_id` - Foreign key to contacts
- `amount` - Credit amount
- `reason` - Reason for credit note (return, adjustment, discount, etc.)
- `status` - Credit note status (active, used, cancelled)
- `issued_date` - Date credit note was issued
- `reference_number` - Additional reference number
- `notes` - Detailed notes
- `created_at` - Record creation timestamp

---

### Contacts
**Purpose:** Store customer and supplier information  
**Module:** Contacts App  
**Relationships:** Referenced by orders, credit_notes, and billing_transactions

```sql
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  gstin TEXT,
  licence_no TEXT,
  pan TEXT,
  total_sales REAL DEFAULT 0,
  avg_sales REAL DEFAULT 0,
  favorite_product_id INTEGER,
  opening_balance REAL DEFAULT 0,
  notes TEXT,
  transport_preference TEXT,
  type TEXT DEFAULT 'Customer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique contact identifier
- `name` - Contact name
- `email` - Email address
- `phone` - Phone number
- `address` - Physical address
- `gstin` - GST Identification Number (India)
- `licence_no` - Business license number
- `pan` - PAN (India tax ID)
- `total_sales` - Total sales to/from contact
- `avg_sales` - Average sales per transaction
- `favorite_product_id` - Most frequently purchased product
- `opening_balance` - Account opening balance
- `notes` - Contact notes
- `transport_preference` - Preferred transport method
- `type` - Contact type (Customer, Supplier, etc.)
- `created_at` - Record creation timestamp
- `updated_at` - Last modification timestamp

---

### Notes
**Purpose:** Store general notes and memos  
**Module:** Notes App  
**Relationships:** Standalone, user-created notes

```sql
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  images_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique note identifier
- `title` - Note title
- `content` - Note content/body
- `images_json` - JSON array of attached images
- `created_at` - Note creation timestamp
- `updated_at` - Last modification timestamp

---

### Calendar Events
**Purpose:** Store calendar events and reminders  
**Module:** Calendar App  
**Relationships:** Standalone event records

```sql
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  duration TEXT,
  description TEXT,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique event identifier
- `title` - Event title
- `date` - Event date
- `time` - Event time
- `duration` - Event duration
- `description` - Event description
- `category` - Event category (meeting, deadline, reminder, etc.)
- `created_at` - Record creation timestamp
- `updated_at` - Last modification timestamp

---

### Tasks
**Purpose:** Store task/todo items with status tracking  
**Module:** Tasks App  
**Relationships:** Standalone task records

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  priority TEXT DEFAULT 'medium',
  category TEXT,
  completed INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique task identifier
- `title` - Task title
- `description` - Task description
- `due_date` - Task due date
- `priority` - Priority level (low, medium, high)
- `category` - Task category
- `completed` - Completion status (0=pending, 1=complete)
- `created_at` - Task creation timestamp
- `updated_at` - Last modification timestamp

---

### Analytics
**Purpose:** Store analytics metrics and KPIs  
**Module:** Analytics App  
**Relationships:** Standalone analytics records

```sql
CREATE TABLE IF NOT EXISTS analytics (
  id TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL,
  metric_name TEXT,
  metric_value REAL,
  metric_json TEXT,
  period TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique analytics record identifier
- `metric_type` - Type of metric (sales, revenue, inventory, etc.)
- `metric_name` - Name of the specific metric
- `metric_value` - Numeric metric value
- `metric_json` - Complex metrics stored as JSON
- `period` - Time period of the metric (daily, weekly, monthly, etc.)
- `created_at` - Record creation timestamp
- `updated_at` - Last modification timestamp

---

### App Settings
**Purpose:** Store application-level configuration and settings  
**Module:** Settings App  
**Relationships:** Standalone configuration records

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  setting_type TEXT DEFAULT 'string',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique setting identifier
- `setting_key` - Configuration key (e.g., 'company_name', 'tax_rate')
- `setting_value` - Configuration value
- `setting_type` - Data type (string, json, integer, etc.)
- `created_at` - Setting creation timestamp
- `updated_at` - Last modification timestamp

---

### Status Checks
**Purpose:** Track system health and status check results  
**Module:** Settings App  
**Relationships:** Standalone monitoring records

```sql
CREATE TABLE IF NOT EXISTS status_checks (
  id TEXT PRIMARY KEY,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  details TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique check record identifier
- `check_type` - Type of check (database, api, server, etc.)
- `status` - Check status (success, failure, warning)
- `response_time_ms` - Response time in milliseconds
- `details` - Additional details or error message
- `checked_at` - When the check was performed

**Indexes:**
- `idx_status_checks_type` on check_type
- `idx_status_checks_date` on checked_at

---

### Billing Transactions
**Purpose:** Record individual billing transactions  
**Module:** Billing App  
**Relationships:** Links to products, variants, and contacts

```sql
CREATE TABLE IF NOT EXISTS billing_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Fields:**
- `id` - Unique transaction identifier
- `customer_id` - Foreign key to contacts
- `product_id` - Foreign key to products
- `variant_id` - Foreign key to variants (optional)
- `quantity` - Transaction quantity
- `unit_price` - Unit price at time of transaction
- `discount` - Applied discount
- `tax` - Applied tax
- `total` - Transaction total
- `notes` - Transaction notes
- `created_at` - Transaction timestamp

---

### Customer Preferences
**Purpose:** Store customer-specific pricing and product preferences  
**Module:** Billing App  
**Relationships:** Links to customers (by name) and products (by name)

```sql
CREATE TABLE IF NOT EXISTS customer_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  disc1 REAL DEFAULT 0,
  disc2 REAL DEFAULT 0,
  scheme TEXT,
  tax REAL DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_name, product_name)
)
```

**Fields:**
- `id` - Unique preference record identifier
- `customer_name` - Customer name
- `product_name` - Product name
- `disc1` - First discount level/percentage
- `disc2` - Second discount level/percentage
- `scheme` - Pricing scheme name
- `tax` - Customer-specific tax rate
- `last_updated` - When preference was last updated

---

## Version History

| Date | Version | Changes |
|---|---|---|
| 2026-03-06 | 2.0 | Updated to MacOS.db schema with 14 tables (removed calendar_events, analytics, app_settings, billing_transactions, customer_preferences) |
| 2026-02-15 | 1.0 | Initial schema documentation for billing.db with 15 tables |
