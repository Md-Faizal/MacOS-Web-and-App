/**
 * DATABASE SCHEMA MANAGER
 * 
 * Handles all database initialization and schema management for MacOS.db
 * This is the MASTER schema file that defines the complete database structure
 * 
 * It runs at Node.js startup and ensures:
 * 1. Database is created if it doesn't exist
 * 2. All required tables are created with proper relationships
 * 3. Old/deprecated tables are removed (data migration before deletion)
 * 4. Foreign keys are enforced
 * 5. Same schema in dev and production
 */

const schema = `
-- ====================================================================
-- CORE TABLES
-- ====================================================================

-- Contacts: Customer/Supplier master data
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
  reference_no TEXT,
  opening_balance REAL DEFAULT 0,
  exclude_from_stats INTEGER DEFAULT 0,
  notes TEXT,
  transport_preference TEXT,
  type TEXT DEFAULT 'Customer',
  active TEXT DEFAULT 'INACTIVE',
  last_activity DATETIME,
  disable_duplex_export INTEGER DEFAULT 0,
  created_by_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notes: General notes and memos
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Note Images: Individual images for notes to support staggered loading
CREATE TABLE IF NOT EXISTS note_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL,
  image_data TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);


-- Quick Notes: Separate storage for desktop widgets
CREATE TABLE IF NOT EXISTS quick_notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Auth Credentials: Secure single-user authentication (legacy/backward compatibility)
CREATE TABLE IF NOT EXISTS auth_credentials (
  id TEXT PRIMARY KEY,
  user_role TEXT DEFAULT 'admin',
  password_hash TEXT,
  security_question TEXT,
  security_answer_hash TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users: Multi-user accounts (owner hybrid & worker Google accounts)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  google_id TEXT UNIQUE,
  google_email TEXT,
  google_name TEXT,
  google_picture TEXT,
  full_name TEXT,
  email TEXT,
  password_hash TEXT,
  security_question TEXT,
  security_answer_hash TEXT,
  is_verified BOOLEAN DEFAULT 0,
  role TEXT DEFAULT 'worker',
  status TEXT DEFAULT 'pending',
  invite_code TEXT UNIQUE,
  invite_qr_base64 TEXT,
  approved_by TEXT,
  approved_at DATETIME,
  deletion_requested_at DATETIME,
  deletion_reason TEXT,
  deleted_at DATETIME,
  deleted_by TEXT,
  update_channel TEXT DEFAULT 'production',
  token_version INTEGER DEFAULT 0,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Permissions: RBAC module-level permissions
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  module TEXT NOT NULL,
  can_view INTEGER DEFAULT 0,
  can_create INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, module)
);

-- Worker Lifecycle History: Audit records for worker join/approval/deletion cycles
CREATE TABLE IF NOT EXISTS worker_lifecycle_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'worker',
  status TEXT DEFAULT 'active',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT,
  approved_at DATETIME,
  deletion_reason TEXT,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_user ON worker_lifecycle_history(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_email ON worker_lifecycle_history(email);

-- User Identities: Multi-auth support (local, google, webauthn)
CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT,
  provider_email TEXT,
  password_hash TEXT,
  credential_public_key BLOB,
  credential_counter INTEGER DEFAULT 0,
  credential_transports TEXT,
  is_verified BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_user_id)
);

-- WebAuthn challenges: Short-lived registration/authentication challenges
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge_key TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- One-time, server-bound OAuth linking state
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Server-side sessions. Only a hash of the browser secret is persisted.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  device_id INTEGER,
  platform TEXT NOT NULL DEFAULT 'web',
  provider TEXT,
  ip_address TEXT,
  ip_hash TEXT,
  location_country TEXT,
  location_region TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  idle_expires_at DATETIME NOT NULL,
  absolute_expires_at DATETIME NOT NULL,
  elevated_until DATETIME,
  revoked_at DATETIME,
  revoked_reason TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions (user_id, revoked_at, absolute_expires_at);

-- Rotating mobile refresh tokens. Raw refresh secrets are never persisted.
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_id INTEGER,
  platform TEXT NOT NULL DEFAULT 'android',
  provider TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  revoked_reason TEXT,
  replaced_by TEXT,
  ip_address TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (replaced_by) REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id ON auth_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_family_id ON auth_refresh_tokens (family_id);

-- Authentication security events kept separate from application activity logs.
CREATE TABLE IF NOT EXISTS auth_audit_events (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  device_id INTEGER,
  platform TEXT,
  provider TEXT,
  ip_address TEXT,
  ip_hash TEXT,
  location_country TEXT,
  location_region TEXT,
  user_agent TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_audit_request ON auth_audit_events (request_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_event ON auth_audit_events (event_type, outcome, created_at);

-- Non-destructive quarantine for conflicting legacy identity mappings.
CREATE TABLE IF NOT EXISTS auth_identity_conflicts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  provider_email TEXT,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unresolved',
  details TEXT,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  UNIQUE(provider, identity_key, user_id, source),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_identity_conflicts_status ON auth_identity_conflicts (status, detected_at);

-- User Contact Access: Granular party/customer permissions for workers
CREATE TABLE IF NOT EXISTS user_contact_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  contact_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  UNIQUE(user_id, contact_id)
);

-- Activity Log: Comprehensive audit trail across Web and Android
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  platform TEXT NOT NULL,
  module TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  resource_name TEXT,
  metadata TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Owner Notifications: In-app real-time alerts for the owner
CREATE TABLE IF NOT EXISTS owner_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Android Update Channels: APK channel management (production vs testing)
CREATE TABLE IF NOT EXISTS android_update_channels (
  id TEXT PRIMARY KEY,
  version_name TEXT,
  version_code INTEGER,
  apk_filename TEXT,
  release_notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Devices: Track all devices logged into the account
CREATE TABLE IF NOT EXISTS user_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  device_name TEXT NOT NULL,
  device_type TEXT,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_current INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, device_name)
);

-- Login History: Track every login instance
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  location TEXT,
  status TEXT,
  FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE CASCADE
);

-- User Profile: Store personal information
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  email_id TEXT,
  profile_picture TEXT, -- Base64 encoded image or path
  google_id TEXT UNIQUE,
  google_email TEXT,
  google_name TEXT,
  google_picture TEXT,
  name_source TEXT DEFAULT 'local',
  picture_source TEXT DEFAULT 'local',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id) REFERENCES auth_credentials(id) ON DELETE CASCADE
);



-- ====================================================================
-- SYSTEM & MONITORING TABLES
-- ====================================================================

-- Settings: Device-specific configuration storage
CREATE TABLE IF NOT EXISTS Settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  appearance TEXT NOT NULL DEFAULT 'auto',
  accent_color TEXT DEFAULT 'blue',
  highlight_color TEXT DEFAULT 'blue',
  icon_style TEXT DEFAULT 'default',
  liquid_glass TEXT DEFAULT 'clear',
  sidebar_icon_size TEXT DEFAULT 'medium',
  tint_wallpaper INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE CASCADE,
  UNIQUE(device_id)
);

-- Status Checks: System health monitoring and check history
CREATE TABLE IF NOT EXISTS status_checks (
  id TEXT PRIMARY KEY,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  details TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- App Logs: Remote client logs and crash reports
CREATE TABLE IF NOT EXISTS app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  device_id TEXT,
  user_id TEXT,
  user_name TEXT,
  level TEXT DEFAULT 'INFO',
  message TEXT,
  stack TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- PRODUCTS & INVENTORY TABLES
-- ====================================================================

-- Categories: Product categorization
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Products: Product master catalog
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  classification TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Variants: Product pack sizes and types
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  pack_size_value TEXT NOT NULL,
  pack_size_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Batches: Batch tracking with manufacturing details
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
);

-- ====================================================================
-- BILLING TABLES
-- ====================================================================

-- Invoices: Master invoice records
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  invoice_no TEXT NOT NULL,
  invoice_date DATETIME,
  due_date DATE,
  total_amount REAL DEFAULT 0,
  total_discount REAL DEFAULT 0,
  total_gst REAL DEFAULT 0,
  round_off REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  previous_due REAL DEFAULT 0,
  created_by_user_id TEXT,
  last_edited_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id),
  UNIQUE(customer_id, invoice_no)
);

-- Invoice Items: Line items for each invoice with complete audit trail
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
  -- Calculated amounts (for audit trail)
  amount REAL,                        -- qty × rate (before discounts)
  discount_1_percent REAL DEFAULT 0,  -- First discount as percentage
  discount_1_amount REAL DEFAULT 0,   -- First discount as monetary amount
  discount_2_percent REAL DEFAULT 0,  -- Second discount as percentage
  discount_2_amount REAL DEFAULT 0,   -- Second discount as monetary amount
  gst_percent REAL DEFAULT 0,         -- GST/Tax percentage
  gst_amount REAL DEFAULT 0,          -- GST/Tax monetary amount
  sgst_amount REAL DEFAULT 0,         -- SGST (state GST) amount
  cgst_amount REAL DEFAULT 0,         -- CGST (central GST) amount
  final_amount REAL,                  -- Final amount after all discounts and tax
  gst_reverse INTEGER DEFAULT 0,      -- GST Reverse indicator (1 = enabled, 0 = disabled)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
);

-- Customer Item Memory: Customer product preferences and discount history
CREATE TABLE IF NOT EXISTS customer_item_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  discount_1 REAL DEFAULT 0,
  discount_2 REAL DEFAULT 0,
  scheme TEXT,
  tax_percent REAL DEFAULT 0,
  gst_reverse INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE(customer_id, product_id)
);

-- Payments: Payment and credit note records
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
  invoice_id INTEGER,
  notes TEXT,
  attachment_data TEXT,
  created_by_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

-- Ledger: Customer account summary and financial tracking
-- Stored as customer-level summary with aggregated totals
-- Tracks overall balance, debit/credit amounts, and transaction counts
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
);

-- ====================================================================
-- ORDERS MANAGEMENT TABLE
-- ====================================================================

-- Orders: 3-stage order management tracking
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
  status TEXT DEFAULT 'pending',
  created_by_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id)
);

-- Order Items: Line items in each order
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
);

-- ====================================================================
-- INDEXES for performance
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(active);
CREATE INDEX IF NOT EXISTS idx_contacts_last_activity ON contacts(last_activity);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_variant ON batches(variant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_batch ON invoice_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_stage ON orders(current_stage);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_batch ON order_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_status_checks_type ON status_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_status_checks_date ON status_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contact_access_user ON user_contact_access(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_module ON activity_log(module);
CREATE INDEX IF NOT EXISTS idx_owner_notifications_read ON owner_notifications(read);

-- Desktop State: Store desktop shortcuts and widgets per user
CREATE TABLE IF NOT EXISTS desktop_state (
  user_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES auth_credentials(id) ON DELETE CASCADE
);

-- Clock Settings: Account-wide time preferences and world clocks
CREATE TABLE IF NOT EXISTS clock_settings (
  user_id TEXT PRIMARY KEY,
  mode TEXT DEFAULT 'auto',
  timezone TEXT,
  cityName TEXT,
  manualOffset INTEGER DEFAULT 0,
  worldClocks TEXT DEFAULT '[]',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES auth_credentials(id) ON DELETE CASCADE
);

-- Weather Settings: Account-wide weather preferences
CREATE TABLE IF NOT EXISTS weather_settings (
  user_id TEXT PRIMARY KEY,
  city TEXT DEFAULT 'London',
  lat REAL DEFAULT 51.5074,
  lon REAL DEFAULT -0.1278,
  unit TEXT DEFAULT 'C',
  isExpanded INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES auth_credentials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_settings_device ON Settings(device_id);
CREATE INDEX IF NOT EXISTS idx_note_images_note_id ON note_images(note_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_clock_settings_user ON clock_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_weather_settings_user ON weather_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_quick_notes_updated ON quick_notes(updated_at);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  widget_id TEXT NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reminders_widget ON reminders(widget_id);

-- Cloud Storage: Track uploaded files metadata
CREATE TABLE IF NOT EXISTS cloud_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  path TEXT NOT NULL,
  space TEXT DEFAULT 'personal',
  share_token TEXT UNIQUE,
  share_password TEXT,
  share_expires_at DATETIME,
  share_download_limit INTEGER,
  share_download_count INTEGER DEFAULT 0,
  shared_at DATETIME,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  thumbnail_path TEXT
);


CREATE INDEX IF NOT EXISTS idx_cloud_files_uploaded_at ON cloud_files(uploaded_at);
-- Cloud Batch Shares: Track collections of files shared as a single link
CREATE TABLE IF NOT EXISTS cloud_batch_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  file_ids TEXT NOT NULL, -- JSON array of file IDs
  password TEXT,
  expires_at DATETIME,
  download_limit INTEGER,
  download_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI Vision: Track learned visual signatures for products and variants
CREATE TABLE IF NOT EXISTS product_visual_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  variant_id INTEGER,
  image_base64 TEXT NOT NULL,
  metadata TEXT, -- JSON holding batch format, design version, label notes
  learned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE
);
`;

module.exports = { schema };
