package com.example.macosbusinesssuite.util

import android.content.Context
import android.util.Log
import com.example.macosbusinesssuite.data.api.NetworkClient
import com.example.macosbusinesssuite.data.api.SessionManager
import com.example.macosbusinesssuite.data.model.AppLogRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.security.MessageDigest

object RemoteLogger {
    private var sessionManager: SessionManager? = null
    private var enabled: Boolean = true

    fun init(context: Context) {
        sessionManager = SessionManager(context.applicationContext)
        enabled = sessionManager?.remoteLoggingEnabled ?: true
    }

    fun log(level: String = "INFO", message: String, throwable: Throwable? = null, metadata: Map<String, String>? = null) {
        try {
            val sm = sessionManager ?: return
            enabled = sm.remoteLoggingEnabled
            val stack = throwable?.let { Log.getStackTraceString(it) }
            val sessionFingerprint = sm.authToken?.let { token ->
                MessageDigest.getInstance("SHA-256")
                    .digest(token.toByteArray())
                    .joinToString("") { byte -> "%02x".format(byte) }
                    .take(16)
            } ?: ""
            val req = AppLogRequest(
                sessionId = sessionFingerprint,
                deviceId = sm.serverUrl,
                userId = sm.userEmail ?: "",
                userName = sm.userName ?: "",
                level = level,
                message = message,
                stack = stack,
                metadata = metadata,
                timestamp = java.util.Date().toString()
            )

            // Persist locally always (lightweight), so user can clear later
            try {
                val json = com.google.gson.Gson().toJson(req)
                sm.appendLocalLog(json)
            } catch (_: Exception) {}

            if (!enabled) return

            val api = NetworkClient.getService(sm)
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val resp = api.postAppLog(req)
                    if (!resp.isSuccessful) {
                        Log.w("RemoteLogger", "Failed to send log: ${resp.code()} ${resp.message()}")
                    }
                } catch (e: Exception) {
                    Log.w("RemoteLogger", "Error sending log", e)
                }
            }
        } catch (e: Exception) {
            Log.w("RemoteLogger", "Logger init error", e)
        }
    }

    fun logCrash(throwable: Throwable, threadName: String? = null) {
        val msg = "Uncaught exception on thread ${threadName ?: "main"}: ${throwable.message}"
        log("CRASH", msg, throwable, mapOf("thread" to (threadName ?: "")))
    }

    fun clearLocalLogs() {
        sessionManager?.clearLocalLogs()
    }

    fun localLogsCount(): Int {
        return sessionManager?.localLogsCount() ?: 0
    }

    fun setEnabled(value: Boolean) {
        enabled = value
        sessionManager?.remoteLoggingEnabled = value
    }
}
