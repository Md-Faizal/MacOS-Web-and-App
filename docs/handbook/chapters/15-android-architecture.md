# Android Navigation and Session Architecture

## Navigation Composition

`Navigation.kt` collects login state, theme, profile, active user, server URL and permissions from `MainViewModel`. It derives visible bottom tabs from module permissions for billing, products, contacts and analytics. If no module is allowed, current code falls back to showing Billing; inspect the server permission model and UI guard before describing that fallback as access control.

Authenticated top-level tabs are rendered through `AnimatedContent`. The tab body switches among `BillingScreen`, `ProductsScreen`, `ContactsScreen`, and `AnalyticsScreen`. Profile, Settings, and Server Configuration are handled as separate top-level states. A subpage flag hides the floating navigation bar. Back handling returns to the default visible tab or requires a second press to exit.

## Login and Billing Hydration

When login state changes to unauthenticated, navigation clears billing data and returns to the default visible tab. When authenticated, it hydrates cached billing state using the current user identifier, then invokes a network load. This order is an explicit cache/network lifecycle; inspect `BillingViewModel` before assuming that cache is fresh or that network reconciliation completes before first render.

When tabs change, Contacts triggers its own load in the navigation callback. The other tab loads are delegated to their screen/view-model. Treat each tab as owning its own lifecycle; do not assume switching to a screen runs one global refresh.

## Dynamic Server Configuration

The current server URL is exposed as state and passed to UI features that build links. `NetworkClient.getService()` reads `SessionManager.serverUrl` and recreates its Retrofit service when the configured value changes. Settings can update the URL through `MainViewModel`; inspect normalization and persistence before describing accepted input format. This is why Android API calls cannot be documented as permanently targeting localhost or a single hard-coded deployment hostname.

The network client uses OkHttp with request interceptors and an authenticator. The session manager supplies the bearer token/refresh token. The cookie jar deliberately excludes browser session-cookie names. Debug HTTP logging is configured at `NONE` in the inspected client; never enable payload/token logging on production builds without a reviewed redaction policy.

## Permission and Screen Matrix

| Screen family | Entry | State/data owner to inspect |
| --- | --- | --- |
| Login/authentication | `ui/screens/auth/` | Main auth flow, API service, SessionManager |
| Billing/invoices/payments | `ui/screens/billing/` | BillingViewModel, repository and backend billing contracts |
| Products/inventory | `ui/screens/products/` | Product screen/ViewModel and products routes |
| Contacts | `ui/screens/contacts/` | Contacts data flow and privacy/permission scope |
| Analytics | `ui/screens/analytics/` | API aggregation, filters and permission boundary |
| Profile | `ui/screens/profile/` | MainViewModel and profile API routes |
| Settings | `ui/screens/settings/` | MainViewModel preferences and device/server settings |
| Server configuration/update | `ui/screens/server/` | Config URL, update channel and update API |

Each screen may have a ViewModel and repository deeper in its package. Use the smallest relevant source/test rather than loading every Compose screen into context.

## Device/Release Checks

- JDK toolchain is configured as 17; compile/target SDK are 36 and minimum SDK is 24 in the checked-in app Gradle file.
- Run JVM tests separately from emulator/device instrumented tests.
- Camera, scanner, biometric, network-change, offline and lifecycle behavior need device testing where applicable.
- A successful `assembleRelease` is not production-signing proof because release configuration can fall back to the debug keystore when the intended release keystore is absent.
- The source contains a hard-coded credential-like request header; do not copy its value. Require revocation/removal/rotation and an app release review before production use.
- Capture screenshots with test accounts/records only; specify API level, screen dimensions/density, build revision and scenario.