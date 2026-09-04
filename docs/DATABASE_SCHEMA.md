================================================================================
                    MACOS.DB DATABASE DOCUMENTATION
                    Database: MacOS.db
                    Last Updated: March 6, 2026
================================================================================

DATABASE OVERVIEW
================================================================================
The MacOS.db database is a SQLite database designed to manage customer contacts,
product inventory, batch tracking, order management, and billing operations. It
maintains relationships between contacts, products, variants, batches, orders,
and financial transactions.

Total Tables: 14
MODULE 1 - CORE:
- contacts (Customer/Supplier management)
- notes (General notes and memos)

MODULE 2 - PRODUCTS & INVENTORY:
- categories (Product categories)
- products (Product master data)
- variants (Product variants/pack sizes)
- batches (Batch tracking and inventory)

MODULE 3 - BILLING:
- invoices (Invoice records)
- invoice_items (Invoice line items)
- customer_item_memory (Customer product preferences & discounts)
- payments (Payment and credit note records)
- ledger (Customer account tracking)

MODULE 4 - ORDERS MANAGEMENT:
- orders (3-stage order management tracking)
- order_items (Order line items)

MODULE 5 - SYSTEM & MONITORING:
- status_checks (System health monitoring and check history)


================================================================================
TABLE SCHEMAS AND RELATIONSHIPS
================================================================================

1. CONTACTS TABLE
================================================================================
Purpose: Stores customer and supplier information with contact details, 
         identification numbers, sales metrics, and activity tracking.

Module: Contacts App

Schema:
┌─────────────────────┬──────────┬────────────┬─────────────────────────────┐
│ Column              │ Type     │ Constraint │ Purpose                     │
├─────────────────────┼──────────┼────────────┼─────────────────────────────┤
│ id                  │ INTEGER  │ PRIMARY KEY│ Unique contact identifier   │
│ name                │ TEXT     │ NOT NULL   │ Contact name                │
│ email               │ TEXT     │            │ Email address               │
│ phone               │ TEXT     │            │ Phone number                │
│ address             │ TEXT     │            │ Contact address             │
│ gstin               │ TEXT     │            │ GST identification number   │
│ licence_no          │ TEXT     │            │ Business license number     │
│ pan                 │ TEXT     │            │ PAN number                  │
│ total_sales         │ REAL     │            │ Total sales amount          │
│ avg_sales           │ REAL     │            │ Average sales               │
│ favorite_product_id │ INTEGER  │            │ Preferred product ID        │
│ opening_balance     │ REAL     │            │ Starting balance for ledger │
│ notes               │ TEXT     │            │ Additional notes            │
│ transport_preference│ TEXT     │            │ Preferred transport method  │
│ type                │ TEXT     │            │ Type (customer/supplier...)│
│ active              │ TEXT     │ CHECK      │ Status (ACTIVE/INACTIVE)    │
│ created_at          │ DATETIME │            │ Record creation timestamp   │
│ updated_at          │ DATETIME │            │ Last update timestamp       │
└─────────────────────┴──────────┴────────────┴─────────────────────────────┘

Relationships:
  ↓ favorite_product_id references products(id) [OPTIONAL]


2. NOTES TABLE
================================================================================
Purpose: Stores general notes and memos for the application.

Module: Notes App

Schema:
┌──────────────┬──────────┬────────────┬─────────────────────────────────────┐
│ Column       │ Type     │ Constraint │ Purpose                             │
├──────────────┼──────────┼────────────┼─────────────────────────────────────┤
│ id           │ TEXT     │ PRIMARY KEY│ Unique note identifier              │
│ title        │ TEXT     │ NOT NULL   │ Note title                          │
│ content      │ TEXT     │            │ Note content                        │
│ images_json  │ TEXT     │            │ JSON array of attached images       │
│ created_at   │ DATETIME │            │ Record creation timestamp           │
│ updated_at   │ DATETIME │            │ Last update timestamp               │
└──────────────┴──────────┴────────────┴─────────────────────────────────────┘

Relationships: None (Standalone table)


3. STATUS_CHECKS TABLE
================================================================================
Purpose: Tracks system health monitoring and stores check history for
         API endpoints, database connectivity, and service availability.

Module: System Monitoring

Schema:
┌────────────────────┬──────────┬────────────┬──────────────────────────────┐
│ Column             │ Type     │ Constraint │ Purpose                      │
├────────────────────┼──────────┼────────────┼──────────────────────────────┤
│ id                 │ TEXT     │ PRIMARY KEY│ Unique check record ID       │
│ check_type         │ TEXT     │ NOT NULL   │ Type of check performed      │
│ status             │ TEXT     │ NOT NULL   │ Check result status          │
│ response_time_ms   │ INTEGER  │            │ Response time in milliseconds│
│ details            │ TEXT     │            │ Additional check details     │
│ checked_at         │ DATETIME │            │ Timestamp of check           │
└────────────────────┴──────────┴────────────┴──────────────────────────────┘

Indexes:
  - idx_status_checks_type on check_type
  - idx_status_checks_date on checked_at

Relationships: None (Standalone monitoring table)


4. CATEGORIES TABLE
================================================================================
Purpose: Stores product categories used to organize and classify products.

Module: Products App

Schema:
┌──────────────┬──────────┬────────────┬─────────────────────────────────────┐
│ Column       │ Type     │ Constraint │ Purpose                             │
├──────────────┼──────────┼────────────┼─────────────────────────────────────┤
│ id           │ INTEGER  │ PRIMARY KEY│ Unique category identifier          │
│ name         │ TEXT     │ NOT NULL   │ Category name                       │
│           │          │ UNIQUE     │                                     │
│ created_at   │ DATETIME │            │ Record creation timestamp           │
│ updated_at   │ DATETIME │            │ Last update timestamp               │
└──────────────┴──────────┴────────────┴─────────────────────────────────────┘

Relationships:
  ↑ Referenced by products(category_id)


5. PRODUCTS TABLE
================================================================================
Purpose: Master product catalog storing basic product information and metadata.

Module: Products App

Schema:
┌────────────────┬──────────┬────────────┬────────────────────────────────────┐
│ Column         │ Type     │ Constraint │ Purpose                            │
├────────────────┼──────────┼────────────┼────────────────────────────────────┤
│ id             │ INTEGER  │ PRIMARY KEY│ Unique product identifier          │
│ name           │ TEXT     │ NOT NULL   │ Product name                       │
│ category_id    │ INTEGER  │ NOT NULL   │ Category reference                 │
│                │          │ FOREIGN KEY│                                    │
│ classification │ TEXT     │            │ Product classification/type        │
│ created_at     │ DATETIME │            │ Record creation timestamp          │
│ updated_at     │ DATETIME │            │ Last update timestamp              │
└────────────────┴──────────┴────────────┴────────────────────────────────────┘

Relationships:
  → category_id references categories(id) [REQUIRED]
  ↑ Referenced by variants(product_id)
  ← Referenced by contacts(favorite_product_id)


6. VARIANTS TABLE
================================================================================
Purpose: Stores product variants with different pack sizes and types.
         Each variant represents a different packaging option for a product.

Module: Products App

Schema:
┌────────────────┬──────────┬────────────┬────────────────────────────────────┐
│ Column         │ Type     │ Constraint │ Purpose                            │
├────────────────┼──────────┼────────────┼────────────────────────────────────┤
│ id             │ INTEGER  │ PRIMARY KEY│ Unique variant identifier          │
│ product_id     │ INTEGER  │ NOT NULL   │ Product reference                  │
│                │          │ FOREIGN KEY│                                    │
│ pack_size_value│ TEXT     │ NOT NULL   │ Pack size value (e.g., "500")      │
│ pack_size_type │ TEXT     │ NOT NULL   │ Pack size unit (e.g., "g", "ml")   │
│ created_at     │ DATETIME │            │ Record creation timestamp          │
│ updated_at     │ DATETIME │            │ Last update timestamp              │
└────────────────┴──────────┴────────────┴────────────────────────────────────┘

Relationships:
  → product_id references products(id) [REQUIRED]
  ↑ Referenced by batches(variant_id)


7. BATCHES TABLE
================================================================================
Purpose: Tracks product batches with manufacturing details, expiry dates,
         pricing (MRP), and inventory sold.

Module: Batches App

Schema:
┌────────────────┬──────────┬────────────┬────────────────────────────────────┐
│ Column         │ Type     │ Constraint │ Purpose                            │
├────────────────┼──────────┼────────────┼────────────────────────────────────┤
│ id             │ INTEGER  │ PRIMARY KEY│ Unique batch identifier            │
│ variant_id     │ INTEGER  │ NOT NULL   │ Variant reference                  │
│                │          │ FOREIGN KEY│                                    │
│ batch_no       │ TEXT     │ NOT NULL   │ Batch number                       │
│                │          │ UNIQUE     │ (unique per variant)               │
│ mrp            │ REAL     │ NOT NULL   │ Maximum Retail Price               │
│ mfg_date       │ DATE     │            │ Manufacturing date                 │
│ exp_date       │ DATE     │            │ Expiration date                    │
│ units_sold     │ INTEGER  │ DEFAULT 0  │ Number of units sold               │
│ created_at     │ DATETIME │            │ Record creation timestamp          │
│ updated_at     │ DATETIME │            │ Last update timestamp              │
└────────────────┴──────────┴────────────┴────────────────────────────────────┘

Indexes:
  - idx_batches_variant on variant_id

Relationships:
  → variant_id references variants(id) [REQUIRED]
  ↑ Referenced by invoice_items(batch_id)
  ↑ Referenced by order_items(batch_id)


================================================================================
DATABASE RELATIONSHIP DIAGRAM
================================================================================

                          CONTACTS
                         ┌────────┐
                         │ id (PK)│
                         └────────┘
                              ↓
                    favorite_product_id
                              ↓
                       CATEGORIES ←── PRODUCTS
                      ┌──────────┐      ┌────────┐
                      │ id (PK)  │      │ id(PK) │
                      └──────────┘      └────────┘
                                             ↓
                                       category_id
                                             ↓
                                        VARIANTS
                                       ┌────────┐
                                       │ id(PK) │
                                       └────────┘
                                             ↓
                                       product_id
                                             ↓
                                        BATCHES
                                       ┌────────┐
                                       │ id(PK) │
                                       └────────┘
                                             ↓
                                       variant_id

                        NOTES (Standalone)
                       ┌──────────┐
                       │ id (PK)  │
                       └──────────┘


================================================================================
KEY RELATIONSHIPS SUMMARY
================================================================================

PARENT ← CHILD RELATIONSHIPS (Foreign Keys):

1. categories → products
   One category can have multiple products
   Constraint: NOT NULL (Every product must belong to a category)

2. products → variants
   One product can have multiple variants (pack sizes)
   Constraint: NOT NULL (Every variant must reference a product)

3. variants → batches
   One variant can have multiple batches
   Constraint: NOT NULL (Every batch must reference a variant)

4. contacts → products (optional)
   Each contact can have one favorite product
   Constraint: OPTIONAL (Contact may not have a favorite product)


================================================================================
DATA FLOW
================================================================================

INPUT FLOW (Top-Down):
  1. Categories are created first → stores product classifications
  2. Products are created with a category → master product list
  3. Variants are created per product → different pack sizes
  4. Batches are created per variant → actual inventory with dates/pricing
  5. Contacts are created independently → reference favorite products

OUTPUT FLOW (Bottom-Up):
  Batches → link to Variants → link to Products → link to Categories
  Provides complete product hierarchy for reporting and inventory tracking


================================================================================
TABLE STATES & DATA INTEGRITY
================================================================================

Constraints Applied:
• All foreign key relationships enforced
• Unique constraints on: categories(name), batches(batch_no)
• Check constraints on: contacts(active) must be 'ACTIVE' or 'INACTIVE'
• Timestamps: created_at and updated_at on all tables for audit trail


================================================================================
ORDERS MANAGEMENT APP TABLES
================================================================================

8. ORDERS TABLE
================================================================================
Purpose: Stores customer orders with 3-stage order management tracking.
         Manages order from creation through QC to delivery with full audit trail.

Module: Orders App

Schema:
┌────────────────────┬──────────┬────────────┬──────────────────────────────┐
│ Column             │ Type     │ Constraint │ Purpose                      │
├────────────────────┼──────────┼────────────┼──────────────────────────────┤
│ id                 │ INTEGER  │ PRIMARY KEY│ Unique order identifier      │
│ order_number       │ TEXT     │ NOT NULL   │ Order reference number       │
│                    │          │            │ (business-facing)            │
│ customer_id        │ INTEGER  │ NOT NULL   │ Customer reference           │
│                    │          │ FOREIGN KEY│                              │
│ current_stage      │ TEXT     │ DEFAULT    │ Stage: stage1, stage2, stage3│
│                    │          │ 'stage1'   │ (Order → QC → Delivery)      │
│ order_date         │ DATETIME │ DEFAULT    │ When order was placed        │
│                    │          │ CURRENT_TS │                              │
│ order_notes        │ TEXT     │            │ Order creation notes         │
│ qc_date            │ DATETIME │            │ Quality check datetime       │
│ qc_notes           │ TEXT     │            │ QC findings and notes        │
│ checklist_items    │ TEXT     │            │ QC checklist JSON            │
│ delivery_date      │ DATETIME │            │ Actual delivery datetime     │
│ bill_reference     │ TEXT     │            │ Linked invoice number        │
│ total_amount       │ REAL     │ DEFAULT 0  │ Total order value            │
│ created_at         │ DATETIME │            │ Record creation timestamp    │
│ updated_at         │ DATETIME │            │ Last modification timestamp  │
└────────────────────┴──────────┴────────────┴──────────────────────────────┘

Unique Constraint:
  - (order_number, customer_id) must be unique (allows same order_number for different customers)

Indexes:
  - idx_orders_customer on customer_id
  - idx_orders_stage on current_stage

Relationships:
  → customer_id references contacts(id) [REQUIRED]
  ↑ Referenced by order_items(order_id)


9. ORDER_ITEMS TABLE
================================================================================
Purpose: Stores line items for each order with product, variant, and batch info.
         Tracks quantity, pricing, and received quantity for order fulfillment.

Module: Orders App

Schema:
┌────────────────────┬──────────┬────────────┬──────────────────────────────┐
│ Column             │ Type     │ Constraint │ Purpose                      │
├────────────────────┼──────────┼────────────┼──────────────────────────────┤
│ id                 │ INTEGER  │ PRIMARY KEY│ Unique line item identifier  │
│ order_id           │ INTEGER  │ NOT NULL   │ Order reference              │
│                    │          │ FOREIGN KEY│                              │
│ product_id         │ INTEGER  │            │ Product reference            │
│                    │          │ FOREIGN KEY│                              │
│ variant_id         │ INTEGER  │            │ Variant reference            │
│                    │          │ FOREIGN KEY│                              │
│ batch_id           │ INTEGER  │            │ Batch reference              │
│                    │          │ FOREIGN KEY│                              │
│ quantity           │ INTEGER  │ NOT NULL   │ Ordered quantity             │
│ received_quantity  │ INTEGER  │ DEFAULT 0  │ Quantity received/fulfilled  │
│ unit_price         │ REAL     │ NOT NULL   │ Unit price at order time     │
│ line_total         │ REAL     │ NOT NULL   │ quantity × unit_price        │
│ created_at         │ DATETIME │            │ Line item creation timestamp │
│ updated_at         │ DATETIME │            │ Last modification timestamp  │
└────────────────────┴──────────┴────────────┴──────────────────────────────┘

Indexes:
  - idx_order_items_order on order_id
  - idx_order_items_batch on batch_id

Relationships:
  → order_id references orders(id) [REQUIRED] ON DELETE CASCADE
  → product_id references products(id) [OPTIONAL] ON DELETE CASCADE
  → variant_id references variants(id) [OPTIONAL] ON DELETE CASCADE
  → batch_id references batches(id) [OPTIONAL] ON DELETE CASCADE


================================================================================
BILLING APP TABLES
================================================================================

10. INVOICES TABLE
================================================================================
Purpose: Stores invoice records with billing information, totals, and dates.
         Tracks financial transactions with customers.

Module: Billing App

Schema:
┌────────────────────┬──────────┬────────────┬──────────────────────────────┐
│ Column             │ Type     │ Constraint │ Purpose                      │
├────────────────────┼──────────┼────────────┼──────────────────────────────┤
│ id                 │ INTEGER  │ PRIMARY KEY│ Unique invoice identifier    │
│ customer_id        │ INTEGER  │ NOT NULL   │ Customer reference           │
│                    │          │ FOREIGN KEY│                              │
│ invoice_no         │ TEXT     │ NOT NULL   │ Invoice number               │
│                    │          │ UNIQUE     │                              │
│ due_date           │ DATE     │            │ Payment due date             │
│ total_amount       │ REAL     │ DEFAULT 0  │ Sum of all line items        │
│ total_discount     │ REAL     │ DEFAULT 0  │ Total discounts applied      │
│ total_gst          │ REAL     │ DEFAULT 0  │ Total GST amount             │
│ round_off          │ REAL     │ DEFAULT 0  │ Rounding adjustment          │
│ grand_total        │ REAL     │ DEFAULT 0  │ Final billing amount         │
│ previous_due       │ REAL     │ DEFAULT 0  │ Previous outstanding balance │
│ created_at         │ DATETIME │            │ Invoice creation date        │
│ updated_at         │ DATETIME │            │ Last modification date       │
└────────────────────┴──────────┴────────────┴──────────────────────────────┘

Relationships:
  → customer_id references contacts(id) [REQUIRED]
  ↑ Referenced by invoice_items(invoice_id)
  ↑ Referenced by ledger(invoice_id)


11. INVOICE_ITEMS TABLE
================================================================================
Purpose: Stores line items for each invoice with product details, discounts,
         and tax calculations.

Module: Billing App

Schema:
┌────────────────────┬──────────┬────────────┬──────────────────────────────┐
│ Column             │ Type     │ Constraint │ Purpose                      │
├────────────────────┼──────────┼────────────┼──────────────────────────────┤
│ id                 │ INTEGER  │ PRIMARY KEY│ Unique line item identifier  │
│ invoice_id         │ INTEGER  │ NOT NULL   │ Invoice reference            │
│                    │          │ FOREIGN KEY│                              │
│ product_id         │ INTEGER  │ NOT NULL   │ Product reference            │
│                    │          │ FOREIGN KEY│                              │
│ variant_id         │ INTEGER  │ NOT NULL   │ Variant reference            │
│                    │          │ FOREIGN KEY│                              │
│ batch_id           │ INTEGER  │ NOT NULL   │ Batch reference              │
│                    │          │ FOREIGN KEY│                              │
│ pack_value         │ TEXT     │            │ Pack size value (e.g., "500")│
│ pack_type          │ TEXT     │            │ Pack size unit (e.g., "g")   │
│ batch_no           │ TEXT     │            │ Batch number from batch      │
│ exp_date           │ DATE     │            │ Expiration date              │
│ qty                │ INTEGER  │ NOT NULL   │ Quantity ordered             │
│ scheme             │ TEXT     │            │ Promotional scheme if any    │
│ free               │ INTEGER  │ DEFAULT 0  │ Free quantity (complimentary)│
│ mrp                │ REAL     │            │ Maximum Retail Price         │
│ rate               │ REAL     │ NOT NULL   │ Selling rate per unit        │
│ amount             │ REAL     │            │ qty × rate (before discount) │
│ discount_1         │ REAL     │ DEFAULT 0  │ First level discount         │
│ discount_2         │ REAL     │ DEFAULT 0  │ Second level discount        │
│ gst_percent        │ REAL     │ DEFAULT 0  │ GST percentage applicable    │
│ final_amount       │ REAL     │            │ Amount after all discounts   │
│ gst_reverse        │ INTEGER  │ DEFAULT 0  │ GST Reverse indicator (1/0)  │
│ created_at         │ DATETIME │            │ Line item creation timestamp │
│ updated_at         │ DATETIME │            │ Last modification timestamp  │
└────────────────────┴──────────┴────────────┴──────────────────────────────┘

Relationships:
  → invoice_id references invoices(id) [REQUIRED]
  → product_id references products(id) [REQUIRED]
  → variant_id references variants(id) [REQUIRED]
  → batch_id references batches(id) [REQUIRED]


12. CUSTOMER_ITEM_MEMORY TABLE
================================================================================
Purpose: Stores customer's historical preferences for products including
         their preferred discount structure and tax treatment. Used for
         quick recall when creating new invoices.

Module: Billing App

Schema:
┌────────────────────┬──────────┬────────────┬──────────────────────────────┐
│ Column             │ Type     │ Constraint │ Purpose                      │
├────────────────────┼──────────┼────────────┼──────────────────────────────┤
│ id                 │ INTEGER  │ PRIMARY KEY│ Unique record identifier     │
│ customer_id        │ INTEGER  │ NOT NULL   │ Customer reference           │
│                    │          │ FOREIGN KEY│                              │
│ product_id         │ INTEGER  │ NOT NULL   │ Product reference            │
│                    │          │ FOREIGN KEY│                              │
│ discount_1         │ REAL     │ DEFAULT 0  │ Preferred first discount %   │
│ discount_2         │ REAL     │ DEFAULT 0  │ Preferred second discount %  │
│ scheme             │ TEXT     │            │ Preferred promotion scheme   │
│ tax_percent        │ REAL     │ DEFAULT 0  │ Preferred tax rate %         │
│ created_at         │ DATETIME │            │ Record creation timestamp    │
│ updated_at         │ DATETIME │            │ Last modification timestamp  │
└────────────────────┴──────────┴────────────┴──────────────────────────────┘

Constraints:
  → UNIQUE(customer_id, product_id) - Only one preference per customer-product

Relationships:
  → customer_id references contacts(id) [REQUIRED]
  → product_id references products(id) [REQUIRED]


13. PAYMENTS TABLE
================================================================================
Purpose: Records both payments received from customers and credit notes issued.
         Tracks payment medium, reasons for credit notes, and returned quantities.

Module: Billing App

Schema:
┌────────────────────┬──────────┬────────────┬───────────────────────────────┐
│ Column             │ Type     │ Constraint │ Purpose                       │
├────────────────────┼──────────┼────────────┼───────────────────────────────┤
│ id                 │ INTEGER  │ PRIMARY KEY│ Unique payment ID             │
│ customer_id        │ INTEGER  │ NOT NULL   │ Customer reference            │
│                    │          │ FOREIGN KEY│                               │
│ type               │ TEXT     │ NOT NULL   │ Type: PAYMENT or CREDIT_NOTE  │
│                    │          │ CHECK      │                               │
│ amount             │ REAL     │ NOT NULL   │ Payment or credit amount      │
│ payment_medium     │ TEXT     │            │ Cash, UPI, Cheque, etc        │
│ reason             │ TEXT     │            │ Reason for transaction        │
│ product_name       │ TEXT     │            │ Product name (for credit note)│
│ quantity_returned  │ INTEGER  │            │ Qty returned (for credit note)│
│ unit_price         │ REAL     │            │ Unit price (for credit note)  │
│ credit_amount      │ REAL     │            │ Calculated credit amount      │
│ notes              │ TEXT     │            │ Additional notes              │
│ created_at         │ DATETIME │            │ Transaction timestamp         │
│ updated_at         │ DATETIME │            │ Last modification timestamp   │
└────────────────────┴──────────┴────────────┴───────────────────────────────┘

Constraints:
  → type CHECK ensures only 'PAYMENT' or 'CREDIT_NOTE' values

Relationships:
  → customer_id references contacts(id) [REQUIRED]
  ↑ Referenced by ledger(payment_id)


14. LEDGER TABLE
================================================================================
Purpose: Maintains customer account records linking invoices and payments
         to track current dues and payment reconciliation.

Module: Billing App

Schema:
┌────────────────────┬──────────┬────────────┬───────────────────────────────┐
│ Column             │ Type     │ Constraint │ Purpose                       │
├────────────────────┼──────────┼────────────┼───────────────────────────────┤
│ id                 │ INTEGER  │ PRIMARY KEY│ Unique ledger entry ID        │
│ customer_id        │ INTEGER  │ NOT NULL   │ Customer reference            │
│                    │          │ FOREIGN KEY│                               │
│ current_due        │ REAL     │ DEFAULT 0  │ Current outstanding due amount│
│ invoice_id         │ INTEGER  │            │ Invoice reference (optional)  │
│                    │          │ FOREIGN KEY│                               │
│ payment_id         │ INTEGER  │            │ Payment reference (optional)  │
│                    │          │ FOREIGN KEY│                               │
│ created_at         │ DATETIME │            │ Entry creation timestamp      │
│ updated_at         │ DATETIME │            │ Last modification timestamp   │
└────────────────────┴──────────┴────────────┴───────────────────────────────┘

Relationships:
  → customer_id references contacts(id) [REQUIRED]
  → invoice_id references invoices(id) [OPTIONAL]
  → payment_id references payments(id) [OPTIONAL]


================================================================================
COMPLETE DATABASE RELATIONSHIP DIAGRAM
================================================================================

                          CONTACTS
                         ┌────────┐
                         │ id (PK)│
                         └────────┘
              ↙       ↓       ↓       ↓       ↘
        fav_product  |   invoices  orders  customer_item_memory
             ↓       |       ↓        ↓          ↓
           PRODUCTS  |   invoice   order     PRODUCTS
          ┌────────┐ |   items     items    (preferences)
          │id (PK) │ |    ↓         ↓
          └────────┘ |  ┌──────┐ ┌──────┐
              ↓      |  │items │ │items │
          category   |  └──────┘ └──────┘
             ↓       |    ↓         ↓
        CATEGORIES   |  product  product
       ┌──────────┐  |    ↓         ↓
       │ id (PK)  │  |  variant  variant
       └──────────┘  |    ↓         ↓
                     |  batch     batch
         VARIANTS←───┘
        ┌────────┐
        │id (PK) │
        └────────┘
            ↓
      product_id
            ↓
        BATCHES
       ┌────────┐
       │id (PK) │
       └────────┘

        INVOICES              ORDERS
       ┌────────┐            ┌────────┐
       │ id(PK) │            │ id(PK) │
       │cust_id │            │cust_id │
       └────────┘            └────────┘
           ↓                      ↓
    invoice_items           order_items
    ┌───────────┐           ┌───────────┐
    │invoice_id │           │ order_id  │
    │product_id │           │product_id │
    │variant_id │           │variant_id │
    │ batch_id  │           │ batch_id  │
    └───────────┘           └───────────┘

        PAYMENTS             LEDGER
       ┌────────┐           ┌──────────┐
       │ id(PK) │           │ id (PK)  │
       │type    │           │ cust_id  │
       │cust_id │           │inv_id(opt)
       └────────┘           │pay_id(opt)
                            └──────────┘

        NOTES (Standalone)      STATUS_CHECKS (Standalone)
       ┌──────────┐             ┌──────────────┐
       │ id (PK)  │             │ id (PK)      │
       │ title    │             │ check_type   │
       └──────────┘             └──────────────┘


================================================================================
DATA FLOW - ORDERS & BILLING OPERATIONS
================================================================================

ORDER CREATION FLOW (3-Stage Process):
1. Stage 1 - Order Entry:
   - Create order with customer reference
   - Add line items (product → variant → batch)
   - Set quantity and unit pricing
   - Calculate total_amount

2. Stage 2 - Quality Check (QC):
   - Mark order for QC
   - Record QC date, notes, and checklist
   - Update to current_stage = 'stage2'

3. Stage 3 - Delivery:
   - Update received_quantity in order_items
   - Record delivery_date
   - Link to invoice (bill_reference)
   - Update to current_stage = 'stage3'

INVOICE CREATION FLOW:
1. Customer (from contacts) initiates a new invoice
2. Customer item preferences loaded from customer_item_memory for quick recall
3. Line items added to invoice:
   - Select product → Select variant → Select batch
   - Auto-populate: previous discounts, scheme, tax % from customer_item_memory
4. Invoice calculation: total_amount, discounts, GST, grand_total
5. Invoice saved with due_date (calculated from: 7/15/30 days or custom)
6. New ledger entry created tracking current_due

PAYMENT/CREDIT NOTE FLOW:
1. Payment received → Payment entry created with type='PAYMENT'
2. OR Defect/Return → Credit note entry created with type='CREDIT_NOTE'
3. Payment/Credit note linked to customer in ledger
4. Ledger current_due updated (invoice_due - payments - credits)

CUSTOMER PREFERENCE TRACKING:
1. As invoices are created, customer_item_memory is updated/created
2. Stores the discount structure and taxing method for each product
3. Used for auto-population in future invoices for same customer-product combo

SYSTEM MONITORING:
1. Status checks record API, database, and service health
2. Timestamps track when checks were performed
3. Response times help identify performance issues


================================================================================
KEY BUSINESS LOGIC
================================================================================

1. ORDER STAGES:
   Stage 1 (stage1): Order created and items added
   Stage 2 (stage2): Order undergoes quality check
   Stage 3 (stage3): Order confirmed and delivered
   
   Progression: stage1 → stage2 → stage3
   Early exit possible: order can be cancelled before stage3

2. ORDER FULFILLMENT:
   Tracks quantity ordered vs received_quantity
   Incomplete orders show received_quantity < quantity
   Fully fulfilled when received_quantity = quantity for all items

3. INVOICE CALCULATION:
   total_amount = SUM(qty × rate) for all items
   total_discount = SUM((discount_1 + discount_2) applied to each item)
   final_amount_per_item = (qty × rate) - discounts + (gst_percent × subtotal)
   total_gst = SUM(gst_percent × subtotal) for all items
   grand_total = total_amount - total_discount + total_gst + round_off

4. LEDGER BALANCE:
   current_due = previous_due + invoice_grand_total(s) - payments - credits
   Calculated from: invoices(previous_due + grand_total) - payments(amount)

5. CUSTOMER MEMORY:
   Captures the most recent discount/scheme for a product per customer
   Updated each time an invoice is created
   UNIQUE constraint ensures only one preference per customer-product pair

6. PAYMENT MEDIUM OPTIONS:
   Cash, Cheque, UPI, NEFT, RTGS, Credit Card, Debit Card, Bank Transfer, etc.

7. CREDIT NOTE REASON:
   Damaged, Defective, Returns, Over-billing, Over-supply, Promotional, etc.

8. STATUS CHECK MONITORING:
   Used to log health checks for API endpoints
   Records response times for performance tracking
   Helps identify service failures and performance degradation


Constraints Applied:
• All foreign key relationships enforced with ON DELETE CASCADE for child records
• Unique constraints on: categories(name), batches(batch_no), invoices(invoice_no),
  orders(order_number), customer_item_memory(customer_id, product_id)
• Check constraints on: contacts(active) IN ('ACTIVE','INACTIVE'),
  payments(type) IN ('PAYMENT','CREDIT_NOTE')
• Timestamps: created_at and updated_at on all tables for audit trail and tracking

================================================================================
