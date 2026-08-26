package com.example.macosbusinesssuite

import android.app.Application
import android.util.Log
import com.example.macosbusinesssuite.util.RemoteLogger

class App : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialize remote logger
        RemoteLogger.init(this)

        // Wire up global uncaught exception handler to capture crashes
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                RemoteLogger.logCrash(throwable, thread.name)
            } catch (e: Exception) {
                Log.w("App", "Failed to send crash to remote logger", e)
            }
            // Delegate to default handler (will terminate the process)
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }
}
