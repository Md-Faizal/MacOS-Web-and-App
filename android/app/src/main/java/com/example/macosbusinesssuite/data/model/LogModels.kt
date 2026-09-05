package com.example.macosbusinesssuite.data.model

import com.google.gson.annotations.SerializedName

/**
 * LogBreadcrumb - Lightweight record of user action or system event leading up to an issue
 */
data class LogBreadcrumb(
    @SerializedName("category") val category: String = "ui", // "ui", "navigation", "network", "lifecycle"
    @SerializedName("message") val message: String = "",
    @SerializedName("data") val data: Map<String, String>? = null,
    @SerializedName("timestamp") val timestamp: Long = System.currentTimeMillis()
)

/**
 * AppLogRequest - Industrial-standard structured mobile telemetry & error payload
 */
data class AppLogRequest(
    @SerializedName("session_id") val sessionId: String? = null,
    @SerializedName("device_id") val deviceId: String? = null,
    @SerializedName("user_id") val userId: String? = null,
    @SerializedName("user_name") val userName: String? = null,
    @SerializedName("level") val level: String = "INFO", // DEBUG, INFO, WARN, ERROR, CRASH
    @SerializedName("platform") val platform: String = "android",
    @SerializedName("app_version") val appVersion: String? = null,
    @SerializedName("os_version") val osVersion: String? = null,
    @SerializedName("message") val message: String = "",
    @SerializedName("stack") val stack: String? = null,
    @SerializedName("breadcrumbs") val breadcrumbs: List<LogBreadcrumb>? = null,
    @SerializedName("metadata") val metadata: Map<String, String>? = null,
    @SerializedName("status") val status: String = "open",
    @SerializedName("timestamp") val timestamp: String? = null
)

/**
 * AppLogBatchRequest - Payload for flushing multiple queued offline logs in a single HTTP request
 */
data class AppLogBatchRequest(
    @SerializedName("logs") val logs: List<AppLogRequest> = emptyList()
)
