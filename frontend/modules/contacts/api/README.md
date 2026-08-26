# Contacts Module API Documentation

This directory contains the complete backend API router, route handlers, and database interfaces for the **Contacts Module**.

---

## 📌 Overview

- **Base Route**: `/api/contacts`
- **Database Table**: `contacts` (SQLite via `better-sqlite3`)
- **Module Path**: `frontend/modules/contacts/api/`
  - `index.js`: Express router mounting & database initialization
  - `routes.js`: Route definitions
  - `handlers.js`: Database query logic and business rules

---

## 🗄️ Database Relationships

The `contacts` table serves as the primary entity for all customer and supplier records in the system. It connects directly with the following billing and financial tables:

```
                  ┌─────────────────┐
                  │    contacts     │
                  └────────┬────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   invoices   │    │   payments   │    │    ledger    │
└──────┬───────┘    └──────────────┘    └──────────────┘
       │
       ▼
┌──────────────┐
│invoice_items │
└──────────────┘
```

---

## 📋 Data Structure (Contact Entity)

```json
{
  "id": 7,
  "name": "RAGHUNATH AYURVEDIC AUSHADHALAYA",
  "email": "contact@example.com",
  "phone": "0674 2532895,9348081194",
  "address": "Room No: 19 Unit-2, Estern Tower Market Building, Bhubaneswar",
  "gstin": "21AAAAA0000A1Z5",
  "licence_no": "DL12345",
  "pan": "ABCDE1234F",
  "total_sales": 7840.0,
  "avg_sales": 1568.0,
  "real_total_sales": 61415.0,
  "real_avg_sales": 3411.94,
  "favorite_product": "SUKHMIBIRACHAKA CHURNA",
  "favorite_product_id": null,
  "opening_balance": 3040.0,
  "current_due": 34450.0,
  "last_bill_date": "2026-07-20 22:20:16",
  "last_payment_date": "2026-07-22 14:10:05",
  "exclude_from_stats": 0,
  "disable_duplex_export": 0,
  "notes": "Preferred delivery time morning.",
  "transport_preference": "By Road",
  "type": "Customer",
  "active": "ACTIVE",
  "status": "Active",
  "last_activity": "2026-07-20 22:20:16",
  "created_at": "2026-02-23 09:45:19",
  "updated_at": "2026-07-24 23:23:00"
}
```

### Field Descriptions
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | Integer/String | Primary key auto-increment ID |
| `name` | String | Contact/Customer full name (Required) |
| `phone` | String | Phone/mobile contact numbers |
| `email` | String | Email address |
| `address` | String | Postal billing address |
| `gstin` | String | 15-character GST Identification Number |
| `licence_no` | String | Drug/Business licence number |
| `pan` | String | Permanent Account Number |
| `opening_balance` | Double | Starting balance owed (₹) |
| `current_due` | Double | On-the-fly computed total outstanding balance (Opening Balance + Invoices - Payments) |
| `last_bill_date` | String | Date/timestamp of the most recent invoice |
| `last_payment_date` | String | Date/timestamp of the most recent payment |
| `real_total_sales` | Double | Aggregate sum of all invoice grand totals |
| `real_avg_sales` | Double | Average invoice value across all orders |
| `favorite_product` | String | Name of the most ordered product by frequency |
| `exclude_from_stats` | Integer (0/1) | Flag to exclude contact from overall system stats |
| `disable_duplex_export` | Integer (0/1) | Flag to disable duplex second page in invoice PDF export |
| `active` | String | `ACTIVE` (🟢) or `INACTIVE` (🔴) based on 30-day activity |
| `type` | String | Contact classification (e.g. `Customer`, `Supplier`) |

---

## 🚀 API Endpoints Reference

### 1. Get All Contacts
- **Endpoint**: `GET /api/contacts`
- **Description**: Returns all contacts ordered alphabetically. Computes `current_due`, `last_bill_date`, `last_payment_date`, `real_total_sales`, and `favorite_product` on-the-fly via SQLite subqueries.
- **Response**: `Array<Contact>`

---

### 2. Create Contact
- **Endpoint**: `POST /api/contacts`
- **Body**:
  ```json
  {
    "name": "Acme Traders",
    "phone": "+91 9876543210",
    "email": "acme@example.com",
    "address": "Bhubaneswar",
    "gstin": "21ABCDE1234F1Z5",
    "opening_balance": 500.0,
    "transport_preference": "Road Transport",
    "notes": "Special instructions"
  }
  ```
- **Response**: `201 Created`
  ```json
  { "success": true, "id": 42 }
  ```

---

### 3. Get Single Contact
- **Endpoint**: `GET /api/contacts/:id`
- **Response**: `Contact` object or `404 Not Found`.

---

### 4. Update Contact
- **Endpoint**: `PUT /api/contacts/:id`
- **Description**: Dynamically updates any provided fields in the request body and updates `updated_at` timestamp.
- **Body**: JSON object containing fields to update.
- **Response**:
  ```json
  { "success": true, "id": "42" }
  ```

---

### 5. Delete Contact
- **Endpoint**: `DELETE /api/contacts/:id`
- **Description**: Deletes the contact safely inside a **database transaction**. To prevent Foreign Key constraint errors (`SqliteError: FOREIGN KEY constraint failed`), it cascades deletion across dependent child records (`invoice_items`, `invoices`, `payments`, `orders`, `customer_item_memory`, and `ledger`) prior to deleting the contact row.
- **Response**:
  ```json
  {
    "success": true,
    "deleted": {
      "contact_id": "42",
      "contact_name": "Acme Traders"
    }
  }
  ```

---

### 6. Activity Status Check
- **Endpoint**: `GET /api/contacts/:customerId/activity-status`
- **Description**: Inspects invoices, payments, credit notes, and orders from the last 30 days to set `active` status to `ACTIVE` or `INACTIVE`.

---

### 7. Batch Update All Activity Statuses
- **Endpoint**: `POST /api/contacts/activity/update-all`
- **Description**: Recalculates activity status for every contact in the database.

---

## 📱 Integration Across Clients

### 1. Web Frontend (`frontend/modules/contacts/js/contacts.js`)
- Uses standard `fetch('/api/contacts', { credentials: 'same-origin' })`.
- Transmits session auth cookies to comply with web security model.

### 2. Native Android App (`android/app/...`)
- **Retrofit Interface**: `ApiService.kt`
- **Authentication**: `NetworkClient.kt` injects both `Authorization: Bearer <token>` and `Cookie: auth_token=<token>`.
- **View Model**: `MainViewModel.kt` (`loadContacts`, `createContact`, `updateContact`, `deleteContact`).
- **Compose Screen**: `ContactsScreen.kt` featuring native Material 3 UI, automatic refresh on `ON_RESUME`, native `PullToRefreshBox`, compact search bar, and full ledger metrics display.
