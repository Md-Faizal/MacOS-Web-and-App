package com.example.macosbusinesssuite.data.api

import android.content.Context
import android.content.SharedPreferences

class SessionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREF_NAME = "macos_business_suite_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_AUTH_COOKIE = "auth_cookie"
        private const val KEY_IS_LOGGED_IN = "is_logged_in"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_NAME = "user_name"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_USER_ROLE = "user_role"
        private const val KEY_USER_STATUS = "user_status"
        private const val KEY_USER_PICTURE = "user_picture"
        private const val KEY_UPDATE_CHANNEL = "update_channel"
        private const val KEY_PERMISSIONS_JSON = "permissions_json"
        private const val KEY_TOKEN_VERSION = "token_version"
        private const val KEY_BIOMETRIC_ENABLED = "biometric_enabled"
        private const val KEY_KEEP_LOGGED_IN = "keep_logged_in"
        private const val KEY_MARQUEE_ENABLED = "marquee_enabled"
        private const val KEY_REMOTE_LOGGING_ENABLED = "remote_logging_enabled"
        private const val KEY_LOCAL_LOGS = "local_logs_json"
        private const val KEY_AUTO_UPDATE_CHECK_ENABLED = "auto_update_check_enabled"
        private const val KEY_CACHED_APK_PATH = "cached_apk_path"
        private const val KEY_CACHED_APK_VERSION_CODE = "cached_apk_version_code"
        private const val KEY_CACHED_APK_VERSION_NAME = "cached_apk_version_name"
        private const val KEY_LAST_INSTALLED_VERSION_CODE = "last_installed_version_code"

        const val DEFAULT_PRODUCTION_URL = "https://mac.faizal.uk/api/"
        const val DEFAULT_LOCAL_DEV_URL = "http://10.0.2.2:3002/api/"
    }

    var authToken: String?
        get() = prefs.getString(KEY_AUTH_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_AUTH_TOKEN, value).apply()

    var serverUrl: String
        get() {
            var url = prefs.getString(KEY_SERVER_URL, DEFAULT_PRODUCTION_URL) ?: DEFAULT_PRODUCTION_URL
            if (!url.endsWith("/")) {
                url += "/"
            }
            if (!url.contains("/api/")) {
                if (url.endsWith("/")) url += "api/" else url += "/api/"
            }
            return url
        }
        set(value) {
            var formatted = value.trim()
            if (!formatted.endsWith("/")) formatted += "/"
            prefs.edit().putString(KEY_SERVER_URL, formatted).apply()
        }

    var authCookie: String?
        get() = prefs.getString(KEY_AUTH_COOKIE, null)
        set(value) = prefs.edit().putString(KEY_AUTH_COOKIE, value).apply()

    var isLoggedIn: Boolean
        get() = prefs.getBoolean(KEY_IS_LOGGED_IN, false)
        set(value) = prefs.edit().putBoolean(KEY_IS_LOGGED_IN, value).apply()

    var userId: String?
        get() = prefs.getString(KEY_USER_ID, null)
        set(value) = prefs.edit().putString(KEY_USER_ID, value).apply()

    var userName: String?
        get() = prefs.getString(KEY_USER_NAME, null)
        set(value) = prefs.edit().putString(KEY_USER_NAME, value).apply()

    var userEmail: String?
        get() = prefs.getString(KEY_USER_EMAIL, "")
        set(value) = prefs.edit().putString(KEY_USER_EMAIL, value).apply()

    var userRole: String
        get() = prefs.getString(KEY_USER_ROLE, "worker") ?: "worker"
        set(value) = prefs.edit().putString(KEY_USER_ROLE, value).apply()

    val isOwner: Boolean
        get() = userRole == "owner" || userRole == "admin"

    var userStatus: String
        get() = prefs.getString(KEY_USER_STATUS, "active") ?: "active"
        set(value) = prefs.edit().putString(KEY_USER_STATUS, value).apply()

    var userPicture: String?
        get() = prefs.getString(KEY_USER_PICTURE, null)
        set(value) = prefs.edit().putString(KEY_USER_PICTURE, value).apply()

    var updateChannel: String
        get() = prefs.getString(KEY_UPDATE_CHANNEL, "production") ?: "production"
        set(value) = prefs.edit().putString(KEY_UPDATE_CHANNEL, value).apply()

    var permissionsJson: String?
        get() = prefs.getString(KEY_PERMISSIONS_JSON, null)
        set(value) = prefs.edit().putString(KEY_PERMISSIONS_JSON, value).apply()

    var tokenVersion: Int
        get() = prefs.getInt(KEY_TOKEN_VERSION, 0)
        set(value) = prefs.edit().putInt(KEY_TOKEN_VERSION, value).apply()

    var biometricEnabled: Boolean
        get() = prefs.getBoolean(KEY_BIOMETRIC_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_BIOMETRIC_ENABLED, value).apply()

    var keepLoggedIn: Boolean
        get() = prefs.getBoolean(KEY_KEEP_LOGGED_IN, false)
        set(value) = prefs.edit().putBoolean(KEY_KEEP_LOGGED_IN, value).apply()

    var marqueeEnabled: Boolean
        get() = prefs.getBoolean(KEY_MARQUEE_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_MARQUEE_ENABLED, value).apply()

    var remoteLoggingEnabled: Boolean
        get() = prefs.getBoolean(KEY_REMOTE_LOGGING_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_REMOTE_LOGGING_ENABLED, value).apply()

    var autoUpdateCheckEnabled: Boolean
        get() = prefs.getBoolean(KEY_AUTO_UPDATE_CHECK_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_AUTO_UPDATE_CHECK_ENABLED, value).apply()

    var cachedApkPath: String?
        get() = prefs.getString(KEY_CACHED_APK_PATH, null)
        set(value) = prefs.edit().putString(KEY_CACHED_APK_PATH, value).apply()

    var cachedApkVersionCode: Int
        get() = prefs.getInt(KEY_CACHED_APK_VERSION_CODE, 0)
        set(value) = prefs.edit().putInt(KEY_CACHED_APK_VERSION_CODE, value).apply()

    var cachedApkVersionName: String?
        get() = prefs.getString(KEY_CACHED_APK_VERSION_NAME, null)
        set(value) = prefs.edit().putString(KEY_CACHED_APK_VERSION_NAME, value).apply()

    var lastInstalledVersionCode: Int
        get() = prefs.getInt(KEY_LAST_INSTALLED_VERSION_CODE, 0)
        set(value) = prefs.edit().putInt(KEY_LAST_INSTALLED_VERSION_CODE, value).apply()

    fun setCachedApkInfo(path: String, versionCode: Int, versionName: String) {
        prefs.edit()
            .putString(KEY_CACHED_APK_PATH, path)
            .putInt(KEY_CACHED_APK_VERSION_CODE, versionCode)
            .putString(KEY_CACHED_APK_VERSION_NAME, versionName)
            .apply()
    }

    fun clearCachedApkInfo() {
        prefs.edit()
            .remove(KEY_CACHED_APK_PATH)
            .remove(KEY_CACHED_APK_VERSION_CODE)
            .remove(KEY_CACHED_APK_VERSION_NAME)
            .apply()
    }

    fun appendLocalLog(entryJson: String) {
        val current = prefs.getString(KEY_LOCAL_LOGS, null)
        val updated = if (current.isNullOrEmpty()) {
            "[" + entryJson + "]"
        } else {
            current.dropLast(1) + "," + entryJson + "]"
        }
        prefs.edit().putString(KEY_LOCAL_LOGS, updated).apply()
    }

    fun clearLocalLogs() {
        prefs.edit().remove(KEY_LOCAL_LOGS).apply()
    }

    fun localLogsCount(): Int {
        val current = prefs.getString(KEY_LOCAL_LOGS, null) ?: return 0
        return try {
            val arr = org.json.JSONArray(current)
            arr.length()
        } catch (_: Exception) { 0 }
    }

    fun clearSession() {
        prefs.edit().apply {
            remove(KEY_AUTH_TOKEN)
            remove(KEY_AUTH_COOKIE)
            putBoolean(KEY_IS_LOGGED_IN, false)
            remove(KEY_USER_ID)
            remove(KEY_USER_NAME)
            remove(KEY_USER_EMAIL)
            remove(KEY_USER_ROLE)
            remove(KEY_USER_STATUS)
            remove(KEY_USER_PICTURE)
            remove(KEY_PERMISSIONS_JSON)
            remove(KEY_TOKEN_VERSION)
            apply()
        }
    }
}
