# App Logs Module

Purpose
- Store and expose mobile app logs and crash reports centrally for remote inspection.

Endpoints
- POST /api/logs/app
  - Purpose: Accept log entries from mobile clients.
  - Payload (JSON):
    {
      "session_id": "<session-token-or-id>",
      "device_id": "<device-id>",
      "user_id": "<user-id-or-email>",
      "user_name": "<display-name>",
      "level": "INFO|ERROR|CRASH",
      "message": "Log message",
      "stack": "stacktrace (optional)",
      "metadata": { "key": "value" },
      "timestamp": "ISO timestamp (optional)"
    }
  - Response: `{ "success": true }` on success.

- GET /api/logs
  - Purpose: Inspect stored logs with filtering and search.
  - Query params:
    - `limit` (default 100)
    - `level` (e.g., `ERROR`, `CRASH`, `INFO`)
    - `user_id` or `userId`
    - `search` (substring match against message, stack, metadata)
    - `since` / `until` (ISO datetimes)
  - Response: `{ success: true, count: N, logs: [ ... ] }`
  - Example:
    ```bash
    curl -H "Authorization: Bearer <token>" \
      "http://localhost:3002/api/logs?limit=50&level=ERROR&search=collected"
    ```

Database
- Table: `app_logs`
- Columns (created in `backend/core/db/schema-master.js`):
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `session_id` TEXT
  - `device_id` TEXT
  - `user_id` TEXT
  - `user_name` TEXT
  - `level` TEXT
  - `message` TEXT
  - `stack` TEXT
  - `metadata` TEXT (JSON)
  - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

Code locations
- Routes: `backend/core/logs/routes.js`
- Handlers: `backend/core/logs/handlers.js`
- DB schema: `backend/core/db/schema-master.js`
- Server mount: `backend/main/macos-api-server.js` (mounted at `/api/logs`)

Auth / Security
- The GET `/api/logs` endpoint is protected by the existing auth middleware — include valid session cookie or `Authorization` header.
- POST `/api/logs/app` is currently public to allow clients to send logs before full auth (if desired). Add auth if you want only authenticated clients to post logs.

Inspecting logs directly
- DB path (development): `database/MacOS.db`
- Example SQL:
  ```sql
  SELECT id, session_id, device_id, user_id, level, message, created_at
  FROM app_logs
  ORDER BY created_at DESC
  LIMIT 100;
  ```

Testing
- Send a test log from a device or via `curl`:
  ```bash
  curl -X POST http://localhost:3002/api/logs/app \
    -H "Content-Type: application/json" \
    -d '{"level":"INFO","message":"test log from curl","user_id":"tester"}'
  ```

Notes
- The GET endpoint supports basic search and time-range filters but is not paginated beyond `limit`. If you need pagination, I can add `offset`/`page` support.
- If you want logs forwarded to external services (Sentry, Datadog), we can add a background forwarder.
