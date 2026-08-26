# Billing App

Complete billing and inventory management system for products, variants, batches, and customer contacts.

## Overview

The Billing App provides comprehensive product and customer management with a hierarchical structure:
- Products
  - Variants (pack sizes)
    - Batches (MRP, manufacturing date, expiry date)
- Contacts (customers, vendors)

## Endpoints

### Products

#### List All Products
```
GET /api/billing/products
```

Returns all products with their variants and batches.

#### Create Product
```
POST /api/billing/products
Content-Type: application/json

{
  "name": "Product Name",
  "category": "Category",
  "classification": "Class",
  "variants": [
    {
      "packSize": "500",
      "packSizeType": "grams",
      "batches": [
        {
          "batchNo": "B001",
          "mrp": 150,
          "mfgDate": "2024-01-01",
          "expiryDate": "2025-01-01",
          "unitsSold": 100
        }
      ]
    }
  ]
}
```

#### Get Product by ID
```
GET /api/billing/products/:id
```

Returns product with all variants and batches.

#### Update Product
```
PUT /api/billing/products/:id
Content-Type: application/json
```

Updates product and replaces variants/batches.

#### Delete Product
```
DELETE /api/billing/products/:id
```

Deletes product and all related variants and batches (cascade).

### Contacts

#### List All Contacts
```
GET /api/billing/contacts
```

Returns all contacts/customers ordered by creation date (newest first).

#### Create Contact
```
POST /api/billing/contacts
Content-Type: application/json

{
  "name": "Contact Name",
  "email": "email@example.com",
  "phone": "9999999999",
  "address": "Address",
  "gstin": "GSTIN",
  "licence_no": "License",
  "pan": "PAN",
  "total_sales": "100000",
  "avg_sales": "5000",
  "favorite_product_id": 1,
  "opening_balance": "50000",
  "notes": "Additional notes",
  "transport_preference": "By Road"
}
```

#### Get Contact by ID
```
GET /api/billing/contacts/:id
```

#### Update Contact
```
PUT /api/billing/contacts/:id
Content-Type: application/json
```

#### Delete Contact
```
DELETE /api/billing/contacts/:id
```

### Customer Alias

Contacts can also be accessed at `/api/billing/customers` (alias for backward compatibility).

## Data Structure

### Products Table
```
id              INTEGER PRIMARY KEY
name            TEXT NOT NULL
category        TEXT
classification  TEXT
created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### Variants Table
```
id              INTEGER PRIMARY KEY
product_id      INTEGER FOREIGN KEY
pack_size_value REAL
pack_size_type  TEXT
```

### Batches Table
```
id              INTEGER PRIMARY KEY
variant_id      INTEGER FOREIGN KEY
batch_no        TEXT
mrp             REAL DEFAULT 0
mfg_date        DATE
exp_date        DATE
units_sold      INTEGER DEFAULT 0
```

### Contacts Table
```
id                    INTEGER PRIMARY KEY
name                  TEXT NOT NULL
email                 TEXT
phone                 TEXT
address               TEXT
gstin                 TEXT
licence_no            TEXT
pan                   TEXT
total_sales           REAL DEFAULT 0
avg_sales             REAL DEFAULT 0
favorite_product_id   INTEGER
opening_balance       REAL DEFAULT 0
notes                 TEXT
transport_preference  TEXT
created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## Example Usage

### Create Product with Variants
```javascript
const product = {
  name: "Milk",
  category: "Dairy",
  classification: "Liquid",
  variants: [
    {
      packSize: "500",
      packSizeType: "ml",
      batches: [
        {
          batchNo: "ML001",
          mrp: 45,
          mfgDate: "2024-01-15",
          expiryDate: "2024-01-22",
          unitsSold: 50
        }
      ]
    },
    {
      packSize: "1",
      packSizeType: "liter",
      batches: [
        {
          batchNo: "ML002",
          mrp: 85,
          mfgDate: "2024-01-15",
          expiryDate: "2024-01-22",
          unitsSold: 25
        }
      ]
    }
  ]
};

// POST /api/billing/products
```

### Create Contact
```javascript
const contact = {
  name: "ABC Stores",
  email: "abc@stores.com",
  phone: "9876543210",
  address: "Main Street, City",
  gstin: "XXGST0001",
  license_no: "LIC001",
  pan: "PANXX0001",
  total_sales: 500000,
  avg_sales: 25000,
  opening_balance: 100000,
  transport_preference: "By Rail"
};

// POST /api/billing/contacts
```

## Integration

The Billing App includes:
- Product and variant management
- Batch tracking with expiry management
- Customer contact database
- Sales and balance tracking
- Customer preferences (linked in main database)

For customer-specific pricing and preferences, see the Preferences App documentation.
