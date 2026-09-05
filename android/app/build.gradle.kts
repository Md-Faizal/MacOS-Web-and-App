plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.example.macosbusinesssuite"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.example.macosbusinesssuite"
        minSdk = 24
        targetSdk = 36
        val providedVersionCode = (project.findProperty("versionCode") ?: "1").toString().trim()
        versionCode = providedVersionCode.toIntOrNull() ?: 1
        versionName = project.findProperty("versionName")?.toString()?.takeIf { it.isNotBlank() } ?: "1.0"
    }

    signingConfigs {
        getByName("debug") {
            storeFile = file("app-debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        create("release") {
            val releaseKeystore = file("app-release.keystore")
            if (releaseKeystore.exists()) {
                storeFile = releaseKeystore
                storePassword = project.findProperty("KEYSTORE_PASSWORD")?.toString() ?: "android"
                keyAlias = project.findProperty("KEY_ALIAS")?.toString() ?: "androiddebugkey"
                keyPassword = project.findProperty("KEY_PASSWORD")?.toString() ?: "android"
            } else {
                storeFile = file("app-debug.keystore")
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
      compose = true
      aidl = false
      buildConfig = true
      shaders = false
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.fragment.ktx)
  implementation(libs.androidx.biometric)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Arch Components
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.material.icons.extended)

  // Networking & JSON
  implementation(libs.retrofit.core)
  implementation(libs.retrofit.converter.gson)
  implementation(libs.okhttp.core)
  implementation(libs.okhttp.logging)
  implementation(libs.gson)

  // Auth & Credentials
  implementation("androidx.credentials:credentials:1.3.0-rc01")
  implementation("androidx.credentials:credentials-play-services-auth:1.3.0-rc01")
  implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)
  // Instrumented tests
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)

  // Local tests: jUnit, coroutines, Android runner
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Instrumented tests: jUnit rules and runners
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)

  // Navigation
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)
  implementation("androidx.navigation:navigation-compose:2.7.7")
}

