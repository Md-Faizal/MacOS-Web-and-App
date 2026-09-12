package com.example.macosbusinesssuite.data.api

import android.content.Context
import android.content.SharedPreferences
import com.example.macosbusinesssuite.data.model.RememberedUser
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class MultiUserManager(private val context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        private const val PREF_NAME = "macos_multi_user_prefs"
        private const val KEY_REMEMBERED_USERS = "macos_remembered_users_json"
        private const val KEY_ACTIVE_USER_ID = "macos_active_user_id"
        private const val PREFIX_DISMISSED_PROMPT = "macos_prompt_dismissed_"
    }

    init {
        migrateLegacyStorage()
    }

    /**
     * Migrates legacy single-user storage if available and no multi-user profile exists yet.
     */
    private fun migrateLegacyStorage() {
        try {
            val sessionPrefs = context.getSharedPreferences("macos_business_suite_prefs", Context.MODE_PRIVATE)
            val isRemembered = sessionPrefs.getBoolean("keep_logged_in", false)
            val legacyId = sessionPrefs.getString("user_id", null)
            val legacyIdentifier = sessionPrefs.getString("user_email", null)?.takeIf { it.isNotBlank() }
                ?: sessionPrefs.getString("user_name", null)
            val legacyName = sessionPrefs.getString("user_name", null) ?: legacyIdentifier
            val legacyPicture = sessionPrefs.getString("user_picture", null)
            val legacyRole = sessionPrefs.getString("user_role", "user") ?: "user"
            val biometricEnabled = sessionPrefs.getBoolean("biometric_enabled", false)

            val currentUsers = getUsers()
            if (isRemembered && !legacyIdentifier.isNullOrBlank() && currentUsers.isEmpty()) {
                val userId = legacyId ?: ("usr_" + System.currentTimeMillis().toString(36))
                val migratedUser = RememberedUser(
                    id = userId,
                    identifier = legacyIdentifier,
                    displayName = legacyName ?: legacyIdentifier,
                    displayPicture = legacyPicture,
                    role = legacyRole,
                    isBiometricEnabled = biometricEnabled,
                    lastActive = System.currentTimeMillis()
                )
                saveUsers(listOf(migratedUser))
                setActiveUserId(migratedUser.id)
            }
        } catch (e: Exception) {
            android.util.Log.w("MultiUserManager", "Legacy migration check failed", e)
        }
    }

    /**
     * Returns all remembered users sorted by lastActive descending without duplicate accounts.
     */
    fun getUsers(): List<RememberedUser> {
        return try {
            val raw = prefs.getString(KEY_REMEMBERED_USERS, null)
            if (raw.isNullOrBlank()) return emptyList()
            val type = object : TypeToken<List<RememberedUser>>() {}.type
            val list: List<RememberedUser> = gson.fromJson(raw, type) ?: emptyList()
            list.sortedByDescending { it.lastActive }
                .distinctBy { user ->
                    val cleanId = user.identifier.trim().lowercase()
                    if (cleanId.isNotBlank()) cleanId else user.id
                }
        } catch (e: Exception) {
            android.util.Log.e("MultiUserManager", "Failed to parse remembered users", e)
            emptyList()
        }
    }

    /**
     * Saves the entire list of remembered users.
     */
    fun saveUsers(users: List<RememberedUser>) {
        try {
            val deduplicated = users.sortedByDescending { it.lastActive }
                .distinctBy { user ->
                    val cleanId = user.identifier.trim().lowercase()
                    if (cleanId.isNotBlank()) cleanId else user.id
                }
            val json = gson.toJson(deduplicated)
            prefs.edit().putString(KEY_REMEMBERED_USERS, json).apply()
        } catch (e: Exception) {
            android.util.Log.e("MultiUserManager", "Failed to save remembered users", e)
        }
    }

    /**
     * Gets the currently active selected user or the most recently active.
     */
    fun getActiveUser(): RememberedUser? {
        val users = getUsers()
        if (users.isEmpty()) return null
        val activeId = prefs.getString(KEY_ACTIVE_USER_ID, null)
        if (!activeId.isNullOrBlank()) {
            val found = users.find { it.id == activeId || it.identifier.equals(activeId, ignoreCase = true) }
            if (found != null) return found
        }
        return users.first()
    }

    /**
     * Sets the active user by ID or identifier and refreshes lastActive.
     */
    fun setActiveUserId(idOrIdentifier: String): RememberedUser? {
        val users = getUsers().toMutableList()
        val index = users.indexOfFirst {
            it.id == idOrIdentifier || it.identifier.equals(idOrIdentifier, ignoreCase = true)
        }
        if (index != -1) {
            val updated = users[index].copy(lastActive = System.currentTimeMillis())
            users[index] = updated
            saveUsers(users)
            prefs.edit().putString(KEY_ACTIVE_USER_ID, updated.id).apply()
            return updated
        }
        return null
    }

    /**
     * Checks if a user is already saved.
     */
    fun isUserRemembered(identifier: String?, id: String? = null): Boolean {
        val users = getUsers()
        val norm = identifier?.trim()?.lowercase() ?: ""
        return users.any { u ->
            (!id.isNullOrBlank() && u.id == id) ||
            (norm.isNotBlank() && u.identifier.trim().lowercase() == norm)
        }
    }

    /**
     * Adds or updates a user profile.
     */
    fun saveUser(userData: RememberedUser): RememberedUser {
        val users = getUsers().toMutableList()
        val identifier = userData.identifier.trim()
        val normId = identifier.lowercase()

        val existingIndex = users.indexOfFirst {
            (userData.id.isNotBlank() && it.id == userData.id) ||
            (normId.isNotBlank() && it.identifier.trim().lowercase() == normId)
        }

        val id = if (existingIndex != -1) {
            users[existingIndex].id
        } else if (userData.id.isNotBlank()) {
            userData.id
        } else {
            "usr_" + System.currentTimeMillis().toString(36)
        }

        val profile = if (existingIndex != -1) {
            val prev = users[existingIndex]
            prev.copy(
                id = prev.id,
                identifier = if (identifier.isNotBlank()) identifier else prev.identifier,
                displayName = if (userData.displayName.isNotBlank()) userData.displayName else prev.displayName,
                displayPicture = userData.displayPicture ?: prev.displayPicture,
                role = if (userData.role.isNotBlank()) userData.role else prev.role,
                isBiometricEnabled = userData.isBiometricEnabled,
                lastActive = System.currentTimeMillis(),
                savedAuthToken = userData.savedAuthToken ?: prev.savedAuthToken,
                savedRefreshToken = userData.savedRefreshToken ?: prev.savedRefreshToken
            )
        } else {
            userData.copy(
                id = id,
                identifier = identifier,
                displayName = if (userData.displayName.isNotBlank()) userData.displayName else identifier.substringBefore('@'),
                lastActive = System.currentTimeMillis()
            )
        }

        if (existingIndex != -1) {
            users[existingIndex] = profile
        } else {
            users.add(profile)
        }

        saveUsers(users)
        prefs.edit().putString(KEY_ACTIVE_USER_ID, profile.id).apply()
        return profile
    }

    /**
     * Updates fields of a specific user.
     */
    fun updateUserProfile(idOrIdentifier: String, updates: (RememberedUser) -> RememberedUser): RememberedUser? {
        val users = getUsers().toMutableList()
        val index = users.indexOfFirst {
            it.id == idOrIdentifier || it.identifier.equals(idOrIdentifier, ignoreCase = true)
        }
        if (index != -1) {
            val updated = updates(users[index])
            users[index] = updated
            saveUsers(users)
            return updated
        }
        return null
    }

    /**
     * Removes a user from remembered list.
     */
    fun removeUser(idOrIdentifier: String): Boolean {
        val users = getUsers().toMutableList()
        val initialSize = users.size
        val filtered = users.filterNot {
            it.id == idOrIdentifier || it.identifier.equals(idOrIdentifier, ignoreCase = true)
        }

        if (filtered.size != initialSize) {
            saveUsers(filtered)
            val activeId = prefs.getString(KEY_ACTIVE_USER_ID, null)
            if (activeId == idOrIdentifier) {
                if (filtered.isNotEmpty()) {
                    setActiveUserId(filtered.first().id)
                } else {
                    prefs.edit().remove(KEY_ACTIVE_USER_ID).apply()
                }
            }
            return true
        }
        return false
    }

    /**
     * Clears all remembered accounts from device.
     */
    fun clearAllUsers() {
        saveUsers(emptyList())
        prefs.edit().remove(KEY_ACTIVE_USER_ID).apply()
    }

    /**
     * Checks if a prompt (e.g. remember account, biometric setup) has been dismissed with "Don't ask again".
     */
    fun isPromptDismissed(promptType: String, identifier: String): Boolean {
        val key = PREFIX_DISMISSED_PROMPT + promptType + "_" + identifier.trim().lowercase()
        return prefs.getBoolean(key, false)
    }

    /**
     * Sets dismissal flag for a prompt.
     */
    fun setPromptDismissed(promptType: String, identifier: String, dismissed: Boolean = true) {
        val key = PREFIX_DISMISSED_PROMPT + promptType + "_" + identifier.trim().lowercase()
        prefs.edit().putBoolean(key, dismissed).apply()
    }
}
