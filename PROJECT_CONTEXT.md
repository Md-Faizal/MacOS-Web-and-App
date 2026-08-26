# MacOS Business Suite — Full Project Context & Progress Record
### Last Updated: August 26, 2026 @ 03:47 IST

---

## TLDR (30-Second Summary)

**What this project is:**
A custom-built private business management platform (MacOS-inspired web app + Android companion app) used by the owner (Mohammad Faizal) to manage contacts, invoices, payments, ledger, analytics, orders, products, cloud storage, and more.

**What was requested:**
Expand the platform from a single-owner personal tool into a multi-user company platform where:
- Workers/managers can log in using their Google accounts
- Owner controls exactly what each worker can see and do
- All actions across web and Android are tracked in an audit log
- A new admin panel lets the owner manage users and permissions
- Android update distribution is split into testing and production channels
- The existing hardcoded single-account system is replaced properly

**Current status:**
> Analysis complete. Implementation plan written and approved by owner. Ready to execute Phase 1.

---

## Section 1: What the Owner Asked For

**Original request (paraphrased and structured):**

1. **Multi-user login expansion** — Want to give workers/managers access to the platform
2. **Login method decision** — Currently confused between local, Google, or hybrid
3. **Action tracker** — Track everything a user does across web and Android (every change, every section)
4. **Page/data restrictions** — Per-user access control for modules and specific data
5. **Web app section access** — Workers should only see what they're allowed to see
6. **Android app updater channels** — Separate testing and production APK distribution
7. **Remove hardcoded single account** — Both web and Android currently have my personal account baked in
8. **Admin panel** — For managing permissions, approving workers, etc.
9. **Permission model idea (owner's design):**
   - Worker creates account via Google Sign-In
   - Gets a code + QR code shown on screen after first login
   - Worker provides this code to owner
   - Owner gets notified (real-time) of new pending user
   - Owner uses code/QR to approve and allocate permissions
   - Permissions are granular: per-module AND per-contact (e.g., worker can only see 3 specific customers)
   - In contacts: pick and choose which parties/customers the worker can see
   - This cascades to billing, ledger, analytics — only the specific customer's data
   - Some modules (like Cloud Storage) are personal — owner can choose not to grant any access
10. **Overlooked aspects** — Owner asked to be reminded of things they might have missed

---

## Section 2: What Was Found (Full Codebase Analysis)

### Project Root Structure
```
MacOS-Development/
├── frontend/           Web UI (HTML, CSS, JS — vanilla, no framework)
│   ├── index.html      Login page (macOS-style, single-user)
│   ├── home.html       Desktop/main app page
│   ├── modules/        Per-app modules (billing, contacts, analytics, cloud, etc.)
│   └── shared/         Shared components (connectivity, etc.)
├── backend/
│   ├── main/
│   │   └── macos-api-server.js    Main Express server (entry point)
│   └── core/
│       ├── auth/       auth.js, oauth.js, profile.js
│       ├── db/         database-manager.js, schema-master.js, migrations/
│       ├── android-updates.js
│       ├── ai/, logs/, suggestions/, widgets/, etc.
├── database/
│   ├── MacOS.db        SQLite database (the ONLY database)
│   ├── backups/        Auto-backup folder managed by DatabaseManager
│   ├── BILLING_DB_SCHEMA.md
│   └── DATABASE_SCHEMA_DOCUMENTATION.txt
├── android/            Kotlin/Compose Android app
│   └── app/src/main/java/com/example/macosbusinesssuite/
│       ├── MainActivity.kt
│       ├── Navigation.kt
│       ├── data/api/   ApiService.kt, NetworkClient.kt, SessionManager.kt
│       ├── ui/screens/ auth/, billing/, contacts/, analytics/, etc.
│       └── ui/viewmodels/
├── .env                Environment variables (JWT_SECRET, DB path, Google OAuth, etc.)
├── ecosystem.config.js PM2 configuration (production process manager)
└── vite.config.js      Vite build config (for production CSS/JS bundling)
```

### Technology Stack
| Layer | Technology |
|-------|-----------|
| Web Frontend | Vanilla HTML/CSS/JavaScript (no framework) |
| Web Backend | Node.js + Express |
| Database | SQLite via `better-sqlite3` |
| Android | Kotlin + Jetpack Compose + Retrofit2 |
| Auth | JWT (jsonwebtoken) + bcryptjs + WebAuthn (Touch ID) |
| Session | HttpOnly cookie (web) + SharedPreferences (Android) |
| Process Manager | PM2 (production) |
| Build | Vite (frontend bundling) |
| Deployment | Oracle VM / Nginx reverse proxy |

---

### Finding 1: Web Login (`frontend/index.html`)

**Current behavior:**
- No username field — login page shows "Mohammad Faizal" by default (hardcoded)
- User can enter password OR use Touch ID (WebAuthn) if set up on that device
- Forgot Password → security question flow (bcrypt hashed answer in DB)
- On page load: calls `/api/auth/logout` to clear any existing session (industrial standard session termination)
- On login: stores session as HttpOnly JWT cookie

**Key problem:**
- `profile.js` has a hardcoded fallback: `full_name: "Mohammad Faizal"` — returned if no DB record
- No concept of "who logged in" — all sessions are `role: 'admin'` with no user identity
- Google is only linked in Settings app for profile name/picture, not used for auth

---

### Finding 2: Android Login (`LoginScreen.kt`)

**Current behavior:**
- Has Username + Password fields
- Username field: purely decorative — `viewModel.login(email, password, keepLoggedIn)` passes it but server ignores it
- Password: only thing validated — if password matches the single admin account → logged in
- Remember Me / Keep Logged In: checkbox that persists session cookie
- Forgot Password: UI link present, shows comment `/* Show security question fallback */` — NOT implemented
- No Google Sign-In button

**`SessionManager.kt` state:**
- `userName` defaults to `"Admin"` (hardcoded)
- Manages `authToken`, `authCookie`, `serverUrl`, `keepLoggedIn`, `biometricEnabled`
- `serverUrl` defaults to `https://mac.faizal.uk/api/` (production)

---

### Finding 3: Backend Auth (`backend/core/auth/auth.js`)

**Current behavior:**
- Single hardcoded row: `auth_credentials WHERE id = 'admin_auth'`
- Login flow checks password against that one bcrypt hash
- JWT payload: `{ role: 'admin', deviceId }` — no user ID
- Biometric login: trusts client's `biometric: true` claim — server does NOT verify WebAuthn challenge (trusts client)
- Recovery key: hardcoded `RECOVERY_KEY` env variable bypasses password
- Middleware: just checks token validity — no role checking, no permission checking
- All API routes use same blanket `authMiddleware` — no per-module RBAC

**`oauth.js` (existing Google OAuth):**
- Only used for profile linking in Settings (not login)
- Exchanges code for token, fetches Google profile, updates `user_profile` table for `id = 'admin_auth'`
- After success: closes popup, posts `GOOGLE_AUTH_SUCCESS` message to parent window

**`profile.js` (existing profile):**
- Reads from `user_profile WHERE id = 'admin_auth'`
- If no record: returns hardcoded `full_name: "Mohammad Faizal"`, `email_id: "m.faizal@cloud.com"`
- Supports `name_source` ('local' or 'google') and `picture_source` for display switching

---

### Finding 4: Database (`MacOS.db`)

**Current tables (14 total):**
1. `contacts` — Customers/Suppliers. Has `exclude_from_stats` field (key finding — reuse for worker scoping)
2. `notes` — Notes app
3. `status_checks` — System health
4. `categories` — Product categories
5. `products` — Product master catalog
6. `variants` — Product variants/pack sizes
7. `batches` — Batch tracking with inventory
8. `invoices` — Invoice records
9. `invoice_items` — Invoice line items
10. `customer_item_memory` — Customer product preferences
11. `payments` — Payment and credit note records
12. `ledger` — Customer account tracking
13. `orders` — 3-stage order management
14. `order_items` — Order line items

**Auth-related tables (separate, not in main schema doc):**
- `auth_credentials` — One row: `id='admin_auth'`, `password_hash`, `security_question`, `security_answer_hash`
- `user_profile` — One row: `id='admin_auth'`, `full_name`, `email_id`, `profile_picture`, `google_id`, `google_name`, `google_picture`, `name_source`, `picture_source`
- `user_devices` — Tracks per-device login sessions
- `login_history` — Login attempt history per device
- `desktop_state` — Stores per-user desktop layout (already uses `user_id` column — partially multi-user ready!)

**KEY DISCOVERY — `exclude_from_stats` column in `contacts`:**
- Already exists in contacts table
- When set to 1: contact is excluded from analytics and stats calculations
- Same WHERE clause pattern will be reused for worker contact access filtering
- This is an existing, working, tested pattern — extend rather than rebuild

**Database Manager (the migration system):**
- `DatabaseManager` class in `backend/core/db/database-manager.js`
- Auto-runs numbered migration files from `backend/core/db/migrations/` on every startup
- Existing migrations: 003, 004, 005, 006, 007 (cloud sharing related)
- Has `runMigrations()`, `createTables()`, `cleanupUnknownSchema()`, `repairCorruptedTables()`
- **New migrations will be 008+** — follows exact same pattern as existing files
- `schema-master.js` is the single source of truth — new tables added here

---

### Finding 5: Android App Architecture

**Package:** `com.example.macosbusinesssuite`

**Key files:**
- `Navigation.kt` — Compose navigation graph (8 screen routes)
- `ApiService.kt` — Retrofit2 interface with all API endpoints
- `SessionManager.kt` — SharedPreferences wrapper for all session state
- `AppUpdateUtils.kt` — Auto-update check logic (single `latest.apk` channel currently)
- `AppUpdateNotificationManager.kt` — FCM/notification infrastructure (FCM partially present!)

**Screen modules:**
- `ui/screens/auth/LoginScreen.kt` — Login UI
- `ui/screens/billing/` — Billing screens
- `ui/screens/contacts/` — Contacts screens
- `ui/screens/analytics/` — Analytics screens
- `ui/screens/products/` — Products screens
- `ui/screens/server/` — Server status screens
- `ui/screens/settings/` — Settings screens
- `ui/screens/profile/` — Profile screens

**IMPORTANT FINDING — FCM infrastructure partially exists:**
- `AppUpdateNotificationManager.kt` (10.9 KB) suggests FCM notification infrastructure is already partially set up for update notifications
- This can be extended for owner "new worker pending" notifications without starting from scratch

---

### Finding 6: Android Update System (`android-updates.js`)

**Current behavior:**
- Single channel: `latest.apk` in `backend/uploads/android-app/`
- Upload: `POST /api/android/update/upload` (requires auth)
- Check: `GET /api/android/update/check` — returns version manifest
- Manifest: `update-manifest.json` with `versionCode`, `versionName`, `releaseNotes`
- History: `version-history.json` tracks past releases

**What's missing:**
- No channel concept (testing vs production)
- No per-user channel assignment
- All users on same track

---

### Finding 7: Web Modules

**12 frontend modules:**
1. `billing/` — Invoice creation, billing management
2. `contacts/` — Customer/supplier management (has `exclude_from_stats` UI)
3. `analytics/` — Business analytics, reports
4. `products/` — Product catalog management
5. `orders/` — Order management
6. `cloud/` — Personal cloud storage (owner-only by nature)
7. `notes/` — Notes app
8. `calendar/` — Calendar
9. `calculator/` — Calculator
10. `settings/` — Settings app (has Google account linking, device management, security)
11. `launchpad/` — App grid/launcher
12. `ai-vision/` — AI features

---

## Section 3: Decisions Made (Final)

| Decision Point | Choice Made |
|---------------|------------|
| **Owner login method** | Keep existing local (password + Touch ID) — no change |
| **Worker login method** | Google Sign-In ONLY — no local password for workers |
| **Contact visibility for workers** | Show ONLY allowed contacts (never show others) |
| **Contact scoping technique** | Extend existing `exclude_from_stats` WHERE clause pattern |
| **Role structure** | Binary: Owner vs Worker. No Manager tier. |
| **Approval flow** | Worker logs in with Google → gets invite code → owner approves in admin panel |
| **DB migration approach** | Use existing `DatabaseManager` migration system (numbered files, 008+) |
| **Hardcoded name removal** | Yes — remove `"Mohammad Faizal"` from `profile.js` and `"Admin"` from `SessionManager.kt` |
| **Owner notifications** | Real-time: SSE for web, FCM for Android (not polling) |
| **Android update channels** | Admin-controlled per user (owner assigns testing/production) |
| **Data migration** | Existing data auto-assigned to owner account via migration script |

---

## Section 4: What Needs to Be Built (Complete Todo List)

### ✅ Already Exists (Reuse/Extend)
- [x] `DatabaseManager` migration system
- [x] JWT auth infrastructure (auth.js)
- [x] WebAuthn (Touch ID) for owner
- [x] Security question forgot-password flow
- [x] Google OAuth code exchange (oauth.js) — extend for worker login
- [x] `exclude_from_stats` contact filtering pattern — extend for access control
- [x] FCM notification infrastructure in Android (AppUpdateNotificationManager.kt) — extend
- [x] `user_devices` and `login_history` tables
- [x] `desktop_state` already has `user_id` column

### ✅ Phase 1 — Foundation: Multi-User Auth & Database (Completed)
- [x] Migration `008-multi-user-foundation.js` — new tables: `users`, `user_permissions`, `user_contact_access`, `activity_log`, `owner_notifications`, `android_update_channels`
- [x] ALTER existing tables: `contacts`, `invoices`, `payments`, `orders` — add `created_by_user_id`, `last_edited_by`
- [x] Add all new tables & columns to `schema-master.js`
- [x] Seed owner user record from existing `auth_credentials` & `user_profile` during migration
- [x] Backfill existing business data records with owner user ID
- [x] Set up tamper-resistant append-only triggers on `activity_log`
- [x] Seed default `android_update_channels` records ('production' and 'testing')
- [x] Modify `auth.js` — JWT payload: `{ userId, role, tokenVersion, deviceId }`
- [x] Modify `auth.js` — `authMiddleware` checks `token_version` in DB for instant invalidation
- [x] Add `requireOwner` and `requireActive` middleware
- [x] Create `worker-google-auth.js` — Google idToken verification + new worker flow + owner hybrid Google auth
- [x] Create `permissions.js` — RBAC middleware factory and contact scoping
- [x] Remove hardcoded `"Mohammad Faizal"` fallback from `profile.js`
- [x] Update `profile.js` to read from authenticated `users` table
- [x] Update web `index.html` — add Google Sign-In button for workers and owner hybrid
- [x] Update web `index.html` — add pending screen (invite code + QR display with auto-polling)
- [x] Remove hardcoded `"Admin"` default from Android `SessionManager.kt`
- [x] Add `userId`, `userRole`, `userStatus`, `permissionsJson`, `updateChannel` to `SessionManager.kt`
- [x] Update Android `ApiService.kt` and `MainViewModel.kt` for worker Google login and approval check
- [x] Update Android `LoginScreen.kt` with Google Sign-In and Pending Approval UI state

### 🔲 Phase 2 — Admin Panel (~5 days)
- [ ] Create `backend/core/admin/admin.js` with all admin routes
- [ ] Protect admin routes with `requireOwner` middleware
- [ ] Create `frontend/modules/admin/` module (users list, permission builder, contact picker, notifications)
- [ ] Add admin panel to launchpad (owner only)
- [ ] Contact picker UI — multi-select contacts list → writes to `user_contact_access`
- [ ] Permission builder UI — module grid with View/Create/Edit/Delete checkboxes
- [ ] Approve worker flow — enter invite code → verify → set status active
- [ ] Suspend/reactivate worker
- [ ] View notifications feed in admin panel

### 🔲 Phase 3 — Activity Audit Tracker (~3 days)
- [ ] Create `backend/core/activity/activity-logger.js`
- [ ] Mount as middleware on all protected routes
- [ ] Log POST/PUT/PATCH/DELETE with before/after diff
- [ ] Add `GET /api/admin/activity` endpoint with filters
- [ ] Add `GET /api/admin/activity/export` (CSV)
- [ ] Activity feed UI in admin panel (filterable table)
- [ ] Android: add `X-Platform: android` header to all Retrofit requests

### 🔲 Phase 4 — Web UI Per-User Access Gates (~3 days)
- [ ] Create `frontend/shared/permissions.js` (loads + caches permissions on login)
- [ ] Modify launchpad — hide apps based on `canView(module)`
- [ ] Modify contacts handler — filter contacts by `user_contact_access` for workers
- [ ] Modify billing handler — filter invoices/payments for allowed contacts only
- [ ] Modify analytics handler — filter stats for allowed contacts only
- [ ] Modify module JS files — hide create/edit/delete buttons by permission
- [ ] Test: worker cannot reach unassigned contact via direct API call

### 🔲 Phase 5 — Android Multi-User (~5 days)
- [ ] Implement Google Sign-In in `LoginScreen.kt`
- [ ] Create `PendingApprovalScreen.kt` (invite code display + auto-poll)
- [ ] Add permission-based navigation guards to `Navigation.kt`
- [ ] Create `AccessDeniedScreen.kt`
- [ ] Create owner-only Android admin screens (approve, suspend, notifications, activity)
- [ ] Add new API endpoints to `ApiService.kt`
- [ ] Add `X-Platform: android` header in `NetworkClient.kt`

### 🔲 Phase 6 — Android Update Channels (~2 days)
- [ ] Modify `android-updates.js` to support production/testing channels
- [ ] Add channel upload/check routes
- [ ] Store channel info in `android_update_channels` table
- [ ] Modify `AppUpdateUtils.kt` to read channel from `SessionManager`
- [ ] Admin panel: channel assignment per user

### 🔲 Phase 7 — Real-Time + Security (~3 days)
- [ ] Create `backend/core/realtime/sse.js` (SSE endpoint for owner)
- [ ] Owner web portal: connect to SSE, show real-time new-user badge
- [ ] Extend Android FCM (AppUpdateNotificationManager.kt) for new-user notifications
- [ ] Add FCM token registration endpoint (`POST /api/profile/fcm-token`)
- [ ] Add `express-rate-limit` to auth routes
- [ ] Add DB trigger: `BEFORE UPDATE ON activity_log → RAISE(ABORT, ...)`
- [ ] Add `invite_code_expires_at` (48h expiry)
- [ ] Lock CORS to production domain in production env
- [ ] Write test suite for all auth flows
- [ ] Write test for data isolation (worker cannot access unassigned data)
- [ ] Document JWT secret rotation procedure

---

## Section 5: Architecture Diagrams

### Login Flow — Owner (Web)
```
index.html loads
     │
     ├─► Auto-logout (clears session)
     │
     ├─► User enters password OR uses Touch ID
     │
     └─► POST /api/auth/login
              │
              ├─► Lookup users WHERE role = 'owner'
              ├─► Verify password (bcrypt) or biometric flag
              ├─► Sign JWT: { userId, role: 'owner', tokenVersion, deviceId }
              └─► Set HttpOnly cookie → redirect to home.html
```

### Login Flow — Worker (Web or Android)
```
Login page
     │
     └─► Click "Sign in with Google"
              │
              └─► Google OAuth2 / Google Sign-In SDK
                       │
                       └─► Send id_token to POST /api/auth/google/worker-login
                                │
                                ├─► Verify id_token with Google tokeninfo API
                                │
                                ├─► Lookup google_id in users table
                                │
                                ├─► [NEW USER] Create record, status=pending,
                                │   generate invite_code + QR
                                │   → Push owner_notification
                                │   → SSE event to owner web
                                │   → FCM push to owner Android
                                │   → Return { status: 'pending', inviteCode, inviteQr }
                                │
                                ├─► [PENDING] Return same invite code again
                                │
                                ├─► [ACTIVE] Sign JWT + return permissions
                                │   → Navigate to restricted dashboard
                                │
                                └─► [SUSPENDED] Return 403
```

### Permission Check Flow (every API request)
```
API Request
     │
     └─► authMiddleware
              │
              ├─► Verify JWT signature
              ├─► Check token_version matches DB (instant invalidation)
              ├─► Check user status = 'active'
              │
              └─► requirePermission('billing', 'can_create') [if applicable]
                       │
                       ├─► Owner: pass through
                       └─► Worker: check user_permissions table
                                │
                                ├─► Pass → proceed
                                └─► Fail → 403 Forbidden
```

### Contact Data Scoping
```
GET /api/contacts

     ├─► req.user.role === 'owner'
     │         └─► SELECT * FROM contacts ORDER BY name
     │
     └─► req.user.role === 'worker'
               └─► SELECT c.* FROM contacts c
                   INNER JOIN user_contact_access uca
                     ON uca.contact_id = c.id
                     AND uca.user_id = ?   ← worker's userId
                   ORDER BY c.name
                   
(Same join pattern used in billing, analytics, ledger for cascaded access)
```

---

## Section 6: Security Considerations (Full List)

### Addressed in Plan
| Risk | Mitigation |
|------|-----------|
| Stolen JWT used after suspend | `token_version` column — incremented on suspend, checked on every request |
| Client claims Google identity | Backend verifies `id_token` with Google's public keys (`tokeninfo` endpoint) |
| Auth route brute force | `express-rate-limit` on `/api/auth/*` |
| Audit log tampering | DB trigger: BEFORE UPDATE/DELETE on `activity_log → RAISE(ABORT)` |
| Invite code abuse | 48-hour expiry on `invite_code_expires_at` |
| Worker accesses unassigned data via direct API | `requireContactAccess` middleware + SQL filter on every data route |
| Admin routes exposed to workers | `requireOwner` middleware on all `/api/admin/*` |
| CORS abuse in production | Lock to production domain only |
| Stale offline permissions (Android) | 15-minute permission cache TTL with graceful degradation |
| JWT secret compromise | Document rotation procedure; `token_version` limits blast radius |

### Additional Recommended Practices
| Consideration | Notes |
|--------------|-------|
| HTTPS only | Nginx already configured; ensure `secure: true` cookie flag in prod |
| Worker cannot invite other workers | Only owner can approve via admin panel |
| Audit log not deletable by workers | Enforced by RBAC — workers have no access to `/api/admin/*` |
| Google OAuth scopes minimal | Only `openid email profile` — no Drive, Calendar, etc. |
| FCM token rotation | Re-register FCM token on each app launch |
| No password storage for workers | Workers have no password — Google is the only identity |
| Data backup before migration | `DatabaseManager.backupTableStructure()` called automatically before schema changes |

---

## Section 7: Progress Report

### Conversation History
- **Started:** August 26, 2026 at ~02:58 IST
- **Phase:** Planning / Analysis complete

### What Was Done in This Session
1. ✅ Full codebase exploration (frontend, backend, database, Android)
2. ✅ Read all auth files: `auth.js`, `oauth.js`, `profile.js`
3. ✅ Read Android login: `LoginScreen.kt`, `SessionManager.kt`, `ApiService.kt`
4. ✅ Read database schema documentation
5. ✅ Read backend server routes (`macos-api-server.js`)
6. ✅ Discovered existing `exclude_from_stats` pattern in contacts (key reuse finding)
7. ✅ Discovered FCM infrastructure partially exists in `AppUpdateNotificationManager.kt`
8. ✅ Discovered `desktop_state` already has `user_id` column (partially multi-user ready)
9. ✅ Discovered existing migration system (migrations 003–007, will add 008)
10. ✅ Created initial implementation plan
11. ✅ Took owner's feedback on all design decisions
12. ✅ Updated implementation plan with all resolved decisions
13. ✅ Created this context document

### What Has NOT Been Coded Yet
- Nothing has been changed in any source file
- All work so far is analysis + planning
- Ready to begin Phase 1 execution

---

## Section 8: Key File Index (Quick Reference)

| File | Purpose | Phase Affected |
|------|---------|----------------|
| [`backend/core/auth/auth.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/core/auth/auth.js) | Owner login, JWT, auth middleware | 1B |
| [`backend/core/auth/oauth.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/core/auth/oauth.js) | Google profile-link OAuth | 1B |
| [`backend/core/auth/profile.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/core/auth/profile.js) | User profile (has hardcoded name) | 1B |
| [`backend/core/db/database-manager.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/core/db/database-manager.js) | DB init, migration runner | 1A |
| [`backend/core/db/schema-master.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/core/db/schema-master.js) | Master table definitions | 1A |
| [`backend/core/db/migrations/`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/core/db/migrations/) | Numbered migration files (003–007) | 1A |
| [`backend/core/android-updates.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/core/android-updates.js) | APK update distribution | 6 |
| [`backend/main/macos-api-server.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/backend/main/macos-api-server.js) | Express server, route mounting | 1B, 2, 3, 7 |
| [`frontend/index.html`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/index.html) | Web login page | 1C |
| [`frontend/modules/contacts/api/handlers.js`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/frontend/modules/contacts/api/handlers.js) | Contacts API (has exclude pattern) | 4 |
| [`android/.../LoginScreen.kt`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/android/app/src/main/java/com/example/macosbusinesssuite/ui/screens/auth/LoginScreen.kt) | Android login UI | 1D, 5 |
| [`android/.../SessionManager.kt`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/android/app/src/main/java/com/example/macosbusinesssuite/data/api/SessionManager.kt) | Android session/prefs manager | 1D |
| [`android/.../ApiService.kt`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/android/app/src/main/java/com/example/macosbusinesssuite/data/api/ApiService.kt) | Android API interface (Retrofit) | 5 |
| [`android/.../AppUpdateUtils.kt`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/android/app/src/main/java/com/example/macosbusinesssuite/AppUpdateUtils.kt) | APK auto-update logic | 6 |
| [`database/MacOS.db`](file:///c:/Users/HP/Desktop/MacOS%20Project/MacOS-Development/database/MacOS.db) | SQLite database | 1A |

---

## Section 9: Environment & Deployment Notes

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | JWT signing key (in `.env`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `RECOVERY_KEY` | Emergency password bypass |
| `NODE_ENV` | `development` / `production` / `oraclevm` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) |

**Production URL:** `https://mac.faizal.uk`
**Android default server:** `https://mac.faizal.uk/api/`
**Local dev server:** `http://10.0.2.2:3002/api/` (Android emulator)
**Process manager:** PM2 with `ecosystem.config.js`
**Nginx config:** `macos-nginx.conf`

---

## Section 10: How to Resume This Work

If continuing in a new session, reference:
1. This file (`PROJECT_CONTEXT.md`) — full background
2. `implementation_plan.md` — detailed technical plan with file changes
3. Start at **Phase 1A** — create `backend/core/db/migrations/008-multi-user-foundation.js`
4. Follow with `schema-master.js` update, then `auth.js` overhaul

**Do NOT touch** any source files until DB migration is written, reviewed, and backed up.

---

*Document generated by Antigravity AI assistant. Conversation ID: c71437d1-193a-452c-9de5-b94cb5216a8b*
