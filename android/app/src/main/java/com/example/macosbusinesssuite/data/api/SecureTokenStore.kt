package com.example.macosbusinesssuite.data.api

import android.content.Context
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureTokenStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREF_NAME = "macos_secure_auth"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "macos_auth_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_LENGTH = 12
        private const val TAG_LENGTH = 128
    }

    private fun key(): SecretKey? {
        return try {
            val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
            val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
            if (existing != null) return existing

            val generator = KeyGenerator.getInstance("AES", KEYSTORE)
            generator.init(
                android.security.keystore.KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or
                        android.security.keystore.KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build()
            )
            generator.generateKey()
        } catch (e: Exception) {
            android.util.Log.w("SecureTokenStore", "AndroidKeyStore unavailable in current profile: ${e.localizedMessage}")
            null
        }
    }

    fun get(name: String): String? {
        val encoded = prefs.getString(name, null) ?: return null
        return try {
            val k = key() ?: return null
            val payload = Base64.decode(encoded, Base64.NO_WRAP)
            if (payload.size <= IV_LENGTH) return null
            val iv = payload.copyOfRange(0, IV_LENGTH)
            val ciphertext = payload.copyOfRange(IV_LENGTH, payload.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, k, GCMParameterSpec(TAG_LENGTH, iv))
            String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
        } catch (e: Exception) {
            android.util.Log.w("SecureTokenStore", "Failed to decrypt $name, falling back", e)
            null
        }
    }

    fun put(name: String, value: String?): Boolean {
        if (value == null) {
            prefs.edit().remove(name).apply()
            return true
        }
        return try {
            val k = key() ?: return false
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, k)
            val iv = cipher.iv
            if (iv == null || iv.isEmpty()) {
                android.util.Log.e("SecureTokenStore", "Generated IV is null or empty")
                return false
            }
            val ciphertext = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
            prefs.edit().putString(name, Base64.encodeToString(iv + ciphertext, Base64.NO_WRAP)).apply()
            true
        } catch (e: Exception) {
            android.util.Log.e("SecureTokenStore", "Failed to encrypt $name with KeyStore: ${e.localizedMessage}")
            false
        }
    }

    fun migratePlaintext(name: String, plaintext: String?) {
        if (!plaintext.isNullOrEmpty() && get(name) == null) {
            put(name, plaintext)
        }
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
