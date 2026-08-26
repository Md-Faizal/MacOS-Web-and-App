package com.example.macosbusinesssuite

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Enterprise-grade Android OTA update engine.
 *
 * Provides industrial-standard failsafes at every stage:
 * - Pre-download:  disk space, battery, network, SDK compatibility checks
 * - Download:      OkHttp with progress tracking, exponential retry, resume support
 * - Post-download: SHA-256 verification, file size verification, corrupt file cleanup
 * - Install:       FileProvider URI, permission guidance, intent resolution fallback
 */
object AppUpdateUtils {

    // ─── Download Progress Model ────────────────────────────────────────────

    data class DownloadProgress(
        val bytesDownloaded: Long,
        val totalBytes: Long,
        val progress: Float, // 0.0 to 1.0
        val downloadedMB: String,
        val totalMB: String,
        val speedMBps: String = "0.0 MB/s",
        val etaSeconds: Long = 0L,
        val etaFormatted: String = "--:--"
    )

    sealed class DownloadResult {
        data class Success(val file: File, val sha256: String) : DownloadResult()
        data class Error(val message: String, val retryable: Boolean = true) : DownloadResult()
    }

    // ─── Version Comparison ─────────────────────────────────────────────────

    /**
     * Compare semver version strings (e.g., "1.2.3" vs "1.2.4").
     * Returns true if [remoteVersionName] is strictly newer than [currentVersionName].
     */
    fun isNewerVersion(remoteVersionName: String?, currentVersionName: String?): Boolean {
        if (remoteVersionName.isNullOrBlank() || currentVersionName.isNullOrBlank()) return false
        val remote = remoteVersionName.split('.').mapNotNull { it.toIntOrNull() }
        val current = currentVersionName.split('.').mapNotNull { it.toIntOrNull() }
        val maxLen = maxOf(remote.size, current.size)
        for (index in 0 until maxLen) {
            val remoteValue = remote.getOrElse(index) { 0 }
            val currentValue = current.getOrElse(index) { 0 }
            if (remoteValue > currentValue) return true
            if (remoteValue < currentValue) return false
        }
        return false
    }

    /**
     * Get the cached APK File if it exists on disk and is non-empty.
     */
    fun getCachedApkFile(sessionManager: com.example.macosbusinesssuite.data.api.SessionManager): File? {
        val path = sessionManager.cachedApkPath ?: return null
        val file = File(path)
        return if (file.exists() && file.length() > 0) file else null
    }

    /**
     * Check if a cached APK exists, its version code is greater than [currentVersionCode],
     * and its SHA-256 checksum matches [expectedSha256] (anti-corruption protection).
     *
     * If expectedSha256 is provided and hashes do NOT match, automatically deletes the corrupted cached file!
     */
    fun hasValidCachedApk(
        context: Context,
        sessionManager: com.example.macosbusinesssuite.data.api.SessionManager,
        currentVersionCode: Int,
        expectedSha256: String? = null
    ): Boolean {
        val file = getCachedApkFile(sessionManager) ?: return false
        val cachedCode = sessionManager.cachedApkVersionCode
        if (cachedCode <= currentVersionCode || !file.exists() || file.length() == 0L) {
            return false
        }

        // SHA-256 Anti-Corruption Check
        if (!expectedSha256.isNullOrBlank()) {
            val actualSha256 = computeSha256(file)
            if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                // Corrupted cached APK detected! Clear it automatically.
                clearCachedApk(context, sessionManager)
                return false
            }
        }
        return true
    }

    /**
     * Delete the cached APK from disk and clear metadata from SessionManager.
     */
    fun clearCachedApk(
        context: Context,
        sessionManager: com.example.macosbusinesssuite.data.api.SessionManager
    ) {
        val file = getCachedApkFile(sessionManager)
        file?.delete()
        sessionManager.clearCachedApkInfo()
        cleanupOldApks(context, keepFile = null)
    }

    // ─── Pre-Download Checks ────────────────────────────────────────────────

    data class PreflightResult(
        val canProceed: Boolean,
        val warnings: List<String>,
        val errors: List<String>
    )

    /**
     * Run all pre-download safety checks before initiating a download.
     *
     * @param context       Application context
     * @param fileSizeBytes Expected APK size from the manifest
     * @param minSdkVersion Minimum SDK version required by the APK
     */
    fun runPreflightChecks(
        context: Context,
        fileSizeBytes: Long,
        minSdkVersion: Int
    ): PreflightResult {
        val warnings = mutableListOf<String>()
        val errors = mutableListOf<String>()

        // 1. SDK compatibility
        if (Build.VERSION.SDK_INT < minSdkVersion) {
            errors.add("This update requires Android API $minSdkVersion but your device runs API ${Build.VERSION.SDK_INT}.")
        }

        // 2. Disk space check (require file size + 50MB headroom)
        val headroomBytes = 50 * 1024 * 1024L // 50MB
        val requiredBytes = fileSizeBytes + headroomBytes
        val availableBytes = getAvailableStorageBytes(context)
        if (availableBytes < requiredBytes) {
            val requiredMB = requiredBytes / 1024 / 1024
            val availableMB = availableBytes / 1024 / 1024
            errors.add("Not enough storage space. Need ${requiredMB}MB but only ${availableMB}MB available.")
        }

        // 3. Battery level check (warn below 20%)
        val batteryPct = getBatteryPercentage(context)
        if (batteryPct in 0..19) {
            warnings.add("Battery is at $batteryPct%. Consider charging before updating to avoid interruption.")
        }

        // 4. Network type check (warn on metered connection for large APKs)
        if (fileSizeBytes > 10 * 1024 * 1024 && isMeteredConnection(context)) {
            warnings.add("You're on a metered connection. This download is ${fileSizeBytes / 1024 / 1024}MB.")
        }

        return PreflightResult(
            canProceed = errors.isEmpty(),
            warnings = warnings,
            errors = errors
        )
    }

    private fun getAvailableStorageBytes(context: Context): Long {
        return try {
            val downloadsDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: context.filesDir
            val stat = StatFs(downloadsDir.absolutePath)
            stat.availableBlocksLong * stat.blockSizeLong
        } catch (_: Exception) {
            Long.MAX_VALUE // Fail open if we can't check
        }
    }

    private fun getBatteryPercentage(context: Context): Int {
        return try {
            val batteryStatus = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) (level * 100 / scale) else 100
        } catch (_: Exception) {
            100 // Fail open
        }
    }

    private fun isMeteredConnection(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        } catch (_: Exception) {
            false
        }
    }

    // ─── Download Engine ────────────────────────────────────────────────────

    private val downloadClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private const val MAX_RETRIES = 3
    private val RETRY_DELAYS_MS = longArrayOf(2000, 4000, 8000)

    /**
     * Download an APK with progress tracking, resume support, and automatic retry.
     *
     * Downloads to a `.tmp` file first, then atomically renames on success.
     * Emits [DownloadProgress] via a cold Flow.
     *
     * @param apkUrl     Fully resolved download URL
     * @param outputFile Final destination path for the APK
     * @param expectedSha256 Expected SHA-256 checksum (null to skip verification)
     * @param expectedSize   Expected file size in bytes (0 to skip verification)
     */
    fun downloadApk(
        apkUrl: String,
        outputFile: File,
        expectedSha256: String?,
        expectedSize: Long
    ): Flow<DownloadResult> = flow {
        val tmpFile = File(outputFile.parentFile, "${outputFile.name}.tmp")
        outputFile.parentFile?.mkdirs()

        var lastError: String? = null

        for (attempt in 0 until MAX_RETRIES) {
            if (attempt > 0) {
                val delayMs = RETRY_DELAYS_MS.getOrElse(attempt - 1) { 8000L }
                delay(delayMs)
            }

            try {
                val result = executeDownload(apkUrl, tmpFile, outputFile, expectedSha256, expectedSize)
                emit(result)
                return@flow
            } catch (e: IOException) {
                lastError = "Attempt ${attempt + 1}/$MAX_RETRIES failed: ${e.message}"
                // Don't delete tmp file — the next attempt may resume from it
            } catch (e: Exception) {
                lastError = e.message ?: "Unknown download error"
                tmpFile.delete()
                emit(DownloadResult.Error(lastError, retryable = false))
                return@flow
            }
        }

        // All retries exhausted
        tmpFile.delete()
        emit(DownloadResult.Error(lastError ?: "Download failed after $MAX_RETRIES attempts", retryable = true))
    }.flowOn(Dispatchers.IO)

    /**
     * Download an APK with progress callbacks (for ViewModel integration).
     * This is the non-Flow variant for direct use.
     */
    suspend fun downloadApkWithProgress(
        apkUrl: String,
        outputFile: File,
        expectedSha256: String?,
        expectedSize: Long,
        onProgress: (DownloadProgress) -> Unit
    ): DownloadResult = withContext(Dispatchers.IO) {
        val tmpFile = File(outputFile.parentFile, "${outputFile.name}.tmp")
        outputFile.parentFile?.mkdirs()

        var lastError: String? = null

        for (attempt in 0 until MAX_RETRIES) {
            if (attempt > 0) {
                val delayMs = RETRY_DELAYS_MS.getOrElse(attempt - 1) { 8000L }
                delay(delayMs)
            }

            try {
                return@withContext executeDownloadWithProgress(
                    apkUrl, tmpFile, outputFile, expectedSha256, expectedSize, onProgress
                )
            } catch (e: IOException) {
                lastError = "Attempt ${attempt + 1}/$MAX_RETRIES failed: ${e.message}"
            } catch (e: Exception) {
                lastError = e.message ?: "Unknown download error"
                tmpFile.delete()
                return@withContext DownloadResult.Error(lastError, retryable = false)
            }
        }

        tmpFile.delete()
        DownloadResult.Error(lastError ?: "Download failed after $MAX_RETRIES attempts", retryable = true)
    }

    private fun executeDownload(
        apkUrl: String,
        tmpFile: File,
        outputFile: File,
        expectedSha256: String?,
        expectedSize: Long
    ): DownloadResult {
        return executeDownloadWithProgress(apkUrl, tmpFile, outputFile, expectedSha256, expectedSize) { /* no-op */ }
    }

    private fun executeDownloadWithProgress(
        apkUrl: String,
        tmpFile: File,
        outputFile: File,
        expectedSha256: String?,
        expectedSize: Long,
        onProgress: (DownloadProgress) -> Unit
    ): DownloadResult {
        val requestBuilder = Request.Builder().url(apkUrl)

        // Resume support: if tmp file exists, request remaining bytes
        val existingBytes = if (tmpFile.exists()) tmpFile.length() else 0L
        if (existingBytes > 0) {
            requestBuilder.addHeader("Range", "bytes=$existingBytes-")
        }

        val response = downloadClient.newCall(requestBuilder.build()).execute()
        if (!response.isSuccessful && response.code != 206) {
            throw IOException("HTTP ${response.code}: ${response.message}")
        }

        val responseBody = response.body ?: throw IOException("Empty response body")

        // Determine total size from Content-Length or Content-Range
        val contentLength = responseBody.contentLength()
        val totalBytes = if (response.code == 206) {
            // Partial content — parse total from Content-Range header
            val contentRange = response.header("Content-Range")
            contentRange?.substringAfterLast('/')?.toLongOrNull() ?: (existingBytes + contentLength)
        } else {
            contentLength
        }

        // If the server returned full content (200), start from scratch
        val append = response.code == 206

        val outputStream = if (append) tmpFile.outputStream().apply {
            channel.position(existingBytes)
        } else {
            tmpFile.outputStream()
        }

        val startOffset = if (append) existingBytes else 0L

        outputStream.use { out ->
            responseBody.byteStream().use { input ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                var totalDownloaded = startOffset

                var lastSpeedCalcTime = System.currentTimeMillis()
                var lastSpeedCalcBytes = startOffset
                var currentSpeedBytesPerSec = 0.0

                while (input.read(buffer).also { bytesRead = it } != -1) {
                    out.write(buffer, 0, bytesRead)
                    totalDownloaded += bytesRead

                    val now = System.currentTimeMillis()
                    val timeDeltaSec = (now - lastSpeedCalcTime) / 1000.0
                    if (timeDeltaSec >= 0.5) {
                        val bytesDelta = totalDownloaded - lastSpeedCalcBytes
                        currentSpeedBytesPerSec = bytesDelta / timeDeltaSec
                        lastSpeedCalcTime = now
                        lastSpeedCalcBytes = totalDownloaded
                    }

                    val progress = if (totalBytes > 0) {
                        (totalDownloaded.toFloat() / totalBytes).coerceIn(0f, 1f)
                    } else 0f

                    val remainingBytes = maxOf(0L, totalBytes - totalDownloaded)
                    val etaSec = if (currentSpeedBytesPerSec > 0) (remainingBytes / currentSpeedBytesPerSec).toLong() else 0L

                    onProgress(
                        DownloadProgress(
                            bytesDownloaded = totalDownloaded,
                            totalBytes = totalBytes,
                            progress = progress,
                            downloadedMB = formatMB(totalDownloaded),
                            totalMB = formatMB(totalBytes),
                            speedMBps = formatSpeed(currentSpeedBytesPerSec),
                            etaSeconds = etaSec,
                            etaFormatted = formatEta(etaSec)
                        )
                    )
                }
            }
        }

        // ─── Post-download verification ─────────────────────────────────

        // File size verification
        if (expectedSize > 0 && tmpFile.length() != expectedSize) {
            tmpFile.delete()
            throw IOException("Size mismatch: expected $expectedSize bytes, got ${tmpFile.length()} bytes")
        }

        // SHA-256 verification
        if (!expectedSha256.isNullOrBlank()) {
            val actualSha256 = computeSha256(tmpFile)
            if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                tmpFile.delete()
                return DownloadResult.Error(
                    "Integrity check failed. Expected SHA-256: ${expectedSha256.take(16)}..., got: ${actualSha256.take(16)}...",
                    retryable = true
                )
            }
        }

        // Atomic rename: tmp → final
        if (outputFile.exists()) outputFile.delete()
        if (!tmpFile.renameTo(outputFile)) {
            // Fallback: copy + delete (cross-filesystem)
            tmpFile.copyTo(outputFile, overwrite = true)
            tmpFile.delete()
        }

        val finalSha256 = computeSha256(outputFile)
        return DownloadResult.Success(outputFile, finalSha256)
    }

    // ─── SHA-256 Computation ────────────────────────────────────────────────

    /**
     * Compute SHA-256 checksum of a file.
     */
    fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { fis ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (fis.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    // ─── APK Cleanup ────────────────────────────────────────────────────────

    /**
     * Remove previously downloaded APK files to free space.
     * Keeps only the specified [keepFile] if provided.
     */
    fun cleanupOldApks(context: Context, keepFile: File? = null) {
        try {
            val downloadsDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return
            downloadsDir.listFiles()?.forEach { file ->
                if (file.name.endsWith(".apk") && file != keepFile) {
                    file.delete()
                }
                if (file.name.endsWith(".apk.tmp")) {
                    file.delete()
                }
            }
        } catch (_: Exception) { /* best effort */ }
    }

    // ─── Install ────────────────────────────────────────────────────────────

    /**
     * Check if the app has permission to install packages from unknown sources.
     */
    fun canInstallPackages(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    /**
     * Open system settings to enable "Install unknown apps" for this app.
     */
    fun openInstallPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    /**
     * Launch the system APK installer for the downloaded file.
     */
    fun openInstallPrompt(context: Context, apkFile: File) {
        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        } else {
            Uri.fromFile(apkFile)
        }

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        if (intent.resolveActivity(context.packageManager) != null) {
            context.startActivity(intent)
        } else {
            // Fallback: guide user to enable unknown sources
            val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(settingsIntent)
        }
    }

    // ─── Formatting Utilities ───────────────────────────────────────────────

    fun formatMB(bytes: Long): String {
        return if (bytes <= 0) "0 MB"
        else String.format("%.1f MB", bytes.toDouble() / 1024 / 1024)
    }

    fun formatSpeed(bytesPerSec: Double): String {
        return when {
            bytesPerSec <= 0 -> "0.0 MB/s"
            bytesPerSec < 1024 * 1024 -> String.format("%.0f KB/s", bytesPerSec / 1024.0)
            else -> String.format("%.1f MB/s", bytesPerSec / (1024.0 * 1024))
        }
    }

    fun formatEta(etaSeconds: Long): String {
        if (etaSeconds <= 0 || etaSeconds > 3600 * 24) return "--:--"
        val mins = etaSeconds / 60
        val secs = etaSeconds % 60
        return String.format("%02d:%02d", mins, secs)
    }

    fun formatBytes(bytes: Long): String {
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
            bytes < 1024 * 1024 * 1024 -> String.format("%.1f MB", bytes / (1024.0 * 1024))
            else -> String.format("%.2f GB", bytes / (1024.0 * 1024 * 1024))
        }
    }
}
