package com.example.macosbusinesssuite.util

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class GoogleAuthHelper(private val context: Context) {
    private val credentialManager = CredentialManager.create(context)
    
    // Server Client ID from backend/ecosystem.config.js
    private val WEB_CLIENT_ID = "540487611333-t0i54c3b0k07nuoaljkdr68otst89se5.apps.googleusercontent.com"

    private fun Context.findActivity(): Activity? {
        var currentContext = this
        while (currentContext is ContextWrapper) {
            if (currentContext is Activity) {
                return currentContext
            }
            currentContext = currentContext.baseContext
        }
        return null
    }

    suspend fun signInWithGoogle(): Result<GoogleIdTokenCredential> = withContext(Dispatchers.Main) {
        val activity = context.findActivity()
        if (activity == null) {
            Log.e("GoogleAuthHelper", "Activity context not found for CredentialManager")
            return@withContext Result.failure(IllegalStateException("Unable to start Google Sign-In: Activity context unavailable."))
        }

        try {
            val googleIdOption: GetGoogleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(WEB_CLIENT_ID)
                .setAutoSelectEnabled(false)
                .build()

            val signInWithGoogleOption = try {
                GetSignInWithGoogleOption.Builder(WEB_CLIENT_ID)
                    .build()
            } catch (e: Exception) {
                null
            }

            val requestBuilder = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)

            if (signInWithGoogleOption != null) {
                requestBuilder.addCredentialOption(signInWithGoogleOption)
            }

            val request: GetCredentialRequest = requestBuilder.build()

            val result = credentialManager.getCredential(
                request = request,
                context = activity
            )
            
            handleSignIn(result)
        } catch (e: GetCredentialCancellationException) {
            Log.i("GoogleAuthHelper", "User cancelled Google Sign-In flow")
            Result.failure(e)
        } catch (e: NoCredentialException) {
            Log.e("GoogleAuthHelper", "No credentials available on this device", e)
            Result.failure(IllegalStateException("No Google accounts found or client not configured in Google Console for this package."))
        } catch (e: GetCredentialException) {
            Log.e("GoogleAuthHelper", "GetCredentialException during Google Sign-In: ${e.message}", e)
            Result.failure(e)
        } catch (e: Exception) {
            Log.e("GoogleAuthHelper", "Unexpected exception during Google Sign-In: ${e.message}", e)
            Result.failure(e)
        }
    }

    private fun handleSignIn(result: GetCredentialResponse): Result<GoogleIdTokenCredential> {
        return try {
            val credential = result.credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                Result.success(googleIdTokenCredential)
            } else {
                Log.e("GoogleAuthHelper", "Unexpected credential type: ${credential.type}")
                Result.failure(RuntimeException("Unexpected type of credential: ${credential.type}"))
            }
        } catch (e: Exception) {
            Log.e("GoogleAuthHelper", "Failed to parse Google ID Token Credential", e)
            Result.failure(e)
        }
    }
}
