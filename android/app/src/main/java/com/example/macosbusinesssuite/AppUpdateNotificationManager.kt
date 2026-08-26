package com.example.macosbusinesssuite

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import com.example.macosbusinesssuite.data.model.AndroidUpdateManifest
import java.io.File

/**
 * Manages interactive Material 3 notifications for the Android OTA update system.
 *
 * Fixes & Improvements:
 * - Throttles progress updates to prevent notification alert flickering every second.
 * - Enables NotificationCompat.BigTextStyle so notifications are expandable in the notification shade.
 * - Uses setOnlyAlertOnce(true) for smooth silent progress updates.
 */
object AppUpdateNotificationManager {

    private const val CHANNEL_ID = "ota_update_channel"
    private const val CHANNEL_NAME = "Software Updates"
    private const val CHANNEL_DESC = "Notifications for Android over-the-air app updates and installations."

    const val NOTIFICATION_ID_AVAILABLE = 1001
    const val NOTIFICATION_ID_DOWNLOADING = 1002
    const val NOTIFICATION_ID_READY_TO_INSTALL = 1003
    const val NOTIFICATION_ID_POST_INSTALL = 1004

    // Throttling state for smooth progress bar updates without sound spam
    private var lastProgressTime: Long = 0L
    private var lastProgressPercent: Int = -1

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = CHANNEL_DESC
                enableVibration(true)
                setShowBadge(true)
            }
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    /**
     * Show "Software Update Available" notification.
     */
    fun showUpdateAvailableNotification(context: Context, manifest: AndroidUpdateManifest) {
        createNotificationChannel(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("navigate_to", "software_updates")
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val bigStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle("Software Update Available: v${manifest.versionName}")
            .bigText(
                "Version ${manifest.versionName} (Build ${manifest.versionCode}) is ready to download.\n" +
                        "Size: ${AppUpdateUtils.formatBytes(manifest.fileSize)}\n\n" +
                        if (manifest.releaseNotes.isNotBlank()) "Release Notes:\n${manifest.releaseNotes}" else "Includes system optimizations and security patches."
            )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Software Update Available: v${manifest.versionName}")
            .setContentText("Version ${manifest.versionName} (Build ${manifest.versionCode}) • Tap to view details.")
            .setSubText("Update System")
            .setStyle(bigStyle)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .addAction(
                android.R.drawable.ic_menu_view,
                "View Details",
                pendingIntent
            )
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID_AVAILABLE, notification)
    }

    /**
     * Show "Downloading Update" progress notification with throttling and expandable style.
     */
    fun showDownloadingNotification(
        context: Context,
        progressPercent: Int,
        downloadedMB: String,
        totalMB: String,
        speedMBps: String = "",
        etaFormatted: String = ""
    ) {
        val now = System.currentTimeMillis()
        // Only update notification if progress changed by >= 5% or >= 1.5s passed since last post
        if (progressPercent != 100 &&
            Math.abs(progressPercent - lastProgressPercent) < 5 &&
            (now - lastProgressTime) < 1500
        ) {
            return
        }

        lastProgressTime = now
        lastProgressPercent = progressPercent

        createNotificationChannel(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val speedText = if (speedMBps.isNotBlank()) " • $speedMBps" else ""
        val etaText = if (etaFormatted.isNotBlank() && etaFormatted != "--:--") " • ETA $etaFormatted" else ""

        val bigStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle("Downloading Software Update… ($progressPercent%)")
            .bigText(
                "Progress: $downloadedMB / $totalMB ($progressPercent%)$speedText$etaText\n" +
                        "Resumable HTTP Stream with SHA-256 Checksum Verification."
            )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Downloading Update ($progressPercent%)")
            .setContentText("$downloadedMB / $totalMB$speedText")
            .setProgress(100, progressPercent, false)
            .setStyle(bigStyle)
            .setOngoing(true)
            .setOnlyAlertOnce(true) // Crucial: prevents sound/alert flickering on every progress step!
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setContentIntent(pendingIntent)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID_DOWNLOADING, notification)
    }

    /**
     * Cancel downloading progress notification.
     */
    fun cancelDownloadingNotification(context: Context) {
        lastProgressPercent = -1
        lastProgressTime = 0L
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTIFICATION_ID_DOWNLOADING)
    }

    /**
     * Show "Update Ready to Install" notification targeting package installer.
     */
    fun showReadyToInstallNotification(
        context: Context,
        apkFile: File,
        versionName: String,
        versionCode: Int
    ) {
        createNotificationChannel(context)
        cancelDownloadingNotification(context)

        val installUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        } else {
            Uri.fromFile(apkFile)
        }

        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(installUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val installPendingIntent = PendingIntent.getActivity(
            context, 1003, installIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val bigStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle("Update Ready to Install: v$versionName")
            .bigText(
                "Version $versionName (Build $versionCode) has passed SHA-256 checksum verification.\n" +
                        "Tap 'Install Now' to finish upgrading your application."
            )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Update Ready to Install: v$versionName")
            .setContentText("Tap to launch system installer (Build $versionCode).")
            .setStyle(bigStyle)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(installPendingIntent)
            .addAction(
                android.R.drawable.ic_menu_save,
                "Install Now",
                installPendingIntent
            )
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID_READY_TO_INSTALL, notification)
    }

    /**
     * Show post-install success notification.
     */
    fun showPostInstallSuccessNotification(context: Context, versionName: String, versionCode: Int) {
        createNotificationChannel(context)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTIFICATION_ID_READY_TO_INSTALL)
        manager.cancel(NOTIFICATION_ID_AVAILABLE)

        val bigStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle("Software Upgraded Successfully 🎉")
            .bigText(
                "You are now running version v$versionName (Build $versionCode).\n" +
                        "All system patches, database schema updates, and security features are now active."
            )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Software Upgraded Successfully 🎉")
            .setContentText("Now running v$versionName (Build $versionCode).")
            .setStyle(bigStyle)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        manager.notify(NOTIFICATION_ID_POST_INSTALL, notification)
    }

    fun dismissAllUpdateNotifications(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTIFICATION_ID_AVAILABLE)
        manager.cancel(NOTIFICATION_ID_DOWNLOADING)
        manager.cancel(NOTIFICATION_ID_READY_TO_INSTALL)
    }
}
