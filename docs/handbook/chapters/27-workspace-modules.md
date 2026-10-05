# Notes, Calendar, and Cloud Storage

## Notes State and Persistence

The main Notes UI is `frontend/modules/notes/js/notes.js`. It loads note tiles first, then hydrates note contents and images in the background. The client tracks per-note states (`pristine`, `edited`, `syncing`, `synced`, `error`), a unified operation queue, adaptive debouncing, field-level changes, loading queues and ETags. Follow this state machine before changing autosave or editor rendering.

The backend Notes department route is mounted at `/api/notes` and normally receives the server's department auth middleware. It stores note headers/content in `notes` and images in `note_images`; the latter references note IDs with delete cascade. Current route family includes:

| Method/path | Purpose |
| --- | --- |
| `GET /` | List notes; `?minimal=true` returns tile metadata |
| `POST /` | Create note with required bounded ID/title and optional bounded content |
| `GET /:id` | Fetch note; ETag is derived from note title/content/update timestamp |
| `PUT /:id` | Update title/content; image work uses separate routes |
| `GET /events` | SSE connection for note events; declared before `/:id` |
| `POST /:id/stream` | Broadcast live content without a database write |
| `GET /:id/images/meta`, `GET /:id/images/:imageId` | Load image metadata/images separately |
| `POST /:id/images`, `DELETE /:id/images/:imageId` | Upload/delete one image |
| `DELETE /:id` | Delete note and related data according to handler behavior |

The browser uses a dedicated `BroadcastChannel('notes-sync')` for same-browser tabs and a separate EventSource for device synchronization. It reconnects the SSE stream and suppresses events carrying its own client ID. This path is not the same transport as `CoreDataBus`.

Live typing content uses `POST /:id/stream` and broadcasts without persisting each keystroke. Durable save operations are queued/debounced separately. Do not promise that a live stream was saved; inspect the queued persistence result and note ETag before displaying a synced state.

The server SSE registry is process-wide in memory and broadcasts events to connected clients. The route is under the authenticated `/api/notes` prefix, but event payload scoping should still be reviewed before claiming per-user isolation. The notes schema has no owner column in the current master declaration; verify intended shared-vs-private semantics with the product owner.

## Calendar CRUD

Calendar data is stored in `calendar_events` and the service exposes date-range and ID lookups plus create/update/delete. The current calendar router source registers `GET /` twice: first a status response, then the event-list handler. Because the first handler sends a response without calling `next()`, the list handler may not execute for the collection root. Treat this as an implementation discrepancy requiring a route test/fix, not as a valid documented API promise. The frontend API README is a discovery aid; use the live route/service behavior for commands and response shapes.

The inspected calendar service does not publish a CoreDataBus or backend SSE event. Do not assume a calendar edit appears in other open clients without polling/refetch behavior. Test list/range/get/create/update/delete, date sort, timezone conversion, and whether UI events invalidate the calendar view.

## Cloud Storage Ownership and Route Surface

The Cloud Storage department owns files, media, public shares and batch downloads. Its handler uses the root `CloudStorage` directory, stores metadata in `cloud_files`, generates image thumbnails with Sharp and video thumbnails with FFmpeg, and uses Archiver for batch ZIP delivery.

| Method/path under `/api/cloud` | Purpose | Access note |
| --- | --- | --- |
| `GET /`, `GET /stats` | File listing and storage stats | Routed through cloud auth wrapper except listed path exceptions |
| `POST /upload` | Multer upload and metadata insert | Checked-in Multer file-size limit is `Infinity`; review/set a bounded limit before exposing to untrusted clients |
| `GET /download/:id`, `GET /thumbnail/:id` | Internal file and thumbnail access | The API server has public/media path exceptions; confirm exactly which apply |
| `DELETE /:id`, `POST /rename` | Internal metadata/file mutations | Require authenticated route and ownership checks in handler |
| `POST /:id/share`, `POST /batch-share` | Create public share links | Tokens grant access; inspect expiry/revocation and data projection |
| `GET /share/:token`, `GET /share/:token/download` | Public shared preview/download | Explicit public exception; token entropy/expiry/revocation are security boundaries |
| `GET /share/batch/:token...`, `POST /share/batch/:token/revoke` | Batch share/download/ZIP/revoke | Public reads and token-authenticated revoke path need separate review |

The server auth wrapper exempts share/download/thumbnail subpaths before mounting the router. Route declaration order and handler authorization determine actual exposure. Never describe a shared URL as private after issuance; document what the token allows and how it is revoked.

## Storage and Failure Boundaries

Uploads are written by Multer before metadata insertion. If metadata insertion fails, the handler attempts file cleanup. Thumbnail creation runs asynchronously after a successful database insert; missing thumbnail is a separate media-processing state, not necessarily upload failure. Verify disk-full, MIME/content mismatch, path traversal, oversized file, unsupported FFmpeg/Sharp format, interrupted upload and cleanup behavior.

The reported storage quota may combine actual filesystem totals with application metadata totals. Do not call a displayed capacity a hard quota unless upload enforcement uses it. The current handler declares unlimited upload file size; review resource exhaustion and reverse-proxy limits before external exposure.

## Cross-Module Dependencies

- Contact cards can display billing-derived balances/activity; customer data reloads on billing events.
- Analytics views can reload from billing/contact/order events; scope must match worker permissions.
- Notes client transport is separate from the main CoreDataBus, so adding a CoreDataBus consumer does not automatically update note tabs.
- Cloud shares can contain customer documents; confirm retention, access audit and expiry requirements with the owner.

## Capture Slots

![Screenshot placeholder: Notes editor and calendar range](asset:screenshot-placeholder.svg)

**Figure APP-01. Notes editor and calendar view.** Use synthetic notes and dates; capture saved, syncing, offline/error and date-range states only when each has been verified. Record app revision, viewport and status.

![Screenshot placeholder: Cloud storage and public-share controls](asset:screenshot-placeholder.svg)

**Figure APP-02. Cloud storage and share controls.** Use synthetic files and a test share token only. Redact URLs/tokens before image capture, and show the revoke action without exposing a live link.