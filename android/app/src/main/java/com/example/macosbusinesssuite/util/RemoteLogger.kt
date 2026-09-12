package com.example.macosbusinesssuite.util

import android.content.Context
import android.content.pm.PackageInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.util.Log
import com.example.macosbusinesssuite.data.api.NetworkClient
import com.example.macosbusinesssuite.data.api.SessionManager
import com.example.macosbusinesssuite.data.model.AppLogBatchRequest
import com.example.macosbusinesssuite.data.model.AppLogRequest
import com.example.macosbusinesssuite.data.model.LogBreadcrumb
import com.google.gson.Gson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * RemoteLogger - Industrial-Standard Mobile Telemetry & Error Logging Client
 *
 * Capabilities:
 * - Breadcrumbs Ring Buffer: Records navigation, network events, and user actions.
 * - Device Telemetry: Automatically captures brand, model, Android version, app version, RAM, battery, network type.
 * - Offline Persistence: Buffers unsent logs in local storage and flushes in batches.
 * - Crash Safe: Synchronous flush on uncaught exceptions.
 * - Non-blocking: Uses Coroutine IO dispatcher for minimal app overhead.
 */
object RemoteLogger {
    private var appContext: Context? = null
    private var sessionManager: SessionManager? = null
    private var enabled: Boolean = true
    private val gson = Gson()
    private val flushMutex = Mutex()

    // Fixed capacity ring buffer for breadcrumbs (most recent 25 events)
    private val MAX_BREADCRUMBS = 25
    private val breadcrumbsQueue = ConcurrentLinkedQueue<LogBreadcrumb>()

    // Local offline queue (persisted in SharedPreferences)
    private const val PREFS_LOG_QUEUE = "remote_logger_offline_queue"
    private const val KEY_PENDING_LOGS = "pending_logs_json_array"
    private const val MAX_OFFLINE_LOGS = 100

    fun init(context: Context) {
        val app = context.applicationContext
        appContext = app
        sessionManager = SessionManager.getInstance(app)
        enabled = sessionManager?.remoteLoggingEnabled ?: true

        // Attempt flush of previously pending logs on startup
        flushOfflineLogsAsync()
    }

    /**
     * Add an event breadcrumb to track user journey leading to an error
     */
    fun addBreadcrumb(category: String, message: String, data: Map<String, String>? = null) {
        try {
            val crumb = LogBreadcrumb(
                category = category,
                message = message,
                data = data,
                timestamp = System.currentTimeMillis()
            )
            breadcrumbsQueue.add(crumb)
            while (breadcrumbsQueue.size > MAX_BREADCRUMBS) {
                breadcrumbsQueue.poll()
            }
        } catch (_: Exception) {}
    }

    fun debug(message: String, metadata: Map<String, String>? = null) = log("DEBUG", message, null, metadata)
    fun info(message: String, metadata: Map<String, String>? = null) = log("INFO", message, null, metadata)
    fun warn(message: String, throwable: Throwable? = null, metadata: Map<String, String>? = null) = log("WARN", message, throwable, metadata)
    fun error(message: String, throwable: Throwable? = null, metadata: Map<String, String>? = null) = log("ERROR", message, throwable, metadata)

    fun log(level: String = "INFO", message: String, throwable: Throwable? = null, metadata: Map<String, String>? = null) {
        try {
            val ctx = appContext ?: return
            val sm = sessionManager ?: return
            enabled = sm.remoteLoggingEnabled

            val stack = throwable?.let { Log.getStackTraceString(it) }
            val sessionFingerprint = sm.authToken?.let { token ->
                MessageDigest.getInstance("SHA-256")
                    .digest(token.toByteArray())
                    .joinToString("") { byte -> "%02x".format(byte) }
                    .take(16)
            } ?: ""

            // Combine provided metadata with device telemetry
            val telemetryMap = getDeviceTelemetry(ctx).toMutableMap()
            metadata?.let { telemetryMap.putAll(it) }

            val packageInfo: PackageInfo? = try {
                ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            } catch (_: Exception) { null }

            val appVer = packageInfo?.versionName ?: "1.0.0"
            val osVer = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
            val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(Date())

            val req = AppLogRequest(
                sessionId = sessionFingerprint,
                deviceId = "${Build.MANUFACTURER} ${Build.MODEL}",
                userId = sm.userEmail ?: sm.userId ?: "",
                userName = sm.userName ?: "",
                level = level.uppercase(),
                platform = "android",
                appVersion = appVer,
                osVersion = osVer,
                message = message,
                stack = stack,
                breadcrumbs = breadcrumbsQueue.toList(),
                metadata = telemetryMap,
                timestamp = isoDate
            )

            // Persist locally in offline queue
            queueLogLocally(ctx, req)

            if (!enabled) return

            // If error or crash, flush immediately; otherwise trigger async flush
            if (level.equals("CRASH", ignoreCase = true) || level.equals("ERROR", ignoreCase = true)) {
                flushOfflineLogsAsync(forceSyncIfPossible = level.equals("CRASH", ignoreCase = true))
            } else {
                flushOfflineLogsAsync(forceSyncIfPossible = false)
            }
        } catch (e: Exception) {
            Log.w("RemoteLogger", "Logger error", e)
        }
    }

    /**
     * Log an uncaught application crash with stack trace & breadcrumbs
     */
    fun logCrash(throwable: Throwable, threadName: String? = null) {
        val msg = "Fatal uncaught crash on thread [${threadName ?: "main"}]: ${throwable.javaClass.simpleName} - ${throwable.message}"
        log("CRASH", msg, throwable, mapOf("thread" to (threadName ?: "main")))
    }

    /**
     * Collect real-time device health & context
     */
    private fun getDeviceTelemetry(context: Context): Map<String, String> {
        val map = mutableMapOf<String, String>()
        try {
            map["brand"] = Build.BRAND
            map["manufacturer"] = Build.MANUFACTURER
            map["model"] = Build.MODEL
            map["device"] = Build.DEVICE
            map["android_version"] = Build.VERSION.RELEASE
            map["sdk_int"] = Build.VERSION.SDK_INT.toString()

            // Memory telemetry
            val actManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? android.app.ActivityManager
            actManager?.let {
                val memInfo = android.app.ActivityManager.MemoryInfo()
                it.getMemoryInfo(memInfo)
                map["free_ram_mb"] = (memInfo.availMem / (1024 * 1024)).toString()
                map["total_ram_mb"] = (memInfo.totalMem / (1024 * 1024)).toString()
                map["low_ram"] = memInfo.lowMemory.toString()
            }

            // Battery telemetry
            val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            bm?.let {
                val level = it.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                map["battery_pct"] = "$level%"
            }

            // Network telemetry
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val netType = cm?.let {
                val network = it.activeNetwork ?: return@let "Offline"
                val caps = it.getNetworkCapabilities(network) ?: return@let "Offline"
                when {
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Cellular"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                    else -> "Connected"
                }
            } ?: "Unknown"
            map["network_type"] = netType
        } catch (_: Exception) {}
        return map
    }

    /**
     * Safely buffer log payload in persistent SharedPreferences
     */
    private fun queueLogLocally(context: Context, log: AppLogRequest) {
        try {
            val prefs = context.getSharedPreferences(PREFS_LOG_QUEUE, Context.MODE_PRIVATE)
            val existingJson = prefs.getString(KEY_PENDING_LOGS, "[]") ?: "[]"
            val type = object : com.google.gson.reflect.TypeToken<MutableList<AppLogRequest>>() {}.type
            val list: MutableList<AppLogRequest> = gson.fromJson(existingJson, type) ?: mutableListOf()

            list.add(log)
            // Trim oldest if exceeded
            while (list.size > MAX_OFFLINE_LOGS) {
                list.removeAt(0)
            }

            prefs.edit().putString(KEY_PENDING_LOGS, gson.toJson(list)).apply()
        } catch (e: Exception) {
            Log.w("RemoteLogger", "Failed to queue log locally", e)
        }
    }

    /**
     * Flush all buffered offline logs to backend via POST /api/logs/batch
     */
    fun flushOfflineLogsAsync(forceSyncIfPossible: Boolean = false) {
        val ctx = appContext ?: return
        val sm = sessionManager ?: return
        if (!enabled) return

        val flushBlock = suspend {
            flushMutex.withLock {
                try {
                    val prefs = ctx.getSharedPreferences(PREFS_LOG_QUEUE, Context.MODE_PRIVATE)
                    val json = prefs.getString(KEY_PENDING_LOGS, null) ?: return@withLock
                    val type = object : com.google.gson.reflect.TypeToken<MutableList<AppLogRequest>>() {}.type
                    val pending: MutableList<AppLogRequest> = gson.fromJson(json, type) ?: return@withLock
                    if (pending.isEmpty()) return@withLock

                    val api = NetworkClient.getService(sm)
                    val resp = api.postAppLogBatch(AppLogBatchRequest(logs = pending))
                    if (resp.isSuccessful) {
                        prefs.edit().remove(KEY_PENDING_LOGS).apply()
                    } else {
                        Log.w("RemoteLogger", "Batch flush returned HTTP ${resp.code()}")
                    }
                } catch (e: Exception) {
                    Log.w("RemoteLogger", "Batch flush network error: ${e.message}")
                }
            }
        }

        if (forceSyncIfPossible) {
            try {
                kotlinx.coroutines.runBlocking(Dispatchers.IO) {
                    flushBlock()
                }
            } catch (_: Exception) {}
        } else {
            CoroutineScope(Dispatchers.IO).launch {
                flushBlock()
            }
        }
    }

    fun clearLocalLogs() {
        appContext?.let {
            it.getSharedPreferences(PREFS_LOG_QUEUE, Context.MODE_PRIVATE).edit().clear().apply()
        }
        breadcrumbsQueue.clear()
    }

    fun pendingLogsCount(): Int {
        val ctx = appContext ?: return 0
        val prefs = ctx.getSharedPreferences(PREFS_LOG_QUEUE, Context.MODE_PRIVATE)
        val json = prefs.getString(KEY_PENDING_LOGS, "[]") ?: "[]"
        return try {
            val type = object : com.google.gson.reflect.TypeToken<List<AppLogRequest>>() {}.type
            val list: List<AppLogRequest> = gson.fromJson(json, type) ?: emptyList()
            list.size
        } catch (_: Exception) { 0 }
    }

    fun setEnabled(value: Boolean) {
        enabled = value
        sessionManager?.remoteLoggingEnabled = value
    }
}
