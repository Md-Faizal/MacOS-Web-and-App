# Remote Logging (Android)

Overview
- The Android app includes a lightweight `RemoteLogger` utility to send logs and crash reports to the backend `/api/logs` endpoints.
- A global crash handler is wired in `App.kt` to capture uncaught exceptions and send them as `CRASH` logs.

Key files
- `android/app/src/main/java/com/example/macosbusinesssuite/util/RemoteLogger.kt` — client that posts `AppLogRequest` to the server via Retrofit.
- `android/app/src/main/java/com/example/macosbusinesssuite/App.kt` — `Application` subclass that initializes `RemoteLogger` and sets a default uncaught exception handler.
- `android/app/src/main/java/com/example/macosbusinesssuite/data/api/ApiService.kt` — new method `postAppLog(AppLogRequest)`.
- `android/app/src/main/java/com/example/macosbusinesssuite/data/model/Models.kt` — `AppLogRequest` model.

How it works
- `RemoteLogger.init(context)` is called from `App.onCreate()` to set up `SessionManager` usage.
- `RemoteLogger.log(level, message, throwable?, metadata?)` sends a JSON payload to `POST /api/logs/app` asynchronously.
- Uncaught exceptions are sent with `level = "CRASH"` and include the stack trace.

Developer usage
- Manually send a log from anywhere in the app:
  ```kotlin
  RemoteLogger.log("INFO", "User opened dashboard", null, mapOf("screen" to "dashboard"))
  ```

- Force-send a test crash (for testing only):
  ```kotlin
  throw RuntimeException("Test crash to verify RemoteLogger")
  ```
  The global handler will send the crash; the process will still be terminated by the default handler.

Testing and verification
1. Ensure backend server (dev) is running at `http://localhost:3002`.
2. Install the debug APK built with the RemoteLogger included.
3. Trigger a test log or crash.
4. Inspect logs via the backend inspection endpoint:
   ```bash
   curl -H "Authorization: Bearer <token>" "http://localhost:3002/api/logs?limit=50&search=test"
   ```

Configuration notes
- The logger uses `SessionManager` for best-effort fields (`sessionId`, `userId`, `userName`). Ensure `SessionManager` is populated (user logged in) to get richer log metadata.
- If you want logs to include a stable `device_id`, consider adding a `device_id` stored once in `SharedPreferences` (e.g., UUID).

Privacy & Retention
- Logs are stored in plaintext in the local server DB. If logs may contain PII, consider redaction or hashing before sending.
- We can add retention policies (e.g., delete logs older than N days) if needed.

Next improvements (optional)
- Add a small in-app debug screen to send test logs and show last-send status.
- Add pagination and advanced filters to the GET `/api/logs` endpoint.
- Forward CRASH-level logs to an external crash-inspection service.

