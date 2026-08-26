# Analytics Module API Documentation

This directory contains the complete backend API router, route handlers, and database interfaces for the **Analytics Module**.

---

## 📌 Overview

- **Base Route**: `/api/analytics`
- **Database Tables**: `invoices`, `invoice_items`, `contacts`, `payments`, `products`, `analytics` (SQLite via `better-sqlite3`)
- **Module Path**: `frontend/modules/analytics/api/`
  - `index.js`: Express router mounting & database initialization
  - `routes.js`: Route definitions
  - `handlers.js`: Executive KPI calculations, comparative period analysis, RFM segmentation, AR aging, order funnel, and product velocity algorithms

---

## 🗄️ Database Relationships

The Analytics module aggregates real-time financial and operational metrics across billing, customer, payment, and inventory tables:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   invoices   │    │invoice_items │    │   payments   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
                 ┌───────────────────┐
                 │ analytics engine  │
                 └─────────┬─────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   contacts   │    │   products   │    │  analytics   │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## 📋 Data Structure (Executive KPI Payload)

```json
{
  "totalRevenue": 452800.0,
  "revenueGrowth": 14.5,
  "totalOrders": 128,
  "orderGrowth": 8.2,
  "averageOrderValue": 3537.5,
  "aovGrowth": 5.8,
  "totalAccountsReceivable": 61415.0,
  "activeCustomersCount": 45
}
```

### Field Descriptions
| Field | Type | Description |
| :--- | :--- | :--- |
| `totalRevenue` | Double | Net aggregated sales total across non-cancelled invoices (₹) |
| `revenueGrowth` | Double | Period-over-period percentage revenue growth (%) |
| `totalOrders` | Integer | Total count of invoices generated in selected timeframe |
| `orderGrowth` | Double | Period-over-period order count growth percentage (%) |
| `averageOrderValue` | Double | Mean invoice total value (`totalRevenue / totalOrders`) |
| `aovGrowth` | Double | Period-over-period growth in Average Order Value (%) |
| `totalAccountsReceivable` | Double | Outstanding balance sum across active customers (`current_due`) |
| `activeCustomersCount` | Integer | Total count of active customers with recorded transactions |

---

## 🚀 API Endpoints Reference

### 1. Executive KPI Summary
- **Endpoint**: `GET /api/analytics/executive-kpi`
- **Query Params**: `?period=month|quarter|year|custom&startDate=...&endDate=...`
- **Description**: Returns top-level business performance metrics (Total Sales, Revenue Growth %, Total Orders, Average Order Value, Accounts Receivable, and Active Customers count).
- **Response**: Executive KPI JSON Object

---

### 2. Comparative Analysis (YoY / MoM / QoQ)
- **Endpoint**: `GET /api/analytics/comparative-analysis`
- **Query Params**: `?mode=yoy|mom|qoq|custom`
- **Description**: Computes current vs. previous period performance side-by-side with delta values and percentage changes.
- **Response**: Comparative analysis payload with historical breakdowns

---

### 3. Sales Deep Dive & Time Series
- **Endpoint**: `GET /api/analytics/sales-deep-dive`
- **Query Params**: `?period=...`
- **Description**: Breaks down revenue by daily/weekly/monthly intervals, order status distributions, and revenue channels.
- **Response**: Time series revenue arrays

---

### 4. RFM Customer Segmentation
- **Endpoint**: `GET /api/analytics/rfm-segmentation`
- **Description**: Categorizes customers into Recency, Frequency, and Monetary value cohorts (Champions, Loyal Customers, At Risk, Lost).
- **Response**: RFM cohort distribution arrays

---

### 5. AR Aging Analysis
- **Endpoint**: `GET /api/analytics/ar-aging`
- **Description**: Groups outstanding receivables into aging buckets (0-30 days, 31-60 days, 61-90 days, 90+ days overdue).
- **Response**: Aging bucket amounts and customer lists

---

### 6. Order Funnel Conversion
- **Endpoint**: `GET /api/analytics/order-funnel`
- **Description**: Tracks order pipeline metrics from draft to confirmed, invoiced, paid, and completed states.
- **Response**: Funnel stage counts and conversion percentages

---

### 7. Product Velocity & Inventory Insights
- **Endpoint**: `GET /api/analytics/product-velocity`
- **Description**: Measures product turnover speed, fast-moving vs slow-moving stock, and reorder alerts.
- **Response**: Velocity ranking lists

---

### 8. Top Performing Products
- **Endpoint**: `GET /api/analytics/top-products`
- **Query Params**: `?limit=10`
- **Description**: Returns highest revenue and highest volume product sales.
- **Response**: `Array<ProductMetric>`

---

### 9. Top Customers
- **Endpoint**: `GET /api/analytics/top-customers`
- **Query Params**: `?limit=10`
- **Description**: Returns highest spending customers by sales volume and invoice count.
- **Response**: `Array<CustomerMetric>`

---

### 10. Individual Customer Stats
- **Endpoint**: `GET /api/analytics/customer/:id/stats`
- **Description**: Returns specific customer purchase history, average order value, favourite products, and payment punctuality.
- **Response**: Single customer analytics profile

---

### 11. Sales Trend
- **Endpoint**: `GET /api/analytics/sales-trend`
- **Description**: Time-series trend of sales totals for charting.
- **Response**: Trend data points array

---

### 12. Category Performance
- **Endpoint**: `GET /api/analytics/category-performance`
- **Description**: Revenue and unit volume breakdown aggregated by product category.
- **Response**: `Array<CategoryPerformance>`

---

### 13. Dashboard Summary
- **Endpoint**: `GET /api/analytics/summary/dashboard`
- **Description**: Aggregated summary for landing analytics dashboard widgets.
- **Response**: Dashboard summary object

---

### 14. Analytics Record Persistence CRUD
- **Endpoint**: `GET /api/analytics/`
- **Endpoint**: `POST /api/analytics/`
- **Endpoint**: `GET /api/analytics/type/:metricType`
- **Endpoint**: `PUT /api/analytics/:id`
- **Endpoint**: `DELETE /api/analytics/:id`
- **Description**: Generic metric record persistence endpoints for storing custom analytics metric entries.

---

## 📱 Integration Across Clients

### 1. Web Frontend (`frontend/modules/analytics/js/analytics.js`)
- Uses standard `fetch('/api/analytics/...', { credentials: 'same-origin' })`.
- Renders Chart.js and ApexCharts visual dashboards for executive KPIs, sales deep dive, RFM segmentation, and AR aging buckets.

### 2. Native Android App (`android/app/...`)
- **Retrofit Interface**: `ApiService.kt` (`getExecutiveKPI`, `getComparativeAnalysis`, `getARAging`, `getRFMSegmentation`, `getProductVelocity`, `getCustomerStats`).
- **Authentication**: `NetworkClient.kt` injects both `Authorization: Bearer <token>` and `Cookie: auth_token=<token>`.
- **View Model**: `MainViewModel.kt` (`loadExecutiveKPI`, `loadComparativeAnalysis`, `loadARAging`, `loadRFMSegmentation`, `loadProductVelocity`, `loadCustomerStats`).
- **Compose Screen**: `AnalyticsScreen.kt` featuring native Material 3 UI, segmented period chips (YoY, MoM, QoQ, Custom), native animated bar/pie metric charts, and pull-to-refresh.
