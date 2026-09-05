package com.example.macosbusinesssuite.util

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

object BiometricAuthHelper {

    enum class BiometricStatus {
        AVAILABLE,
        NOT_ENROLLED,
        NOT_SUPPORTED,
        HARDWARE_UNAVAILABLE
    }

    /**
     * Checks if biometric authentication can be performed on this device.
     */
    fun checkBiometricAvailability(context: Context): BiometricStatus {
        return try {
            val biometricManager = BiometricManager.from(context)
            val strongRes = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            if (strongRes == BiometricManager.BIOMETRIC_SUCCESS) return BiometricStatus.AVAILABLE
            if (strongRes == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) return BiometricStatus.NOT_ENROLLED

            val weakRes = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
            if (weakRes == BiometricManager.BIOMETRIC_SUCCESS) return BiometricStatus.AVAILABLE
            if (weakRes == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) return BiometricStatus.NOT_ENROLLED

            val combinedRes = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK)
            when (combinedRes) {
                BiometricManager.BIOMETRIC_SUCCESS -> BiometricStatus.AVAILABLE
                BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> BiometricStatus.NOT_ENROLLED
                BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> BiometricStatus.NOT_SUPPORTED
                BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> BiometricStatus.HARDWARE_UNAVAILABLE
                else -> BiometricStatus.NOT_SUPPORTED
            }
        } catch (e: Exception) {
            android.util.Log.w("BiometricAuthHelper", "Biometric check failed safely", e)
            BiometricStatus.NOT_SUPPORTED
        }
    }

    /**
     * Shows the native Android BiometricPrompt.
     */
    fun authenticate(
        activity: FragmentActivity,
        title: String = "Biometric Sign In",
        subtitle: String = "Confirm your fingerprint or face to continue",
        description: String? = null,
        negativeButtonText: String = "Use Password",
        onSuccess: (BiometricPrompt.AuthenticationResult) -> Unit,
        onError: (errorCode: Int, errString: String) -> Unit,
        onFailed: () -> Unit
    ) {
        val executor = ContextCompat.getMainExecutor(activity)

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .apply {
                if (!description.isNullOrBlank()) {
                    setDescription(description)
                }
            }
            .setNegativeButtonText(negativeButtonText)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK)
            .build()

        val biometricPrompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    onSuccess(result)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    onError(errorCode, errString.toString())
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    onFailed()
                }
            }
        )

        biometricPrompt.authenticate(promptInfo)
    }
}
