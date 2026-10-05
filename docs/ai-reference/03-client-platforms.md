# Client Platform Map

## Main MacOS Browser Application

| Concern | Start here | Follow the call to |
| --- | --- | --- |
| HTML entry | `frontend/index.html` or `frontend/home.html` | Script imports and initialization order |
| Vite entries and dev proxy | `vite.config.js` | `/api` or `/storage` request target |
| Desktop shell and app launch | `frontend/scripts/` | App registry, window constructor, teardown |
| Shared client state | `frontend/shared/` | Store, event bus, cache and consumers |
| Billing | `frontend/modules/billing/` | Billing API client, view class, route and server handler |
| Product list | `frontend/modules/product-list/` | Product API client, mutation, inventory event |
| Contacts | `frontend/modules/contacts/` | Contact state, API request, server contract |
| Analytics | `frontend/modules/analytics/` | Filter/period state, data source, chart output |
| Notes/calendar | Feature module directory | API path, user-state lifecycle, persistence owner |
| Desktop widgets | `frontend/modules/widgets/` | Widget request and desktop API subroute |
| Shared notifications | `frontend/shared/notifications.js` and CSS | App call sites and cross-tab event handlers |
| Client logs | `frontend/shared/logger.js` | Scope creation and diagnostic export consumers |
| Rust bridge | Search `suite_core` imports in `frontend/shared/` | WASM loader, exported symbol and fallback path |

## Main Web Request Checks

- Main web forms should call same-origin `/api/...` where supported by the configured proxy/server arrangement.
- Confirm whether fetches go through `BillingAPI` or another shared wrapper before treating cache/dedup as global.
- Trace mutation method, API result, cache invalidation, event broadcast, and render separately.
- A component may be mounted but hidden in a keep-alive panel; visibility is not equivalent to destruction or unsubscription.
- Loading, empty, optimistic, failed, and server-confirmed states should be documented distinctly.
- Verify keyboard, resize, mobile, and window-manager behavior at the component owner rather than inferring from the desktop shell.

## Zentra React/TypeScript Dashboard

| Concern | Start here | Follow the call to |
| --- | --- | --- |
| Entry and React boot | `zentra-analytics-dashboard/src/` entry module | Router/provider and app shell |
| Build and plugin config | `zentra-analytics-dashboard/vite.config.ts` | `package.json` command and output |
| TypeScript settings | `zentra-analytics-dashboard/tsconfig.json` | Compiler strictness and aliases |
| API access | Search the exact `/api/` path under `src/` | Root server route and response contract |
| Protected views | Find route guard/access component | Server auth mode and permission endpoint |
| Dashboard filters | Find filter state owner | Query params/request payload and server aggregation |
| UI icons | Existing `lucide-react` imports | Keep visual conventions local to this app |

Zentra is not the main vanilla frontend. It has its own `node_modules` context, package lock, Vite major, API environment target, build and deploy workflow. The backend can also serve/proxy `/zentra`; distinguish that path from the standalone Vite port-3000 development server.

## Android POS

| Concern | Start here | Follow the call to |
| --- | --- | --- |
| App root/navigation | `android/app/src/main/java/` navigation and activity files | Destination route and state owner |
| Screens | `ui/screens/` | ViewModel or state holder and action callback |
| Network base | `data/api/NetworkClient.kt` | `SessionManager.serverUrl`, Retrofit service and interceptor |
| API payloads | `data/api/` interfaces/models | Matching backend route contract |
| Login and refresh | Auth screen/repository plus `NetworkClient` | Mobile login/refresh/logout routes |
| Server selection | Settings UI and `SessionManager` | Persistence and NetworkClient rebuild |
| App release | `app/build.gradle.kts`, release workflow, publisher script | Signing config and output channel |

The app is Kotlin and Jetpack Compose with Material 3 configured in Gradle. Do not call a screen "Material 3 Expressive" unless its actual theme/components support that claim. UI screenshots must name app build, API level, device/viewport and synthetic data scenario.

## Rust Callers and Targets

- Begin at `shared/suite_core/src/lib.rs`; confirm module visibility before describing public API.
- Inspect `Cargo.toml` features and `cfg` declarations before claiming WASM/JNI availability.
- For browser integration, locate the bridge and the consumer's invocation; a generated `.wasm` asset alone is not proof.
- For Node integration, locate the FFI/native binding and the actual server call site.
- For Android integration, locate NDK/JNI exports, Kotlin native declarations, packaged library and caller.
- Run host Rust tests and target-specific checks separately; report unsupported target setup clearly.
- Keep parity tests mapped to both the Rust function and the JS/Kotlin contract they intend to compare.