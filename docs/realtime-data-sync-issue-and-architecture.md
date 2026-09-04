# Real-Time Data Synchronization & Caching Architecture Report

## 1. Context & Problem Statement
Currently, macOS desktop apps (Contacts, Products, Billing / Invoices / Payments / Orders, Analytics) do not reflect data mutations in real-time across open windows and across multiple active devices/sessions without closing and reopening the window or refreshing the page.

This behavior is mildly noticeable on localhost, but **heavily amplified in live production**.

---

## 2. Root Cause Analysis

### A. Aggressive Service Worker Caching in Production (`service-worker.js`)
- **File**: [`frontend/public/service-worker.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/public/service-worker.js#L102-L132)
- **Mechanism**: The Service Worker intercepts all GET requests matching `/api/` (including `/api/contacts`, `/api/products`, `/api/billing/...`) and implements a **Stale-While-Revalidate** caching strategy.
- **Impact**:
  - When an app window opens and calls an API endpoint, the Service Worker **immediately returns the cached stale data**.
  - It triggers a background network request that silently updates the cache only for the *next* fetch.
  - In production over HTTPS/PWA, this means creating or editing a record elsewhere will not be visible on the first open of an app window; the user has to open it twice or force refresh.
  - On localhost, dev tools frequently bypass SW or disable caching, masking the severity of the issue.

### B. In-Memory Component State & Lack of Inter-Window Event Bus
- Each macOS app is an isolated ES6 class module loaded into its own window container.
- When an action is taken in one window (e.g. adding a customer in Contacts or creating a bill in Billing), no broadcast event or signal is dispatched to other open windows.
- Consequently, open windows continue holding onto their original in-memory datasets (`this.billingData`, `this.customers`, `this.products`).

---

## 3. Recommended Solution Architecture (Future Implementation)

### 1. Network-First Strategy for Dynamic Mutation APIs
Modify `frontend/public/service-worker.js`:
- Exclude dynamic data APIs (`/api/contacts`, `/api/products`, `/api/billing/`, `/api/analytics/`) from Stale-While-Revalidate caching when online.
- Use **Network-First with fallback to cache only when offline**.

### 2. Desktop Event Bus (`BroadcastChannel` & Custom Events)
- Implement a shared `BroadcastChannel('macos_data_sync')` across the browser context.
- Whenever an app creates, updates, or deletes an entity (contacts, products, invoices, payments, orders):
  ```javascript
  const syncChannel = new BroadcastChannel('macos_data_sync');
  syncChannel.postMessage({ type: 'DATA_UPDATED', entity: 'contacts', timestamp: Date.now() });
  ```
- All open windows subscribe to `macos_data_sync` and automatically trigger a lightweight, non-destructive state reload (`refreshData()`).

### 3. Server-Sent Events (SSE) or Lightweight Polling for Multi-Device Sync
- For multi-user environments (Admin + Workers on separate machines), provide a lightweight SSE endpoint (`/api/events`) or periodic background poll (every 15–30s when window is focused) to broadcast server mutations to all connected clients.
