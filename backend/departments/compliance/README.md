# Compliance workspace data contract

The Directory & Compliance Dashboard and Compliance view use persisted records from `company_compliances` and `compliance_deadlines`. They do not generate statutory obligations or due dates. An empty database is shown as an empty/setup state.

## Workspace endpoints

- `GET /api/compliance/overview` returns compliance metrics, pending/overdue counts, upcoming deadlines, license expiry summaries, and recently recorded license/deadline rows.
- `GET /api/compliance/licenses` and `GET /api/compliance/deadlines` provide the saved records, including resolved staff, Vault document, and license labels where linked.
- `POST` and `PUT /api/compliance/licenses` support creating/editing license records. Supplying an expiry date creates a linked pending renewal deadline; edits synchronize that pending renewal.
- `POST`, `PUT`, `PATCH /api/compliance/deadlines/:id/status`, and `DELETE` support persisted deadline management.
- `GET /api/compliance/staff?status=ACTIVE` provides staff choices.
- `GET /api/compliance/vault/document-options` provides a bounded, metadata-only document lookup for associations; it does not return file data.

License associations are stored in `company_compliances.linked_staff_id` and `company_compliances.vault_document_id`. Deadline associations use `compliance_deadlines.staff_id` and `compliance_deadlines.vault_document_id`. These IDs are validated and use `ON DELETE SET NULL`.

Migration `027-compliance-record-links.js` adds the association columns to existing databases. Migration `028-remove-compliance-demo-records.js` removes only the exact former built-in example license records and their matching generated renewal deadlines. Compliance startup no longer seeds example license or deadline records.
