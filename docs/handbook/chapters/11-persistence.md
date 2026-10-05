# SQLite Persistence and Migrations

## Database Location and Ownership

`DatabaseManager` uses `better-sqlite3` and resolves the database path from the backend module location to `database/MacOS.db`; its backup directory is `database/backups/`. The database is initialized by `backend/main/macos-api-server.js` before domain departments are constructed. This makes startup order part of data ownership: services receive the already initialized connection rather than each opening their own database.

These paths are repository defaults, not a guarantee that every runtime uses the same mounted host directory. Docker bind mounts, working directory, environment and deployment scripts determine the effective production storage. Verify those before moving files or describing a backup target.

## Startup Lifecycle

The current initialization sequence in `DatabaseManager.initialize()` is:

1. Ensure the database backup directory exists.
2. Open or create the configured SQLite file.
3. Run table repair checks before enabling foreign-key enforcement.
4. Enable SQLite foreign keys.
5. Create missing tables from `schema-master.js`.
6. Run idempotent data migrations.
7. Clean unknown schema objects/extra columns according to the manager's policy.
8. Re-apply the master schema's create-if-missing statements.
9. Verify database integrity and return the shared connection.

Startup can alter a legacy database, not merely open it. Never point an exploratory local build at a production database. Before a schema change, review every initialization step and test against disposable copies representing both an empty database and the oldest supported database state.

`createTables()` first executes the master schema as a batch. If that fails, the current fallback splits statements and attempts them individually while suppressing some per-statement errors. Do not interpret the fallback log as proof every new constraint applied; inspect the resulting schema and integrity checks. Changes to this recovery code have broad startup impact and require dedicated migration tests.

## Table Families and Relationships

`schema-master.js` groups tables for contacts/notes/calendar, auth/users/audit, products/inventory, billing/ledger/orders, desktop services, cloud storage, and logs. The following is an orientation map; the SQL remains authoritative for nullable columns, uniqueness, defaults, indexes, and delete actions.

| Family | Representative records | Relationship to verify |
| --- | --- | --- |
| Contacts | `contacts` | Customer/vendor master referenced by billing and orders |
| Product catalog | `categories`, `products`, `variants`, `batches` | Product categories; variants belong to a product; batch uniqueness is scoped to variant and batch number |
| Invoices | `invoices`, `invoice_items` | Invoice references customer; items reference invoice and optional product/variant/batch; invoice-item deletion cascades from invoice |
| Payments and balances | `payments`, `ledger` | Payment references a customer and may reference an invoice; deleting invoice sets the linked payment invoice reference to null |
| Orders | `orders`, `order_items` | Orders reference customer; line items reference order and optionally catalog/batch rows |
| Authentication | `users`, `auth_sessions`, `auth_refresh_tokens`, `webauthn_challenges`, `auth_audit_events`, related tables | Read exact retention, uniqueness, and identity semantics from the current SQL and auth service |
| Desktop/cloud/operations | Settings, reminders, cloud files/shares, status and app log tables | Follow feature-specific modules for ownership and filesystem/blob relationships |

Some finance columns are declared SQLite `REAL`. Do not describe the storage as integer paise or promise a rounding invariant without checking the calculation, serializer and migration behavior. Also check unique constraints before assuming one-row-per-customer summaries: indexes are not automatically uniqueness constraints.

## Migration Safety Workflow

For a schema alteration:

1. Search all readers and writers of the target table and column; include Android and both browser apps where their payloads differ.
2. Decide whether the migration is additive, backfilling, constraint-changing, or destructive. State how old application code behaves during rollout.
3. Add an idempotent migration or an approved manager change that supports the supported existing schema. Document transaction requirements and restart behavior.
4. Test on an empty database, a representative legacy copy with synthetic data, and a second execution of the same migration. Assert foreign keys, indexes, data preservation, and the desired schema.
5. Verify backup creation and a restore path before any destructive operation. Never test recovery against the only copy of a database.
6. Update the schema reference and handbook with the migration identifier and compatibility floor.

Run `npm run migrate:ledger:preview` only for the ledger migration's documented preview path and inspect the script first; do not generalize its behavior to other migration code. `npm run migrate:ledger` is mutating and requires an approved target, fresh backup and explicit authorization.

## Backup and Runtime Files

The application creates a backup directory and the repository includes database/deployment tools, but this alone does not establish a production backup schedule, off-host retention, restore test, RPO, or RTO. Those belong in the owner-verified operations inventory. SQLite WAL mode is enabled by the manager; a live database may also have WAL-related sidecar files. Use a tested SQLite-aware backup procedure, not an uncoordinated file copy while writes are active.

Never include database files, production backups, user uploads, or real records in handbook artifacts. Use synthetic fixtures and schema diagrams only. Respect `.gitignore` and active Docker volume mounts when changing persistence paths.

## Schema Reference Maintenance

`docs/DATABASE_SCHEMA.md` and `docs/BILLING_DB_SCHEMA.md` are explanatory references. When editing them, verify against the current SQL and migrations, not only the prior document. Record relationships and delete actions exactly, distinguish a normal index from a unique index, and link the route/service that writes the data. If a table has no clear owner or migration path, record that as a gap rather than guessing.