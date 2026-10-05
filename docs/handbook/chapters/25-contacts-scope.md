# Contacts, Worker Access, and Retention

## Contact Master Data

The Contacts department owns customer/party master data and exposes `/api/contacts`. The main browser app is `frontend/modules/contacts/js/contacts.js`; it loads the contact collection, renders a list and selected contact card, and subscribes to both contact and billing events so customer sales/balance summaries can refresh.

The API list joins creator/editor identity, invoice totals/averages, favorite product, current due, latest invoice and payment timestamps. For worker sessions it also joins `user_contact_access` to apply per-worker `exclude_from_stats` and `disable_duplex_export` values. Values displayed on a contact card are computed aggregates; the `contacts.total_sales` and `avg_sales` columns are not necessarily the active source for every UI calculation.

## Owner and Worker Scope

The contact engine's worker scope includes contacts explicitly assigned through `user_contact_access`, contacts created by a worker, and contacts created by any worker according to the SQL predicate. Owner/admin requests do not receive that worker predicate in the helper. Read the exact scope used by each endpoint before assuming uniform authorization.

When a worker creates a contact, the handler stores the contact in the shared master table and associates the worker in `user_contact_access`. Admin/master defaults are set to exclude worker-created contacts from admin statistics and duplex export, while the worker's own access row can retain the worker's preferences. Worker updates to `exclude_from_stats` and `disable_duplex_export` write per-worker association settings; shared profile fields are updated on the contact row. This makes the effective preference user-scoped rather than a single global contact property.

Contact access list/update routes are explicitly unavailable to workers; the UI's “share with worker” action is an owner/admin capability. Sharing updates are performed in a DB transaction and insert/remove access association rows. Validate worker IDs/roles and contact existence at the current handler before relying on the UI as a security boundary.

## Browser Create/Edit/Refresh

The main browser form posts/puts `/api/contacts`, then publishes a local contact event, patches the reactive store and reloads the canonical collection. Billing events also cause a contact reload so computed balances/sales can update. The UI updates the contact card/list in place where possible; verify scroll preservation and selected-contact behavior when changing render logic.

Use only synthetic names, email, phone, tax/license identifiers and opening balances in screenshots. Never use real customer records in fixtures or handbook examples.

## Destructive Contact Deletion

The current `deleteContact` handler uses a database transaction and explicitly attempts to delete these dependent records before deleting the contact:

| Data family | Current deletion behavior in the handler |
| --- | --- |
| `user_contact_access` | Removes worker assignment rows |
| Invoice items | Deletes rows belonging to invoices for the contact |
| Invoices | Deletes invoices for the contact |
| Payments | Deletes payment and unified credit-note rows for the contact |
| Orders | Deletes orders for the contact |
| Customer item memory | Deletes saved per-customer product preferences |
| Ledger | Deletes customer-level ledger row |
| Contact | Deletes the master contact row last |

This is not a soft-delete or mere directory removal. It can erase accounting/order history linked to the contact. Several delete statements are individually wrapped in empty catches inside the transaction; inspect exact effects and test failure behavior rather than assuming every dependent delete succeeded because the final response was successful.

Do not advise production contact deletion as ordinary cleanup. Before changing or operating this route, obtain accounting/legal retention approval, verify a restorable backup, and define an archive/anonymization policy that preserves required invoice/audit history. Add tests proving the intended retained/deleted rows and rollback semantics. UI confirmation text is not a retention policy.

## Activity Status

The activity endpoint counts invoices, payments, credit notes and orders in the preceding 30 days, then derives `ACTIVE` or `INACTIVE` and stores `last_activity`. The handler's `updateAllActivityStatuses` can apply a worker contact scope; inspect whether single-customer status calls apply the same permission check and whether they mutate data for that worker. Do not equate this operational activity flag with customer-credit risk or regulatory account status.

## Contact Test Matrix

| Scenario | Verify |
| --- | --- |
| Owner lists all contacts | Aggregates and master preferences match source rows |
| Worker lists contacts | Only allowed scope appears; per-worker visibility preferences are joined correctly |
| Worker creates a contact | Creator/access association and distinct master/worker flags |
| Worker updates preferences | Access row changes without overwriting owner-level flags |
| Owner shares/unshares a contact | Transaction updates associations; worker access changes on next request |
| Worker attempts access administration | Server returns denied status even if UI is bypassed |
| Billing event changes customer aggregates | Contact list/card reloads from canonical API data |
| Contact delete fails mid-cleanup | Transaction rollback and all history retention invariants |
| Duplicate/similar customer names | ID resolution never silently targets the wrong customer |

## Capture Slot

![Screenshot placeholder: contact list, selected customer card, and worker sharing](asset:screenshot-placeholder.svg)

**Figure CRM-01. Contact profile and worker sharing.** Capture list/search, selected card and owner-only sharing UI with synthetic profile fields and test users. Record role, build revision, viewport, and which preferences are master versus per-worker. Redact every name, contact detail, tax/license number and balance.