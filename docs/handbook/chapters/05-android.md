# Android POS

## Application Stack

Android source is under `android/app/src/main/`. The app uses Kotlin, Jetpack Compose, and Material 3. The version catalog is `android/gradle/libs.versions.toml`; project/build configuration is in `android/settings.gradle.kts` and Gradle build files.

Current checked-in app configuration:

| Setting | Value |
| --- | --- |
| JDK toolchain | 17 |
| Compile SDK | 36 |
| Target SDK | 36 |
| Minimum SDK | 24 |
| Kotlin plugin | 2.3.20 |
| Android Gradle Plugin | 9.3.2 |
| Compose BOM | 2026.03.01 |

The full library and plugin version catalog is the authority; versions governed by the Compose BOM may be intentionally omitted from individual entries.

![Android screenshot placeholder: billing and payment workflow](asset:screenshot-placeholder.svg)

**Figure AND-01. Android billing and payment workflow.** Capture the screen on an emulator or approved test device with synthetic records. Include device model/API level, display size/density, app revision, and the visible payment state.

![Android screenshot placeholder: customer ledger and settings](asset:screenshot-placeholder.svg)

**Figure AND-02. Android customer ledger and settings.** Capture both the ledger state and the relevant settings screen using a synthetic customer. Hide notifications, account identifiers, network addresses, and debug information.

## Build and Test

From `android/`:

```powershell
.\gradlew.bat tasks
.\gradlew.bat app:dependencies
.\gradlew.bat testDebugUnitTest
.\gradlew.bat assembleDebug
```

Use `./gradlew` on macOS/Linux. Device and instrumented tests require an emulator or connected device plus the Android SDK. A successful host unit-test task does not certify hardware, camera, scanner, biometric, or network behavior.

## Release Signing Warning

The current release signing configuration falls back to the debug keystore when an app release keystore is absent, and has development defaults for signing properties. Therefore a successful release build is not evidence of a production-signed artifact. Confirm the approved keystore and secret-injection process before publishing; never include signing material or passwords in the handbook.

Android deployment commands are separate from web deployment:

```powershell
npm run deploy:android:test
npm run deploy:android:prod
```

Review `deploy/android/publish.sh` and the active Android workflow before using either command against a release channel.